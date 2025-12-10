// Game Configuration
const CONFIG = {
    easy: { rows: 9, cols: 9, mines: 10 },
    normal: { rows: 16, cols: 16, mines: 40 },
    hard: { rows: 32, cols: 32, mines: 199 }
};

const SKINS = [
    { id: 'default', icon: '😊', cost: 0 },
    { id: 'cool', icon: '😎', cost: 50 },
    { id: 'cowboy', icon: '🤠', cost: 100 },
    { id: 'alien', icon: '👽', cost: 200 },
    { id: 'robot', icon: '🤖', cost: 500 }
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
    initGame('easy');
    setupEventListeners();
});

function setupEventListeners() {
    // Header Buttons
    document.getElementById('settings-btn').addEventListener('click', () => showModal('settings-modal'));
    document.getElementById('user-btn').addEventListener('click', () => {
        if (currentState.user) {
            updateUserProfile();
            showModal('user-modal');
        } else {
            showModal('auth-modal');
        }
    });
    smileyBtn.addEventListener('click', () => initGame(currentState.difficulty));

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
        
        // Long press simulation for mobile
        let pressTimer;
        cell.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => handleCellRightClick(i), 500);
        });
        cell.addEventListener('touchend', () => clearTimeout(pressTimer));

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
    if (currentState.gameOver || currentState.board[index].flagged || currentState.board[index].question) return;
    
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
    
    if (!cellData.flagged && !cellData.question) {
        cellData.flagged = true;
        cellEl.classList.add('flag');
        cellEl.innerHTML = '<i class="fas fa-flag"></i>';
    } else if (cellData.flagged) {
        cellData.flagged = false;
        cellData.question = true;
        cellEl.classList.remove('flag');
        cellEl.classList.add('question');
        cellEl.textContent = '?';
    } else {
        cellData.question = false;
        cellEl.classList.remove('question');
        cellEl.textContent = '';
    }
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
    }
}

function checkWin() {
    const config = CONFIG[currentState.difficulty];
    const totalCells = config.rows * config.cols;
    let revealedCount = 0;
    
    currentState.board.forEach(cell => {
        if (cell.revealed) revealedCount++;
    });
    
    if (revealedCount === totalCells - config.mines) {
        gameOver(true);
    }
}

function gameOver(win) {
    currentState.gameOver = true;
    clearInterval(currentState.timerInterval);
    
    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const msg = document.getElementById('game-over-message');
    const recoveryOpts = document.getElementById('recovery-options');
    const restartBtn = document.getElementById('restart-btn');
    
    modal.classList.remove('hidden');
    
    if (win) {
        title.textContent = "You Win!";
        msg.textContent = `Time: ${currentState.timer}s`;
        recoveryOpts.classList.add('hidden');
        restartBtn.classList.remove('hidden');
        
        if (currentState.user) {
            submitScore();
        }
    } else {
        title.textContent = "Game Over";
        msg.textContent = "You hit 3 mines!";
        restartBtn.classList.add('hidden');
        
        if (currentState.user && currentState.user.coins >= 20) {
            recoveryOpts.classList.remove('hidden');
        } else {
            recoveryOpts.classList.add('hidden');
            restartBtn.classList.remove('hidden');
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
        }
    } catch (e) { console.error(e); }
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
function updateUIWithUser() {
    if (currentState.user) {
        const skin = SKINS.find(s => s.id === currentState.user.current_skin);
        if (skin) smileyBtn.textContent = skin.icon;
    }
}

function updateUserProfile() {
    document.getElementById('profile-name').textContent = currentState.user.username;
    document.getElementById('profile-coins').textContent = currentState.user.coins;
}

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
