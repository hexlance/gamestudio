const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const players = new Map();
const bullets = new Map();
const spectators = new Set();
const powerUps = new Map();
const explosions = new Map();
const leaderboard = [];
const MAX_PLAYERS = 8; // Increased player limit
const GAME_WIDTH = 1200; // Larger game area
const GAME_HEIGHT = 800;
const TANK_SIZE = 40;
const BULLET_SIZE = 6;
const BULLET_SPEED = 12;
const TANK_SPEED = 4;
const POWER_UP_SPAWN_RATE = 0.02; // 2% chance per frame
const EXPLOSION_DURATION = 500; // milliseconds

// Generate unique ID
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Check collision between two rectangles
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Power-up types
const POWER_UP_TYPES = {
    SPEED: { type: 'speed', color: '#3498db', duration: 10000, effect: 'Speed Boost' },
    SHIELD: { type: 'shield', color: '#9b59b6', duration: 8000, effect: 'Shield' },
    RAPID_FIRE: { type: 'rapidFire', color: '#e74c3c', duration: 7000, effect: 'Rapid Fire' },
    HEALTH: { type: 'health', color: '#2ecc71', duration: 0, effect: 'Health Pack' },
    DAMAGE: { type: 'damage', color: '#f39c12', duration: 12000, effect: 'Double Damage' }
};

// Spawn power-up
function spawnPowerUp() {
    if (Math.random() < POWER_UP_SPAWN_RATE && powerUps.size < 5) {
        const types = Object.values(POWER_UP_TYPES);
        const powerUpType = types[Math.floor(Math.random() * types.length)];
        
        const powerUp = {
            id: generateId(),
            x: Math.random() * (GAME_WIDTH - 30),
            y: Math.random() * (GAME_HEIGHT - 30),
            ...powerUpType,
            spawnTime: Date.now()
        };
        
        powerUps.set(powerUp.id, powerUp);
    }
}

// Create explosion effect
function createExplosion(x, y, size = 50) {
    const explosion = {
        id: generateId(),
        x: x,
        y: y,
        size: size,
        startTime: Date.now(),
        duration: EXPLOSION_DURATION
    };
    explosions.set(explosion.id, explosion);
}

// Apply power-up to player
function applyPowerUp(player, powerUp) {
    const now = Date.now();
    
    switch (powerUp.type) {
        case 'speed':
            player.powerUps.speed = now + powerUp.duration;
            break;
        case 'shield':
            player.powerUps.shield = now + powerUp.duration;
            break;
        case 'rapidFire':
            player.powerUps.rapidFire = now + powerUp.duration;
            break;
        case 'health':
            player.health = Math.min(player.maxHealth, player.health + 50);
            break;
        case 'damage':
            player.powerUps.damage = now + powerUp.duration;
            break;
    }
}

// Update leaderboard
function updateLeaderboard() {
    const playerStats = Array.from(players.values()).map(p => ({
        id: p.id,
        score: p.score,
        kills: p.kills,
        deaths: p.deaths,
        kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2)
    }));
    
    playerStats.sort((a, b) => b.score - a.score);
    leaderboard.splice(0, leaderboard.length, ...playerStats.slice(0, 10));
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Check if game is full
    if (players.size >= MAX_PLAYERS) {
        spectators.add(socket.id);
        socket.emit('gameFull', { 
            message: `Game is full! You are spectating. Queue position: ${spectators.size}`,
            isSpectator: true 
        });
        
        // Send game state to spectator
        socket.emit('gameState', {
            players: Array.from(players.values()),
            bullets: Array.from(bullets.values()),
            gameArea: { width: GAME_WIDTH, height: GAME_HEIGHT },
            isSpectator: true
        });
        
        console.log(`Player ${socket.id} added to spectator queue. Queue size: ${spectators.size}`);
        return;
    }

    // Create new player
    const player = {
        id: socket.id,
        x: Math.random() * (GAME_WIDTH - TANK_SIZE),
        y: Math.random() * (GAME_HEIGHT - TANK_SIZE),
        angle: 0,
        health: 100,
        maxHealth: 100,
        score: 0,
        kills: 0,
        deaths: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        powerUps: {
            speed: 0,
            shield: 0,
            rapidFire: 0,
            damage: 0
        },
        lastShot: 0,
        team: Math.floor(Math.random() * 2) // 0 or 1 for team mode
    };

    players.set(socket.id, player);

    // Send initial game state to new player
    socket.emit('gameState', {
        players: Array.from(players.values()),
        bullets: Array.from(bullets.values()),
        powerUps: Array.from(powerUps.values()),
        explosions: Array.from(explosions.values()),
        gameArea: { width: GAME_WIDTH, height: GAME_HEIGHT },
        isSpectator: false
    });

    // Notify all players about new player
    io.emit('playerJoined', { playerCount: players.size });

    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (!player) return;

        // Apply speed boost if active
        const speedMultiplier = player.powerUps.speed > Date.now() ? 2 : 1;
        let newX = player.x + data.dx * TANK_SPEED * speedMultiplier;
        let newY = player.y + data.dy * TANK_SPEED * speedMultiplier;

        // Keep player within bounds
        newX = Math.max(0, Math.min(GAME_WIDTH - TANK_SIZE, newX));
        newY = Math.max(0, Math.min(GAME_HEIGHT - TANK_SIZE, newY));

        player.x = newX;
        player.y = newY;
        player.angle = data.angle;

        // Check power-up collisions
        for (const [powerUpId, powerUp] of powerUps.entries()) {
            const playerRect = { x: player.x, y: player.y, width: TANK_SIZE, height: TANK_SIZE };
            const powerUpRect = { x: powerUp.x, y: powerUp.y, width: 30, height: 30 };

            if (checkCollision(playerRect, powerUpRect)) {
                // Apply power-up effect
                applyPowerUp(player, powerUp);
                powerUps.delete(powerUpId);
                socket.emit('powerUpCollected', { type: powerUp.type, effect: powerUp.effect });
                break;
            }
        }
    });

    // Handle shooting
    socket.on('playerShoot', (data) => {
        const player = players.get(socket.id);
        if (!player) return;

        // Check shooting cooldown (rapid fire power-up reduces cooldown)
        const now = Date.now();
        const shootCooldown = player.powerUps.rapidFire > now ? 100 : 300;
        if (now - player.lastShot < shootCooldown) return;
        
        player.lastShot = now;

        const bulletId = generateId();
        const bullet = {
            id: bulletId,
            playerId: socket.id,
            x: player.x + TANK_SIZE / 2,
            y: player.y + TANK_SIZE / 2,
            dx: Math.cos(data.angle) * BULLET_SPEED,
            dy: Math.sin(data.angle) * BULLET_SPEED,
            angle: data.angle,
            damage: player.powerUps.damage > now ? 50 : 25, // Double damage power-up
            color: player.powerUps.damage > now ? '#e74c3c' : '#f39c12'
        };

        bullets.set(bulletId, bullet);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        const wasPlayer = players.has(socket.id);
        players.delete(socket.id);
        spectators.delete(socket.id);
        
        // Remove player's bullets
        for (const [bulletId, bullet] of bullets.entries()) {
            if (bullet.playerId === socket.id) {
                bullets.delete(bulletId);
            }
        }
        
        // If a player left and there are spectators, promote the first spectator
        if (wasPlayer && spectators.size > 0) {
            const nextPlayerId = spectators.values().next().value;
            spectators.delete(nextPlayerId);
            
            // Create new player from spectator
            const newPlayer = {
                id: nextPlayerId,
                x: Math.random() * (GAME_WIDTH - TANK_SIZE),
                y: Math.random() * (GAME_HEIGHT - TANK_SIZE),
                angle: 0,
                health: 100,
                score: 0,
                color: `hsl(${Math.random() * 360}, 70%, 50%)`
            };
            
            players.set(nextPlayerId, newPlayer);
            
            // Notify the promoted player
            io.to(nextPlayerId).emit('promotedToPlayer', {
                message: 'You can now play! A spot opened up.',
                isSpectator: false
            });
            
            console.log(`Promoted spectator ${nextPlayerId} to player`);
        }
        
        // Update all clients about player count change
        io.emit('playerCountUpdate', { 
            playerCount: players.size, 
            spectatorCount: spectators.size 
        });
    });
});

// Game loop
setInterval(() => {
    // Spawn power-ups
    spawnPowerUp();
    
    // Clean up old power-ups (remove after 30 seconds)
    const now = Date.now();
    for (const [powerUpId, powerUp] of powerUps.entries()) {
        if (now - powerUp.spawnTime > 30000) {
            powerUps.delete(powerUpId);
        }
    }
    
    // Clean up explosions
    for (const [explosionId, explosion] of explosions.entries()) {
        if (now - explosion.startTime > explosion.duration) {
            explosions.delete(explosionId);
        }
    }
    
    // Update bullets
    for (const [bulletId, bullet] of bullets.entries()) {
        bullet.x += bullet.dx;
        bullet.y += bullet.dy;

        // Remove bullets that are out of bounds
        if (bullet.x < 0 || bullet.x > GAME_WIDTH || bullet.y < 0 || bullet.y > GAME_HEIGHT) {
            bullets.delete(bulletId);
            continue;
        }

        // Check bullet-player collisions
        for (const [playerId, player] of players.entries()) {
            if (playerId === bullet.playerId) continue; // Can't hit yourself

            const bulletRect = { x: bullet.x, y: bullet.y, width: BULLET_SIZE, height: BULLET_SIZE };
            const playerRect = { x: player.x, y: player.y, width: TANK_SIZE, height: TANK_SIZE };

            if (checkCollision(bulletRect, playerRect)) {
                // Check if player has shield
                if (player.powerUps.shield > Date.now()) {
                    // Shield blocks the bullet
                    bullets.delete(bulletId);
                    createExplosion(bullet.x, bullet.y, 30);
                    break;
                }

                // Hit!
                const damage = bullet.damage || 25;
                player.health -= damage;
                bullets.delete(bulletId);
                createExplosion(bullet.x, bullet.y, 40);
                
                // Notify about hit
                io.emit('playerHit', { 
                    playerId: playerId, 
                    shooterId: bullet.playerId,
                    damage: damage,
                    x: bullet.x,
                    y: bullet.y
                });

                if (player.health <= 0) {
                    // Player died
                    const shooter = players.get(bullet.playerId);
                    if (shooter) {
                        shooter.score += 2; // Increased score for kills
                        shooter.kills += 1;
                        
                        // Notify about kill
                        io.emit('playerKilled', {
                            killer: `Player ${shooter.score}`,
                            victim: `Player ${player.score}`,
                            killerColor: shooter.color,
                            victimColor: player.color
                        });
                    }
                    
                    player.deaths += 1;
                    createExplosion(player.x + TANK_SIZE/2, player.y + TANK_SIZE/2, 100);

                    // Respawn player
                    player.health = player.maxHealth;
                    player.x = Math.random() * (GAME_WIDTH - TANK_SIZE);
                    player.y = Math.random() * (GAME_HEIGHT - TANK_SIZE);
                    
                    // Clear power-ups on death
                    player.powerUps = { speed: 0, shield: 0, rapidFire: 0, damage: 0 };
                    
                    updateLeaderboard();
                }
                break;
            }
        }
    }

    // Send updated game state to all players
    io.emit('gameUpdate', {
        players: Array.from(players.values()),
        bullets: Array.from(bullets.values()),
        powerUps: Array.from(powerUps.values()),
        explosions: Array.from(explosions.values()),
        leaderboard: leaderboard
    });
}, 1000 / 60); // 60 FPS

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tank.io server running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Network: http://0.0.0.0:${PORT}`);
    console.log(`Max players: ${MAX_PLAYERS}`);
}); 
