from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-this'
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

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    difficulty = db.Column(db.String(20), nullable=False)
    time_taken = db.Column(db.Integer, nullable=False)
    date = db.Column(db.DateTime, default=db.func.current_timestamp())

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
    return jsonify({'message': 'Registered successfully', 'user': {'username': user.username, 'coins': user.coins}})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(email=data['email']).first() # Login with email as per requirements? Or username? Requirement says "register email and username", usually login is one of them. I'll support email.
    if user and user.check_password(data['password']):
        login_user(user)
        return jsonify({'message': 'Logged in successfully', 'user': {'username': user.username, 'coins': user.coins, 'current_skin': user.current_skin}})
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
            'owned_skins': current_user.owned_skins.split(',')
        })
    return jsonify({'authenticated': False})

@app.route('/api/game/finish', methods=['POST'])
@login_required
def finish_game():
    data = request.json
    difficulty = data.get('difficulty')
    time_taken = data.get('time') # in seconds
    
    coins_earned = 0
    
    if difficulty == 'easy':
        if time_taken <= 5: coins_earned = 10
        elif time_taken <= 10: coins_earned = 5
        else: coins_earned = 1
    elif difficulty == 'normal':
        if time_taken <= 90: coins_earned = 20
        elif time_taken <= 180: coins_earned = 10
        else: coins_earned = 5
    elif difficulty == 'hard':
        if time_taken <= 600: coins_earned = 30
        elif time_taken <= 900: coins_earned = 15
        else: coins_earned = 10
        
    current_user.coins += coins_earned
    
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

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0')
