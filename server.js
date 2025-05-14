const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(__dirname));

// Game state management
const gameState = {
    players: new Map(),
    eliminatedPlayers: new Set(),
    gameStatus: 'waiting', // waiting, countdown, active, finished
    countdownValue: 3,
    roundNumber: 0,
    maxPlayers: 10,
    minPlayers: 2,
    roundStartTime: null,
    lastUpdateTime: null,
    playerPositions: new Map(), // For movement validation
    playerLastUpdate: new Map(), // For rate limiting
    playerPing: new Map(), // For latency tracking
    lasers: new Map(), // Track active lasers
};

// Constants
const UPDATE_RATE = 60; // Server updates per second
const MOVEMENT_THRESHOLD = 2.0; // Maximum allowed movement per update
const UPDATE_INTERVAL = 1000 / UPDATE_RATE;
const RATE_LIMIT_WINDOW = 1000; // 1 second window for rate limiting
const MAX_UPDATES_PER_WINDOW = 30; // Maximum updates per second
const LASER_SPEED = 20; // Units per second
const LASER_LIFETIME = 2000; // Milliseconds

// Helper functions
function validateMovement(playerId, newPosition, lastPosition) {
    if (!lastPosition) return true;
    
    const distance = Math.sqrt(
        Math.pow(newPosition.x - lastPosition.x, 2) +
        Math.pow(newPosition.z - lastPosition.z, 2)
    );
    
    return distance <= MOVEMENT_THRESHOLD;
}

function checkLaserHit(laser, player) {
    if (player.eliminated) return false;
    
    const dx = laser.position.x - player.position.x;
    const dz = laser.position.z - player.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    return distance < 1.0; // Hit radius
}

function updateLasers() {
    const now = Date.now();
    const lasersToRemove = [];
    
    gameState.lasers.forEach((laser, id) => {
        // Update laser position
        const elapsed = now - laser.startTime;
        const distance = LASER_SPEED * (elapsed / 1000);
        
        laser.position.x += Math.sin(laser.rotation.y) * distance;
        laser.position.z += Math.cos(laser.rotation.y) * distance;
        
        // Check for hits
        gameState.players.forEach((player, playerId) => {
            if (playerId !== laser.ownerId && checkLaserHit(laser, player)) {
                // Player hit
                io.emit('playerHit', {
                    playerId: playerId,
                    laserId: id
                });
            }
        });
        
        // Remove expired lasers
        if (elapsed > LASER_LIFETIME) {
            lasersToRemove.push(id);
        }
    });
    
    // Remove expired lasers
    lasersToRemove.forEach(id => {
        gameState.lasers.delete(id);
        io.emit('laserRemoved', { id });
    });
}

function checkRateLimit(playerId) {
    const now = Date.now();
    const playerUpdates = gameState.playerLastUpdate.get(playerId) || [];
    
    // Remove old updates
    while (playerUpdates.length && playerUpdates[0] < now - RATE_LIMIT_WINDOW) {
        playerUpdates.shift();
    }
    
    if (playerUpdates.length >= MAX_UPDATES_PER_WINDOW) {
        return false;
    }
    
    playerUpdates.push(now);
    gameState.playerLastUpdate.set(playerId, playerUpdates);
    return true;
}

function startGame() {
    if (gameState.players.size < gameState.minPlayers) {
        return false;
    }
    
    gameState.gameStatus = 'countdown';
    gameState.countdownValue = 3;
    gameState.roundNumber++;
    gameState.eliminatedPlayers.clear();
    gameState.roundStartTime = Date.now();
    
    // Reset all player positions
    gameState.players.forEach((player, id) => {
        const angle = (Array.from(gameState.players.keys()).indexOf(id) / gameState.players.size) * Math.PI * 2;
        const radius = 20;
        player.position = {
            x: Math.cos(angle) * radius,
            y: 0,
            z: Math.sin(angle) * radius
        };
        player.rotation = { x: 0, y: angle + Math.PI, z: 0 };
        player.eliminated = false;
        player.survivalTime = 0;
    });
    
    return true;
}

function checkGameEnd() {
    const activePlayers = Array.from(gameState.players.values())
        .filter(player => !player.eliminated);
    
    if (activePlayers.length <= 1) {
        gameState.gameStatus = 'finished';
        const winner = activePlayers[0];
        if (winner) {
            io.emit('gameOver', {
                winner: winner.id,
                survivalTime: winner.survivalTime,
                roundNumber: gameState.roundNumber
            });
        }
        return true;
    }
    return false;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Check if server is full
    if (gameState.players.size >= gameState.maxPlayers) {
        socket.emit('serverFull');
        socket.disconnect();
        return;
    }
    
    // Initialize player
    const player = {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        color: Math.floor(Math.random() * 0xFFFFFF),
        eliminated: false,
        survivalTime: 0,
        lastUpdate: Date.now(),
        ping: 0
    };
    
    gameState.players.set(socket.id, player);
    gameState.playerPositions.set(socket.id, player.position);
    gameState.playerLastUpdate.set(socket.id, []);
    gameState.playerPing.set(socket.id, 0);
    
    // Send current game state to new player
    socket.emit('gameState', {
        players: Array.from(gameState.players.entries()),
        gameStatus: gameState.gameStatus,
        countdownValue: gameState.countdownValue,
        roundNumber: gameState.roundNumber,
        eliminatedPlayers: Array.from(gameState.eliminatedPlayers)
    });
    
    // Notify other players
    socket.broadcast.emit('playerJoined', player);
    
    // Handle player movement
    socket.on('playerMove', (data) => {
        if (!checkRateLimit(socket.id)) return;
        
        const player = gameState.players.get(socket.id);
        if (!player || player.eliminated) return;
        
        const lastPosition = gameState.playerPositions.get(socket.id);
        if (!validateMovement(socket.id, data.position, lastPosition)) {
            // Invalid movement detected
            socket.emit('invalidMovement', { position: lastPosition });
            return;
        }
        
        // Update player state
        player.position = data.position;
        player.rotation = data.rotation;
        gameState.playerPositions.set(socket.id, data.position);
        
        // Broadcast to other players
        socket.broadcast.emit('playerMoved', {
            id: socket.id,
            position: data.position,
            rotation: data.rotation
        });
    });
    
    // Handle player elimination
    socket.on('playerEliminated', (data) => {
        const player = gameState.players.get(socket.id);
        if (!player || player.eliminated) return;
        
        player.eliminated = true;
        player.survivalTime = data.survivalTime;
        gameState.eliminatedPlayers.add(socket.id);
        
        // Broadcast elimination
        io.emit('playerEliminated', {
            id: socket.id,
            survivalTime: data.survivalTime
        });
        
        // Check if game should end
        checkGameEnd();
    });
    
    // Handle ping
    socket.on('ping', () => {
        socket.emit('pong', Date.now());
    });
    
    // Handle laser firing
    socket.on('laserFired', (data) => {
        const player = gameState.players.get(socket.id);
        if (!player || player.eliminated) return;
        
        const laserId = Date.now().toString();
        const laser = {
            id: laserId,
            ownerId: socket.id,
            position: { ...player.position },
            rotation: { ...player.rotation },
            startTime: Date.now()
        };
        
        gameState.lasers.set(laserId, laser);
        io.emit('laserFired', laser);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        // Remove player from game state
        gameState.players.delete(socket.id);
        gameState.playerPositions.delete(socket.id);
        gameState.playerLastUpdate.delete(socket.id);
        gameState.playerPing.delete(socket.id);
        gameState.eliminatedPlayers.delete(socket.id);
        
        // Notify other players
        socket.broadcast.emit('playerLeft', socket.id);
        
        // Check if game should end
        if (gameState.gameStatus === 'active') {
            checkGameEnd();
        }
    });
});

// Game loop
setInterval(() => {
    const now = Date.now();
    
    // Update game state
    if (gameState.gameStatus === 'active') {
        // Update survival time for active players
        gameState.players.forEach((player) => {
            if (!player.eliminated) {
                player.survivalTime += UPDATE_INTERVAL / 1000;
            }
        });
        
        // Update lasers
        updateLasers();
        
        // Check for game end
        checkGameEnd();
    }
    
    // Handle countdown
    if (gameState.gameStatus === 'countdown') {
        const elapsed = now - gameState.roundStartTime;
        const newCountdownValue = Math.ceil(3 - elapsed / 1000);
        
        if (newCountdownValue !== gameState.countdownValue) {
            gameState.countdownValue = newCountdownValue;
            io.emit('countdownUpdate', gameState.countdownValue);
            
            if (newCountdownValue <= 0) {
                gameState.gameStatus = 'active';
                io.emit('gameStart');
            }
        }
    }
    
    // Broadcast game state updates
    if (now - (gameState.lastUpdateTime || 0) >= UPDATE_INTERVAL) {
        io.emit('gameStateUpdate', {
            players: Array.from(gameState.players.entries()),
            gameStatus: gameState.gameStatus,
            countdownValue: gameState.countdownValue,
            roundNumber: gameState.roundNumber,
            eliminatedPlayers: Array.from(gameState.eliminatedPlayers)
        });
        gameState.lastUpdateTime = now;
    }
}, UPDATE_INTERVAL);

// Start server
const port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 