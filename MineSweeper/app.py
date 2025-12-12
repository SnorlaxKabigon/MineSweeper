from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import os
from datetime import datetime, timedelta

# 遊ぶには
# python app.py

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-this'

# # データベース設定の変更
# database_url = os.environ.get('DATABASE_URL', 'sqlite:///minesweeper.db')
# if database_url.startswith("postgres://"):
#     database_url = database_url.replace("postgres://", "postgresql://", 1)

# app.config['SQLALCHEMY_DATABASE_URI'] = database_url
# app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///minesweeper.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    coins = db.Column(db.Integer, default=0)
    current_skin = db.Column(db.String(50), default='default')
    # Store owned skins as a comma-separated string for simplicity
    owned_skins = db.Column(db.String(500), default='default')
    
    # Stats & Achievements
    games_played = db.Column(db.Integer, default=0)
    games_won = db.Column(db.Integer, default=0)
    mines_hit = db.Column(db.Integer, default=0)
    current_title = db.Column(db.String(100), default='')
    unlocked_titles = db.Column(db.String(1000), default='') # Comma separated
    achievements_claimed = db.Column(db.String(500), default='') # Comma separated IDs like 'play_10', 'play_20'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    difficulty = db.Column(db.String(20), nullable=False)
    time_taken = db.Column(db.Integer, nullable=False)
    date = db.Column(db.DateTime, default=lambda: datetime.utcnow() + timedelta(hours=9))

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 400
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    user = User(username=data['username'], email=data['email'])
    user.set_password(data['password'])
    db.session.add(user)
    db.session.commit()
    login_user(user)
    return jsonify({
        'message': 'Registered successfully', 
        'user': {
            'username': user.username, 
            'coins': user.coins,
            'current_skin': user.current_skin,
            'current_title': user.current_title
        }
    })

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(email=data['email']).first() 
    if user and user.check_password(data['password']):
        login_user(user)
        return jsonify({
            'message': 'Logged in successfully', 
            'user': {
                'username': user.username, 
                'coins': user.coins, 
                'current_skin': user.current_skin,
                'current_title': user.current_title
            }
        })
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Logged out'})

@app.route('/api/user', methods=['GET'])
def get_user():
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'username': current_user.username,
            'coins': current_user.coins,
            'current_skin': current_user.current_skin,
            'owned_skins': current_user.owned_skins.split(','),
            'current_title': current_user.current_title
        })
    return jsonify({'authenticated': False})

def check_achievements(user):
    # Play Count Achievements
    play_rewards = {10: 10, 20: 10, 50: 20, 100: 100}
    claimed = user.achievements_claimed.split(',') if user.achievements_claimed else []
    
    for count, reward in play_rewards.items():
        ach_id = f'play_{count}'
        if user.games_played >= count and ach_id not in claimed:
            user.coins += reward
            claimed.append(ach_id)
    
    user.achievements_claimed = ','.join(filter(None, claimed))

    # Titles
    unlocked = user.unlocked_titles.split(',') if user.unlocked_titles else []
    new_title = None

    # Explosions
    if user.mines_hit >= 50:
        title = "The Hot Topic Bomberman"
        if title not in unlocked:
            unlocked.append(title)
            # Special title might not auto-equip, or maybe it does? Let's auto-equip if it's the first one or special.
            # But user might prefer "Master". Let's just unlock it.
            # Requirement says "grant a title". I'll set it if no title is set.
            if not user.current_title:
                user.current_title = title

    # Clear Count
    clear_titles = {
        1: "Bomb Disposal Rookie",
        10: "Bomb Disposal Novice",
        20: "Bomb Disposal Intermediate",
        50: "Bomb Disposal Expert",
        100: "Bomb Disposal Master"
    }
    
    # Determine the highest rank title earned
    highest_rank_title = ""
    for count, title in sorted(clear_titles.items()):
        if user.games_won >= count:
            if title not in unlocked:
                unlocked.append(title)
            highest_rank_title = title
    
    # Auto-equip the highest rank clear title if it's better than current?
    # Or just let the user choose? The prompt implies automatic granting.
    # I'll update current_title to the highest rank clear title, unless they have the Bomberman one?
    # Let's prioritize the "Master" path for current_title updates.
    if highest_rank_title:
        # If current title is empty or one of the lower rank titles, update it.
        # If current title is "The Hot Topic Bomberman", maybe keep it?
        # Let's just update to the latest clear title for now.
        if user.current_title != "The Hot Topic Bomberman" or user.games_won >= 100: # Master overrides Bomberman?
             user.current_title = highest_rank_title

    user.unlocked_titles = ','.join(filter(None, unlocked))

@app.route('/api/user/title', methods=['POST'])
@login_required
def set_title():
    data = request.json
    title = data.get('title')
    
    unlocked = current_user.unlocked_titles.split(',') if current_user.unlocked_titles else []
    
    if title in unlocked:
        current_user.current_title = title
        db.session.commit()
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'error': 'Title not unlocked'})

@app.route('/api/game/fail', methods=['POST'])
@login_required
def fail_game():
    current_user.games_played += 1
    current_user.mines_hit += 1
    check_achievements(current_user)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/user/achievements', methods=['GET'])
@login_required
def get_achievements():
    return jsonify({
        'unlocked_titles': current_user.unlocked_titles.split(',') if current_user.unlocked_titles else [],
        'games_played': current_user.games_played,
        'games_won': current_user.games_won,
        'mines_hit': current_user.mines_hit
    })

@app.route('/api/game/finish', methods=['POST'])
@login_required
def finish_game():
    data = request.json
    difficulty = data.get('difficulty')
    try:
        time_taken = int(data.get('time'))
    except (ValueError, TypeError):
        time_taken = 9999 # Error case

    print(f"DEBUG: Difficulty={difficulty}, Time={time_taken}")
    
    coins_earned = 0
    
    if difficulty == 'easy':
        if time_taken <= 30:
            coins_earned = 10
        elif time_taken <= 60:
            coins_earned = 5
        else:
            coins_earned = 1
    elif difficulty == 'normal':
        if time_taken <= 90:
            coins_earned = 20
        elif time_taken <= 180:
            coins_earned = 10
        else:
            coins_earned = 5
    elif difficulty == 'hard':
        if time_taken <= 600:
            coins_earned = 30
        elif time_taken <= 900:
            coins_earned = 15
        else:
            coins_earned = 10
        
    print(f"DEBUG: Coins Earned={coins_earned}")

    current_user.coins += coins_earned
    current_user.games_played += 1
    current_user.games_won += 1
    check_achievements(current_user)
    
    score = Score(user_id=current_user.id, difficulty=difficulty, time_taken=time_taken)
    db.session.add(score)
    
    db.session.commit()
    
    return jsonify({'coins_earned': coins_earned, 'total_coins': current_user.coins})

@app.route('/api/game/recover', methods=['POST'])
@login_required
def recover_game():
    if current_user.coins >= 20:
        current_user.coins -= 20
        db.session.commit()
        return jsonify({'success': True, 'new_balance': current_user.coins})
    return jsonify({'success': False, 'error': 'Not enough coins'}), 400

@app.route('/api/shop/buy', methods=['POST'])
@login_required
def buy_skin():
    data = request.json
    skin_id = data.get('skin_id')
    cost = data.get('cost')
    
    if skin_id in current_user.owned_skins.split(','):
        return jsonify({'success': False, 'error': 'Already owned'})
        
    if current_user.coins >= cost:
        current_user.coins -= cost
        current_user.owned_skins += f",{skin_id}"
        db.session.commit()
        return jsonify({'success': True, 'new_balance': current_user.coins})
    return jsonify({'success': False, 'error': 'Not enough coins'})

@app.route('/api/user/skin', methods=['POST'])
@login_required
def set_skin():
    data = request.json
    skin_id = data.get('skin_id')
    
    if skin_id in current_user.owned_skins.split(','):
        current_user.current_skin = skin_id
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Skin not owned'})

@app.route('/api/rankings/<difficulty>', methods=['GET'])
def get_rankings(difficulty):
    # Subquery to find the best time for each user
    subq = db.session.query(
        Score.user_id,
        db.func.min(Score.time_taken).label('min_time')
    ).filter(Score.difficulty == difficulty).group_by(Score.user_id).subquery()

    # Query to get the score details, joining with the subquery
    scores = db.session.query(Score, User).join(User).join(
        subq,
        (Score.user_id == subq.c.user_id) & (Score.time_taken == subq.c.min_time)
    ).filter(Score.difficulty == difficulty).group_by(User.id).order_by(Score.time_taken.asc()).limit(10).all()

    ranking_data = []
    for score, user in scores:
        ranking_data.append({
            'username': user.username,
            'time': score.time_taken,
            'date': score.date.strftime('%Y-%m-%d %H:%M')
        })
    return jsonify(ranking_data)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0')
