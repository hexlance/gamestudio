// Game client
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Game state
let gameState = {
    players: [],
    bullets: [],
    powerUps: [],
    explosions: [],
    leaderboard: [],
    gameArea: { width: 1200, height: 800 }
};

let myPlayerId = null;
let isSpectator = false;
let keys = {};
let mousePos = { x: 0, y: 0 };
let lastShootTime = 0;
const SHOOT_COOLDOWN = 300; // milliseconds
let killFeed = [];
let particles = [];

// Audio system
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioEnabled = true;

function playSound(frequency, duration, type = 'sine', volume = 0.1) {
    if (!audioEnabled) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = type;
        
        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        console.log('Audio not supported');
        audioEnabled = false;
    }
}

function playShootSound() {
    playSound(800, 0.1, 'square', 0.05);
}

function playExplosionSound() {
    playSound(150, 0.3, 'sawtooth', 0.08);
    setTimeout(() => playSound(100, 0.2, 'triangle', 0.06), 50);
}

function playPowerUpSound() {
    playSound(600, 0.2, 'sine', 0.06);
    setTimeout(() => playSound(800, 0.15, 'sine', 0.04), 100);
}

// UI elements
const healthElement = document.getElementById('health');
const scoreElement = document.getElementById('score');
const playerCountElement = document.getElementById('playerCount');
const connectionStatus = document.getElementById('connectionStatus');
const kdElement = document.getElementById('kd');
const activePowerUpsElement = document.getElementById('activePowerUps');
const leaderboardElement = document.getElementById('leaderboardList');
const killFeedElement = document.getElementById('killFeedList');

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
    gameState.powerUps = update.powerUps || [];
    gameState.explosions = update.explosions || [];
    gameState.leaderboard = update.leaderboard || [];
    updateUI();
    updateLeaderboard();
});

socket.on('gameFull', (data) => {
    isSpectator = true;
    showNotification(data.message, '#e74c3c');
    updateSpectatorStatus();
});

socket.on('promotedToPlayer', (data) => {
    isSpectator = false;
    showNotification(data.message, '#27ae60');
    updateSpectatorStatus();
});

socket.on('powerUpCollected', (data) => {
    showNotification(`${data.effect} activated!`, '#f39c12');
    playPowerUpSound();
    const myPlayer = getMyPlayer();
    if (myPlayer) {
        createParticleEffect(myPlayer.x + TANK_SIZE/2, myPlayer.y + TANK_SIZE/2, data.type);
    }
});

socket.on('playerCountUpdate', (data) => {
    playerCountElement.textContent = `${data.playerCount}/8`;
});

socket.on('playerHit', (data) => {
    createParticleEffect(data.x, data.y, 'explosion');
    playExplosionSound();
});

socket.on('playerKilled', (data) => {
    addToKillFeed(data.killer, data.victim);
    playExplosionSound();
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
        kdElement.textContent = myPlayer.deaths > 0 ? (myPlayer.kills / myPlayer.deaths).toFixed(2) : myPlayer.kills.toFixed(2);
        
        // Update active power-ups
        const activePowerUps = [];
        const now = Date.now();
        if (myPlayer.powerUps.speed > now) activePowerUps.push('🏃 Speed');
        if (myPlayer.powerUps.shield > now) activePowerUps.push('🛡️ Shield');
        if (myPlayer.powerUps.rapidFire > now) activePowerUps.push('🔫 Rapid Fire');
        if (myPlayer.powerUps.damage > now) activePowerUps.push('💥 Double Damage');
        
        activePowerUpsElement.textContent = activePowerUps.length > 0 ? activePowerUps.join(', ') : 'None';
    } else {
        healthElement.textContent = isSpectator ? 'SPECTATING' : '0';
        scoreElement.textContent = isSpectator ? '-' : '0';
        kdElement.textContent = '-';
        activePowerUpsElement.textContent = '-';
    }
    playerCountElement.textContent = `${gameState.players.length}/8`;
}

function updateLeaderboard() {
    if (!gameState.leaderboard) return;
    
    const html = gameState.leaderboard.slice(0, 5).map((player, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const isMe = player.id === myPlayerId ? ' style="color: #f39c12; font-weight: bold;"' : '';
        return `<div${isMe}>${medal} ${player.score} pts (${player.kd} K/D)</div>`;
    }).join('');
    
    leaderboardElement.innerHTML = html || 'No players yet';
}

function showNotification(message, color = '#27ae60') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${color};
        color: white;
        padding: 20px;
        border-radius: 10px;
        font-size: 18px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function addToKillFeed(killer, victim) {
    killFeed.unshift({ killer, victim, time: Date.now() });
    killFeed = killFeed.slice(0, 5); // Keep only last 5 kills
    
    const html = killFeed.map(kill => {
        const timeAgo = Math.floor((Date.now() - kill.time) / 1000);
        return `<div style="margin: 5px 0; font-size: 12px;">${kill.killer} 💥 ${kill.victim} (${timeAgo}s ago)</div>`;
    }).join('');
    
    killFeedElement.innerHTML = html;
}

function createParticleEffect(x, y, type) {
    const colors = {
        speed: '#3498db',
        shield: '#9b59b6',
        rapidFire: '#e74c3c',
        health: '#2ecc71',
        damage: '#f39c12',
        muzzle: '#fff',
        explosion: '#e74c3c'
    };
    
    const particleCount = type === 'explosion' ? 20 : type === 'muzzle' ? 5 : 10;
    const speed = type === 'explosion' ? 12 : type === 'muzzle' ? 6 : 8;
    
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: x,
            y: y,
            dx: (Math.random() - 0.5) * speed,
            dy: (Math.random() - 0.5) * speed,
            color: colors[type] || '#ffffff',
            life: type === 'explosion' ? 40 : 30,
            maxLife: type === 'explosion' ? 40 : 30,
            size: type === 'explosion' ? 4 : 3
        });
    }
}

function updateSpectatorStatus() {
    const canvas = document.getElementById('gameCanvas');
    const controls = document.getElementById('controls');
    
    if (isSpectator) {
        canvas.style.opacity = '0.7';
        controls.innerHTML = `
            <h3>🔍 Spectator Mode</h3>
            <div class="control-row">Game is full (8/8 players)</div>
            <div class="control-row">You will automatically join when a spot opens up!</div>
            <div class="control-row">Watch the epic battles and power-ups!</div>
            <div class="control-row">🏃 Speed • 🛡️ Shield • 🔫 Rapid Fire • ❤️ Health • 💥 Double Damage</div>
        `;
    } else {
        canvas.style.opacity = '1';
        controls.innerHTML = `
            <h3>🎮 Enhanced Controls</h3>
            <div class="control-row"><strong>WASD / Arrow Keys</strong> - Move tank</div>
            <div class="control-row"><strong>Mouse</strong> - Aim turret</div>
            <div class="control-row"><strong>Left Click / Space</strong> - Shoot bullets</div>
            <div class="control-row"><strong>Power-ups:</strong> 🏃 Speed • 🛡️ Shield • 🔫 Rapid Fire • ❤️ Health • 💥 Double Damage</div>
            <div class="control-row"><strong>Goal:</strong> Collect power-ups and dominate the leaderboard!</div>
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
    
    const myPlayer = getMyPlayer();
    if (!myPlayer) return;
    
    const now = Date.now();
    const shootCooldown = myPlayer.powerUps.rapidFire > now ? 100 : SHOOT_COOLDOWN;
    if (now - lastShootTime < shootCooldown) return;

    const angle = calculateAngle(myPlayer);
    socket.emit('playerShoot', { angle });
    lastShootTime = now;
    
    // Play shoot sound
    playShootSound();
    
    // Create muzzle flash effect
    createParticleEffect(
        myPlayer.x + TANK_SIZE/2 + Math.cos(angle) * 20,
        myPlayer.y + TANK_SIZE/2 + Math.sin(angle) * 20,
        'muzzle'
    );
}

// Rendering functions
function drawTank(player) {
    ctx.save();
    
    const centerX = player.x + TANK_SIZE / 2;
    const centerY = player.y + TANK_SIZE / 2;
    
    // Draw shield effect if active
    const now = Date.now();
    if (player.powerUps.shield > now) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, TANK_SIZE / 2 + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#9b59b6';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Move to tank center
    ctx.translate(centerX, centerY);
    ctx.rotate(player.angle);
    
    // Draw tank shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(-TANK_SIZE/2 + 2, -TANK_SIZE/2 + 2, TANK_SIZE, TANK_SIZE);
    
    // Draw tank body with gradient
    const gradient = ctx.createLinearGradient(-TANK_SIZE/2, -TANK_SIZE/2, TANK_SIZE/2, TANK_SIZE/2);
    gradient.addColorStop(0, player.color);
    gradient.addColorStop(1, darkenColor(player.color, 0.3));
    ctx.fillStyle = gradient;
    ctx.fillRect(-TANK_SIZE/2, -TANK_SIZE/2, TANK_SIZE, TANK_SIZE);
    
    // Draw tank outline
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.strokeRect(-TANK_SIZE/2, -TANK_SIZE/2, TANK_SIZE, TANK_SIZE);
    
    // Draw tank barrel
    ctx.fillStyle = '#34495e';
    ctx.fillRect(0, -4, 25, 8);
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, -4, 25, 8);
    
    // Draw speed boost effect
    if (player.powerUps.speed > now) {
        ctx.fillStyle = '#3498db';
        for (let i = 0; i < 3; i++) {
            ctx.fillRect(-TANK_SIZE/2 - 5 - i * 3, -2 + i * 2, 8, 2);
        }
    }
    
    ctx.restore();
    
    // Health bar background
    ctx.fillStyle = '#34495e';
    ctx.fillRect(player.x - 2, player.y - 15, TANK_SIZE + 4, 8);
    
    // Health bar
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(player.x, player.y - 13, TANK_SIZE, 4);
    
    ctx.fillStyle = player.health > 50 ? '#27ae60' : player.health > 25 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(player.x, player.y - 13, (player.health / player.maxHealth) * TANK_SIZE, 4);
    
    // Player score and team indicator
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.strokeText(`${player.score}`, centerX, player.y - 20);
    ctx.fillText(`${player.score}`, centerX, player.y - 20);
    
    // Team indicator
    const teamColor = player.team === 0 ? '#3498db' : '#e74c3c';
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.arc(player.x + TANK_SIZE - 5, player.y + 5, 4, 0, Math.PI * 2);
    ctx.fill();
}

function darkenColor(color, factor) {
    // Simple color darkening function
    return color.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, (match, h, s, l) => {
        return `hsl(${h}, ${s}%, ${Math.max(0, l - l * factor)}%)`;
    });
}

function drawBullet(bullet) {
    ctx.save();
    
    // Draw bullet trail
    ctx.strokeStyle = bullet.color || '#f39c12';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bullet.x - bullet.dx * 2, bullet.y - bullet.dy * 2);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    
    // Draw bullet
    ctx.fillStyle = bullet.color || '#f39c12';
    ctx.shadowColor = bullet.color || '#f39c12';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, BULLET_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function drawPowerUp(powerUp) {
    ctx.save();
    
    // Pulsing effect
    const pulse = Math.sin(Date.now() * 0.01) * 0.2 + 1;
    const size = 15 * pulse;
    
    // Draw glow
    ctx.shadowColor = powerUp.color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = powerUp.color;
    ctx.beginPath();
    ctx.arc(powerUp.x + 15, powerUp.y + 15, size, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw icon based on type
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    
    const icons = {
        speed: '🏃',
        shield: '🛡️',
        rapidFire: '🔫',
        health: '❤️',
        damage: '💥'
    };
    
    ctx.fillText(icons[powerUp.type] || '?', powerUp.x + 15, powerUp.y + 20);
    
    ctx.restore();
}

function drawExplosion(explosion) {
    const progress = (Date.now() - explosion.startTime) / explosion.duration;
    const size = explosion.size * (1 - progress);
    const alpha = 1 - progress;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Draw explosion circles
    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === 0 ? '#e74c3c' : i === 1 ? '#f39c12' : '#fff';
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, size * (1 - i * 0.3), 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

function drawParticles() {
    particles.forEach((particle, index) => {
        particle.x += particle.dx;
        particle.y += particle.dy;
        particle.life--;
        particle.dx *= 0.98; // Friction
        particle.dy *= 0.98;
        
        if (particle.life <= 0) {
            particles.splice(index, 1);
            return;
        }
        
        ctx.save();
        ctx.globalAlpha = particle.life / particle.maxLife;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size || 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw animated background
    const time = Date.now() * 0.001;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#27ae60');
    gradient.addColorStop(0.5, '#2ecc71');
    gradient.addColorStop(1, '#27ae60');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw enhanced grid pattern
    ctx.strokeStyle = 'rgba(34, 153, 84, 0.3)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Draw power-ups first (behind everything)
    gameState.powerUps.forEach(powerUp => {
        drawPowerUp(powerUp);
    });
    
    // Draw explosions
    gameState.explosions.forEach(explosion => {
        drawExplosion(explosion);
    });
    
    // Draw particles
    drawParticles();
    
    // Draw all players
    gameState.players.forEach(player => {
        drawTank(player);
    });
    
    // Draw all bullets
    gameState.bullets.forEach(bullet => {
        drawBullet(bullet);
    });
    
    // Highlight my tank with pulsing effect
    const myPlayer = getMyPlayer();
    if (myPlayer && !isSpectator) {
        const pulse = Math.sin(time * 3) * 0.3 + 0.7;
        ctx.strokeStyle = `rgba(236, 240, 241, ${pulse})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(myPlayer.x - 3, myPlayer.y - 3, TANK_SIZE + 6, TANK_SIZE + 6);
    }
    
    // Draw minimap
    drawMinimap();
}

function drawMinimap() {
    const minimapSize = 150;
    const minimapX = canvas.width - minimapSize - 10;
    const minimapY = canvas.height - minimapSize - 10;
    const scaleX = minimapSize / gameState.gameArea.width;
    const scaleY = minimapSize / gameState.gameArea.height;
    
    // Minimap background
    ctx.fillStyle = 'rgba(44, 62, 80, 0.8)';
    ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 2;
    ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
    
    // Draw players on minimap
    gameState.players.forEach(player => {
        const x = minimapX + player.x * scaleX;
        const y = minimapY + player.y * scaleY;
        
        ctx.fillStyle = player.id === myPlayerId ? '#f39c12' : player.color;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Draw power-ups on minimap
    gameState.powerUps.forEach(powerUp => {
        const x = minimapX + powerUp.x * scaleX;
        const y = minimapY + powerUp.y * scaleY;
        
        ctx.fillStyle = powerUp.color;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    });
}

// Game loop
function gameLoop() {
    handleMovement();
    render();
    requestAnimationFrame(gameLoop);
}

// Audio toggle
document.getElementById('audioToggle').addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    const button = document.getElementById('audioToggle');
    button.textContent = audioEnabled ? '🔊 Audio ON' : '🔇 Audio OFF';
    button.style.background = audioEnabled ? '#34495e' : '#e74c3c';
});

// Enable audio on first user interaction
document.addEventListener('click', () => {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}, { once: true });

// Start the game
gameLoop(); 
