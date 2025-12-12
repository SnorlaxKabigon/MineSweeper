// Game Configuration
const CONFIG = {
    easy: { rows: 9, cols: 9, mines: 10 },
    normal: { rows: 16, cols: 16, mines: 40 },
    hard: { rows: 32, cols: 32, mines: 200 }
};

const SKINS = [
    { id: 'default', icon: '🙂', cost: 0 },
    { id: 'chee', icon: '🤓', cost: 1 },
    { id: 'sleep', icon: '😴', cost: 10 },
    { id: 'alien', icon: '👽', cost: 200 },
    { id: 'robot', icon: '🤖', cost: 500 },
    { id: 'devil', icon: '😈', cost: 1000 }
];

// State
let currentState = {
    difficulty: 'easy',
    board: [], // { isMine, revealed, flagged, question, neighborCount }
    minesLocations: [],
    mistakes: 0,
    gameOver: false,
    timer: 0,
    timerInterval: null,
    firstClick: true,
    mode: 'dig', // 'dig' or 'flag'
    user: null // { username, coins, current_skin, owned_skins }
};

// DOM Elements
const boardEl = document.getElementById('game-board');
const timeDisplay = document.getElementById('time-display');
const minesDisplay = document.getElementById('mines-display');
const smileyBtn = document.getElementById('smiley-face');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    checkUserSession();
    // initGame('easy'); // Don't init game until logged in
    setupEventListeners();
});

function setupEventListeners() {
    // Header Buttons
    document.getElementById('settings-btn').addEventListener('click', () => showModal('settings-modal'));
    document.getElementById('ranking-btn').addEventListener('click', () => {
        showModal('ranking-modal');
        fetchRankings('easy');
    });
    document.getElementById('achievements-btn').addEventListener('click', () => {
        showModal('achievements-modal');
        fetchAchievements();
    });
    document.getElementById('user-btn').addEventListener('click', () => {
        if (currentState.user) {
            updateUIWithUser();
            showModal('user-modal');
        } else {
            showModal('auth-modal');
        }
    });
    smileyBtn.addEventListener('click', () => initGame(currentState.difficulty));

    // Mode Toggle Buttons
    const digBtn = document.getElementById('mode-dig');
    const flagBtn = document.getElementById('mode-flag');

    digBtn.addEventListener('click', () => {
        currentState.mode = 'dig';
        digBtn.classList.add('active');
        flagBtn.classList.remove('active');
    });

    flagBtn.addEventListener('click', () => {
        currentState.mode = 'flag';
        flagBtn.classList.add('active');
        digBtn.classList.remove('active');
    });

    // Modals
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.add('hidden');
        });
    });

    // Auth
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const tab = e.target.dataset.tab;
            if (tab === 'login') {
                document.getElementById('login-form').classList.remove('hidden');
                document.getElementById('register-form').classList.add('hidden');
            } else {
                document.getElementById('login-form').classList.add('hidden');
                document.getElementById('register-form').classList.remove('hidden');
            }
        });
    });

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Settings
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const diff = e.target.dataset.diff;
            initGame(diff);
            document.getElementById('settings-modal').classList.add('hidden');
        });
    });

    // Rankings
    document.querySelectorAll('.rank-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.rank-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            fetchRankings(e.target.dataset.diff);
        });
    });

    // Game Over / Recovery
    document.getElementById('recover-btn').addEventListener('click', handleRecovery);
    document.getElementById('give-up-btn').addEventListener('click', () => {
        document.getElementById('game-over-modal').classList.add('hidden');
        revealAll();
    });
    document.getElementById('restart-btn').addEventListener('click', () => {
        document.getElementById('game-over-modal').classList.add('hidden');
        initGame(currentState.difficulty);
    });

    document.getElementById('back-to-game-btn').addEventListener('click', () => {
        document.getElementById('game-over-modal').classList.add('hidden');
    });

    // Shop
    document.getElementById('shop-btn').addEventListener('click', () => {
        renderShop();
        document.getElementById('user-modal').classList.add('hidden');
        showModal('shop-modal');
    });
}

// Game Logic
function initGame(difficulty) {
    currentState.difficulty = difficulty;
    currentState.mistakes = 0;
    currentState.gameOver = false;
    currentState.firstClick = true;
    currentState.timer = 0;
    clearInterval(currentState.timerInterval);
    timeDisplay.textContent = '0';
    
    const config = CONFIG[difficulty];
    minesDisplay.textContent = config.mines;
    
    // Create Board
    boardEl.style.gridTemplateColumns = `repeat(${config.cols}, var(--cell-size))`;
    boardEl.innerHTML = '';
    currentState.board = [];

    for (let i = 0; i < config.rows * config.cols; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;
        
        // Touch/Click Handling
        cell.addEventListener('click', () => handleCellClick(i));
        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleCellRightClick(i);
        });
        
        // Removed long press simulation as per user request

        boardEl.appendChild(cell);
        currentState.board.push({
            isMine: false,
            revealed: false,
            flagged: false,
            question: false,
            neighborCount: 0
        });
    }
}

function startTimer() {
    currentState.timerInterval = setInterval(() => {
        currentState.timer++;
        timeDisplay.textContent = currentState.timer;
    }, 1000);
}

function placeMines(excludeIndex) {
    const config = CONFIG[currentState.difficulty];
    let minesPlaced = 0;
    const totalCells = config.rows * config.cols;
    
    while (minesPlaced < config.mines) {
        const idx = Math.floor(Math.random() * totalCells);
        if (idx !== excludeIndex && !currentState.board[idx].isMine) {
            currentState.board[idx].isMine = true;
            minesPlaced++;
        }
    }
    
    // Calculate neighbors
    for (let i = 0; i < totalCells; i++) {
        if (!currentState.board[i].isMine) {
            currentState.board[i].neighborCount = countMinesAround(i, config.rows, config.cols);
        }
    }
}

function countMinesAround(index, rows, cols) {
    let count = 0;
    const r = Math.floor(index / cols);
    const c = index % cols;
    
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const nIdx = nr * cols + nc;
                if (currentState.board[nIdx].isMine) count++;
            }
        }
    }
    return count;
}

function handleCellClick(index) {
    if (currentState.gameOver) return;

    // If in flag mode, toggle flag instead of revealing
    if (currentState.mode === 'flag') {
        handleCellRightClick(index);
        return;
    }

    if (currentState.board[index].flagged || currentState.board[index].question) return;
    
    if (currentState.firstClick) {
        placeMines(index);
        currentState.firstClick = false;
        startTimer();
    }
    
    const cellData = currentState.board[index];
    if (cellData.revealed) return;
    
    if (cellData.isMine) {
        handleMineHit(index);
    } else {
        revealCell(index);
        checkWin();
    }
}

function handleCellRightClick(index) {
    if (currentState.gameOver || currentState.board[index].revealed) return;
    
    const cellData = currentState.board[index];
    const cellEl = boardEl.children[index];
    const config = CONFIG[currentState.difficulty];
    
    if (!cellData.flagged && !cellData.question) {
        cellData.flagged = true;
        cellEl.classList.add('flag');
        cellEl.innerHTML = '<i class="fas fa-flag"></i>';
        updateMinesCounter(-1);
    } else if (cellData.flagged) {
        cellData.flagged = false;
        cellData.question = true;
        cellEl.classList.remove('flag');
        cellEl.classList.add('question');
        cellEl.textContent = '?';
        updateMinesCounter(1);
    } else {
        cellData.question = false;
        cellEl.classList.remove('question');
        cellEl.textContent = '';
    }
}

function updateMinesCounter(change) {
    const currentMines = parseInt(minesDisplay.textContent);
    minesDisplay.textContent = currentMines + change;
}

function revealCell(index) {
    const cellData = currentState.board[index];
    if (cellData.revealed || cellData.flagged || cellData.question) return;
    
    cellData.revealed = true;
    const cellEl = boardEl.children[index];
    cellEl.classList.add('revealed');
    
    if (cellData.neighborCount > 0) {
        cellEl.textContent = cellData.neighborCount;
        // Color coding
        const colors = ['blue', 'green', 'red', 'darkblue', 'brown', 'cyan', 'black', 'gray'];
        cellEl.style.color = colors[cellData.neighborCount - 1];
    } else {
        // Flood fill
        const config = CONFIG[currentState.difficulty];
        const r = Math.floor(index / config.cols);
        const c = index % config.cols;
        
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < config.rows && nc >= 0 && nc < config.cols) {
                    revealCell(nr * config.cols + nc);
                }
            }
        }
    }
}

function handleMineHit(index) {
    const cellEl = boardEl.children[index];
    cellEl.classList.add('revealed', 'mine');
    cellEl.innerHTML = '<i class="fas fa-bomb"></i>';
    currentState.board[index].revealed = true;
    
    currentState.mistakes++;
    if (currentState.mistakes >= 3) {
        gameOver(false);
    } else {
        // Check if win condition is met even after hitting a mine (if mistakes < 3)
        // But wait, if you hit a mine, that cell is revealed.
        // The win condition is "revealedCount === totalCells - config.mines".
        // If you reveal a mine, it counts towards revealedCount in the current logic?
        // Let's check checkWin logic.
        checkWin();
    }
}

function checkWin() {
    const config = CONFIG[currentState.difficulty];
    const totalCells = config.rows * config.cols;
    let revealedSafeCells = 0;
    
    currentState.board.forEach(cell => {
        if (cell.revealed && !cell.isMine) {
            revealedSafeCells++;
        }
    });
    
    // Win if all safe cells are revealed.
    // Mines don't need to be flagged, just all safe cells revealed.
    if (revealedSafeCells === totalCells - config.mines) {
        gameOver(true);
    }
}

function gameOver(win) {
    currentState.gameOver = true;
    clearInterval(currentState.timerInterval);
    
    if (!win) {
        // Record loss
        fetch('/api/game/fail', { method: 'POST' });
    }

    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const msg = document.getElementById('game-over-message');
    const recoveryOpts = document.getElementById('recovery-options');
    const restartBtn = document.getElementById('restart-btn');
    const backToGameBtn = document.getElementById('back-to-game-btn');
    
    modal.classList.remove('hidden');
    
    if (win) {
        title.textContent = "You Win!";
        msg.textContent = `Time: ${currentState.timer}s`;
        recoveryOpts.classList.add('hidden');
        restartBtn.classList.remove('hidden');
        backToGameBtn.classList.remove('hidden');
        
        if (currentState.user) {
            submitScore();
        }
    } else {
        title.textContent = "Game Over";
        msg.textContent = "You hit 3 mines!";
        restartBtn.classList.add('hidden');
        backToGameBtn.classList.add('hidden');
        
        if (currentState.user && currentState.user.coins >= 20) {
            recoveryOpts.classList.remove('hidden');
        } else {
            recoveryOpts.classList.add('hidden');
            restartBtn.classList.remove('hidden');
            backToGameBtn.classList.remove('hidden');
        }
    }
}

function revealAll() {
    currentState.board.forEach((cell, idx) => {
        if (cell.isMine) {
            const el = boardEl.children[idx];
            el.classList.add('revealed', 'mine');
            el.innerHTML = '<i class="fas fa-bomb"></i>';
        }
    });
}

// API Interactions
async function checkUserSession() {
    try {
        const res = await fetch('/api/user');
        const data = await res.json();
        if (data.authenticated) {
            currentState.user = data;
            updateUIWithUser();
            initGame('easy'); // Start game only after login
        } else {
            showModal('auth-modal');
            // Prevent closing auth modal if not logged in
            document.querySelector('#auth-modal .close-modal').style.display = 'none';
        }
    } catch (e) {
        console.error(e);
    }
}

function updateUIWithUser() {
    if (!currentState.user) {
        console.warn('updateUIWithUser called but no user in state');
        return;
    }

    console.log('Updating UI with user:', currentState.user);

    const nameEl = document.getElementById('profile-name');
    if (nameEl) {
        nameEl.textContent = currentState.user.username || 'Guest';
    }

    const coinsEl = document.getElementById('profile-coins');
    if (coinsEl) {
        coinsEl.textContent = currentState.user.coins !== undefined ? currentState.user.coins : 0;
    }
    
    const titleEl = document.getElementById('profile-title');
    if (titleEl) {
        if (currentState.user.current_title) {
            titleEl.textContent = currentState.user.current_title;
            titleEl.style.display = 'block';
            titleEl.style.color = '#d35400'; // Force color
            titleEl.classList.remove('hidden');
        } else {
            titleEl.textContent = 'No Title Equipped';
            titleEl.style.display = 'block';
            titleEl.style.color = '#ccc';
            titleEl.classList.remove('hidden');
        }
    }
    
    // Update skin
    const skin = SKINS.find(s => s.id === currentState.user.current_skin);
    if (skin) {
        smileyBtn.textContent = skin.icon;
    }
}

async function fetchAchievements() {
    const list = document.getElementById('achievements-list');
    list.innerHTML = '<p>Loading...</p>';
    try {
        const res = await fetch('/api/user/achievements');
        const data = await res.json();
        
        list.innerHTML = '';
        
        // Stats
        const statsDiv = document.createElement('div');
        statsDiv.className = 'stats-summary';
        statsDiv.innerHTML = `
            <p>Games Played: ${data.games_played}</p>
            <p>Games Won: ${data.games_won}</p>
            <p>Mines Hit: ${data.mines_hit}</p>
        `;
        list.appendChild(statsDiv);

        // Titles
        const titlesDiv = document.createElement('div');
        titlesDiv.innerHTML = '<h3>Unlocked Titles (Click to Equip)</h3>';
        if (data.unlocked_titles.length === 0) {
            titlesDiv.innerHTML += '<p>No titles yet.</p>';
        } else {
            const ul = document.createElement('ul');
            ul.className = 'titles-list';
            data.unlocked_titles.forEach(title => {
                const li = document.createElement('li');
                li.textContent = title;
                li.className = 'title-item';
                
                if (title === currentState.user.current_title) {
                    li.classList.add('equipped');
                    li.textContent += ' (Equipped)';
                }
                
                li.addEventListener('click', async () => {
                    const res = await fetch('/api/user/title', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ title: title })
                    });
                    const result = await res.json();
                    if (result.success) {
                        currentState.user.current_title = title;
                        updateUIWithUser();
                        fetchAchievements(); // Refresh list
                    }
                });
                
                ul.appendChild(li);
            });
            titlesDiv.appendChild(ul);
        }
        list.appendChild(titlesDiv);

    } catch (e) {
        console.error(e);
        list.innerHTML = '<p>Error loading achievements.</p>';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;
    
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
        currentState.user = data.user;
        updateUIWithUser();
        document.getElementById('auth-modal').classList.add('hidden');
        // Refresh full user data to get skins
        checkUserSession();
        // Re-enable close button
        document.querySelector('#auth-modal .close-modal').style.display = 'block';
    } else {
        alert(data.error);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = e.target.querySelector('input[type="text"]').value;
    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;
    
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (res.ok) {
        currentState.user = data.user;
        updateUIWithUser();
        document.getElementById('auth-modal').classList.add('hidden');
        checkUserSession();
        // Re-enable close button
        document.querySelector('#auth-modal .close-modal').style.display = 'block';
    } else {
        alert(data.error);
    }
}

async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    currentState.user = null;
    document.getElementById('user-modal').classList.add('hidden');
    smileyBtn.textContent = '😊'; // Reset skin
    alert('Logged out');
}

async function submitScore() {
    const res = await fetch('/api/game/finish', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            difficulty: currentState.difficulty,
            time: currentState.timer
        })
    });
    const data = await res.json();
    currentState.user.coins = data.total_coins;
    alert(`You earned ${data.coins_earned} coins! Total: ${data.total_coins}`);
}

async function handleRecovery() {
    const res = await fetch('/api/game/recover', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        currentState.user.coins = data.new_balance;
        currentState.mistakes = 2; // Reset to 2 mistakes (1 life left)
        currentState.gameOver = false;
        startTimer(); // Resume timer
        document.getElementById('game-over-modal').classList.add('hidden');
    } else {
        alert('Failed to recover: ' + data.error);
    }
}

// Shop & UI
// updateUIWithUser is defined above


function renderShop() {
    const list = document.getElementById('skin-list');
    list.innerHTML = '';
    const owned = currentState.user.owned_skins || [];
    
    SKINS.forEach(skin => {
        const item = document.createElement('div');
        item.classList.add('skin-item');
        const isOwned = owned.includes(skin.id);
        const isSelected = currentState.user.current_skin === skin.id;
        
        if (isOwned) item.classList.add('owned');
        if (isSelected) item.classList.add('selected');
        
        item.innerHTML = `
            <div style="font-size: 2rem;">${skin.icon}</div>
            <div>${isOwned ? 'Owned' : skin.cost + ' Coins'}</div>
        `;
        
        item.addEventListener('click', () => handleSkinClick(skin, isOwned));
        list.appendChild(item);
    });
}

async function handleSkinClick(skin, isOwned) {
    if (isOwned) {
        // Set skin
        const res = await fetch('/api/user/skin', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ skin_id: skin.id })
        });
        if (res.ok) {
            currentState.user.current_skin = skin.id;
            updateUIWithUser();
            renderShop();
        }
    } else {
        // Buy skin
        if (confirm(`Buy ${skin.icon} for ${skin.cost} coins?`)) {
            const res = await fetch('/api/shop/buy', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ skin_id: skin.id, cost: skin.cost })
            });
            const data = await res.json();
            if (data.success) {
                currentState.user.coins = data.new_balance;
                currentState.user.owned_skins.push(skin.id);
                renderShop();
            } else {
                alert(data.error);
            }
        }
    }
}

function showModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

async function fetchRankings(difficulty) {
    const list = document.getElementById('ranking-list');
    list.innerHTML = '<p>Loading...</p>';
    
    try {
        const response = await fetch(`/api/rankings/${difficulty}`);
        const data = await response.json();
        
        list.innerHTML = '';
        if (data.length === 0) {
            list.innerHTML = '<p>No records yet.</p>';
            return;
        }
        
        const table = document.createElement('table');
        table.className = 'ranking-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>User</th>
                    <th>Time</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
                ${data.map((score, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${score.username}</td>
                        <td>${score.time}s</td>
                        <td>${score.date.split(' ')[0]}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        list.appendChild(table);
    } catch (error) {
        console.error('Error fetching rankings:', error);
        list.innerHTML = '<p>Error loading rankings.</p>';
    }
}
