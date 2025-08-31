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
const MAX_PLAYERS = 5;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const TANK_SIZE = 30;
const BULLET_SIZE = 5;
const BULLET_SPEED = 8;
const TANK_SPEED = 3;

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
        score: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`
    };

    players.set(socket.id, player);

    // Send initial game state to new player
    socket.emit('gameState', {
        players: Array.from(players.values()),
        bullets: Array.from(bullets.values()),
        gameArea: { width: GAME_WIDTH, height: GAME_HEIGHT },
        isSpectator: false
    });

    // Notify all players about new player
    io.emit('playerJoined', { playerCount: players.size });

    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (!player) return;

        let newX = player.x + data.dx * TANK_SPEED;
        let newY = player.y + data.dy * TANK_SPEED;

        // Keep player within bounds
        newX = Math.max(0, Math.min(GAME_WIDTH - TANK_SIZE, newX));
        newY = Math.max(0, Math.min(GAME_HEIGHT - TANK_SIZE, newY));

        player.x = newX;
        player.y = newY;
        player.angle = data.angle;
    });

    // Handle shooting
    socket.on('playerShoot', (data) => {
        const player = players.get(socket.id);
        if (!player) return;

        const bulletId = generateId();
        const bullet = {
            id: bulletId,
            playerId: socket.id,
            x: player.x + TANK_SIZE / 2,
            y: player.y + TANK_SIZE / 2,
            dx: Math.cos(data.angle) * BULLET_SPEED,
            dy: Math.sin(data.angle) * BULLET_SPEED,
            angle: data.angle
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
                // Hit!
                player.health -= 25;
                bullets.delete(bulletId);

                if (player.health <= 0) {
                    // Player died
                    const shooter = players.get(bullet.playerId);
                    if (shooter) {
                        shooter.score += 1;
                    }

                    // Respawn player
                    player.health = 100;
                    player.x = Math.random() * (GAME_WIDTH - TANK_SIZE);
                    player.y = Math.random() * (GAME_HEIGHT - TANK_SIZE);
                }
                break;
            }
        }
    }

    // Send updated game state to all players
    io.emit('gameUpdate', {
        players: Array.from(players.values()),
        bullets: Array.from(bullets.values())
    });
}, 1000 / 60); // 60 FPS

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tank.io server running on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`Network: http://0.0.0.0:${PORT}`);
    console.log(`Max players: ${MAX_PLAYERS}`);
}); 
