// Game client
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Game state
let gameState = {
    players: [],
    bullets: [],
    gameArea: { width: 800, height: 600 }
};

let myPlayerId = null;
let isSpectator = false;
let keys = {};
let mousePos = { x: 0, y: 0 };
let lastShootTime = 0;
const SHOOT_COOLDOWN = 300; // milliseconds

// UI elements
const healthElement = document.getElementById('health');
const scoreElement = document.getElementById('score');
const playerCountElement = document.getElementById('playerCount');
const connectionStatus = document.getElementById('connectionStatus');

// Socket events
socket.on('connect', () => {
    myPlayerId = socket.id;
    connectionStatus.textContent = 'Connected';
    connectionStatus.className = 'connected';
});

socket.on('disconnect', () => {
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'disconnected';
});

socket.on('gameState', (state) => {
    gameState = state;
    isSpectator = state.isSpectator || false;
    updateUI();
    updateSpectatorStatus();
});

socket.on('gameUpdate', (update) => {
    gameState.players = update.players;
    gameState.bullets = update.bullets;
    updateUI();
});

socket.on('gameFull', (data) => {
    isSpectator = true;
    alert(data.message);
    updateSpectatorStatus();
});

socket.on('promotedToPlayer', (data) => {
    isSpectator = false;
    alert(data.message);
    updateSpectatorStatus();
});

socket.on('playerCountUpdate', (data) => {
    playerCountElement.textContent = `${data.playerCount}/5`;
});

// Input handling
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = e.clientX - rect.left;
    mousePos.y = e.clientY - rect.top;
});

canvas.addEventListener('click', () => {
    shoot();
});

document.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
        e.preventDefault();
        shoot();
    }
});

// Game functions
function updateUI() {
    const myPlayer = gameState.players.find(p => p.id === myPlayerId);
    if (myPlayer && !isSpectator) {
        healthElement.textContent = myPlayer.health;
        scoreElement.textContent = myPlayer.score;
    } else {
        healthElement.textContent = isSpectator ? 'SPECTATING' : '0';
        scoreElement.textContent = isSpectator ? '-' : '0';
    }
    playerCountElement.textContent = `${gameState.players.length}/5`;
}

function updateSpectatorStatus() {
    const canvas = document.getElementById('gameCanvas');
    const controls = document.getElementById('controls');
    
    if (isSpectator) {
        canvas.style.opacity = '0.7';
        controls.innerHTML = `
            <h3>🔍 Spectator Mode</h3>
            <div class="control-row">Game is full (5/5 players)</div>
            <div class="control-row">You will automatically join when a spot opens up!</div>
            <div class="control-row">Watch the battle and wait for your turn...</div>
        `;
    } else {
        canvas.style.opacity = '1';
        controls.innerHTML = `
            <h3>Controls</h3>
            <div class="control-row"><strong>WASD</strong> - Move tank</div>
            <div class="control-row"><strong>Mouse</strong> - Aim</div>
            <div class="control-row"><strong>Left Click / Space</strong> - Shoot</div>
            <div class="control-row"><strong>Goal:</strong> Destroy other tanks to score points!</div>
        `;
    }
}

function getMyPlayer() {
    return gameState.players.find(p => p.id === myPlayerId);
}

function calculateAngle(player) {
    const dx = mousePos.x - (player.x + 15); // 15 is half tank size
    const dy = mousePos.y - (player.y + 15);
    return Math.atan2(dy, dx);
}

function handleMovement() {
    if (isSpectator) return; // Spectators can't move
    
    const myPlayer = getMyPlayer();
    if (!myPlayer) return;

    let dx = 0;
    let dy = 0;

    if (keys['w'] || keys['arrowup']) dy = -1;
    if (keys['s'] || keys['arrowdown']) dy = 1;
    if (keys['a'] || keys['arrowleft']) dx = -1;
    if (keys['d'] || keys['arrowright']) dx = 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
        dx *= 0.707;
        dy *= 0.707;
    }

    if (dx !== 0 || dy !== 0) {
        const angle = calculateAngle(myPlayer);
        socket.emit('playerMove', { dx, dy, angle });
    }
}

function shoot() {
    if (isSpectator) return; // Spectators can't shoot
    
    const now = Date.now();
    if (now - lastShootTime < SHOOT_COOLDOWN) return;

    const myPlayer = getMyPlayer();
    if (!myPlayer) return;

    const angle = calculateAngle(myPlayer);
    socket.emit('playerShoot', { angle });
    lastShootTime = now;
}

// Rendering functions
function drawTank(player) {
    ctx.save();
    
    // Move to tank center
    ctx.translate(player.x + 15, player.y + 15);
    ctx.rotate(player.angle);
    
    // Draw tank body
    ctx.fillStyle = player.color;
    ctx.fillRect(-15, -15, 30, 30);
    
    // Draw tank outline
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2;
    ctx.strokeRect(-15, -15, 30, 30);
    
    // Draw tank barrel
    ctx.fillStyle = '#34495e';
    ctx.fillRect(0, -3, 20, 6);
    
    // Draw health bar
    ctx.restore();
    
    // Health bar background
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(player.x, player.y - 10, 30, 4);
    
    // Health bar foreground
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(player.x, player.y - 10, (player.health / 100) * 30, 4);
    
    // Player name/score
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${player.score}`, player.x + 15, player.y - 15);
}

function drawBullet(bullet) {
    ctx.fillStyle = '#f39c12';
    ctx.fillRect(bullet.x - 2.5, bullet.y - 2.5, 5, 5);
    
    // Add bullet glow effect
    ctx.shadowColor = '#f39c12';
    ctx.shadowBlur = 5;
    ctx.fillRect(bullet.x - 1, bullet.y - 1, 2, 2);
    ctx.shadowBlur = 0;
}

function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid pattern
    ctx.strokeStyle = '#229954';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Draw all players
    gameState.players.forEach(player => {
        drawTank(player);
    });
    
    // Draw all bullets
    gameState.bullets.forEach(bullet => {
        drawBullet(bullet);
    });
    
    // Highlight my tank
    const myPlayer = getMyPlayer();
    if (myPlayer) {
        ctx.strokeStyle = '#ecf0f1';
        ctx.lineWidth = 3;
        ctx.strokeRect(myPlayer.x - 2, myPlayer.y - 2, 34, 34);
    }
}

// Game loop
function gameLoop() {
    handleMovement();
    render();
    requestAnimationFrame(gameLoop);
}

// Start the game
gameLoop(); 
