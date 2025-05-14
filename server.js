const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state
let players = new Map();
const MAX_PLAYERS = 10;
let isRoundInProgress = false;
let snowmen = [];

// Initialize snowmen
function initializeSnowmen() {
    snowmen = [];
    for (let i = 0; i < 3; i++) {
        snowmen.push({
            position: { x: (Math.random() - 0.5) * 10, y: 0, z: (Math.random() - 0.5) * 10 },
            velocity: { x: (Math.random() - 0.5) * 0.1, y: 0, z: (Math.random() - 0.5) * 0.1 }
        });
    }
}

// Update snowmen positions
function updateSnowmen() {
    snowmen.forEach(snowman => {
        // Update position
        snowman.position.x += snowman.velocity.x;
        snowman.position.z += snowman.velocity.z;
        
        // Bounce off walls
        if (Math.abs(snowman.position.x) > 10) {
            snowman.velocity.x *= -1;
        }
        if (Math.abs(snowman.position.z) > 10) {
            snowman.velocity.z *= -1;
        }
    });
    
    // Broadcast snowman positions to all clients
    io.emit('snowmanUpdate', snowmen);
}

// Start snowman update interval
setInterval(updateSnowmen, 1000 / 60); // 60 updates per second

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Check if server is full
    if (players.size >= MAX_PLAYERS) {
        socket.emit('serverFull');
        socket.disconnect();
        return;
    }

    // Initialize snowmen if this is the first player
    if (players.size === 0) {
        initializeSnowmen();
    }

    // Add new player
    players.set(socket.id, {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        isDead: false
    });

    // Send current players to new player
    socket.emit('currentPlayers', Array.from(players.entries()));
    
    // Send game state
    socket.emit('gameState', {
        isRoundInProgress,
        snowmen
    });

    // Notify other players
    socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        isDead: false
    });

    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (player && !player.isDead) {
            player.position = data.position;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position
            });
        }
    });

    // Handle player death
    socket.on('playerDied', () => {
        const player = players.get(socket.id);
        if (player) {
            player.isDead = true;
            socket.broadcast.emit('playerDied', {
                id: socket.id
            });

            // Check if all players are dead
            const allPlayersDead = Array.from(players.values()).every(p => p.isDead);
            if (allPlayersDead) {
                isRoundInProgress = false;
                io.emit('roundEnd');
                
                // If there's only one player, start a new round immediately
                if (players.size === 1) {
                    setTimeout(() => {
                        isRoundInProgress = true;
                        players.forEach(p => {
                            p.isDead = false;
                            p.position = { x: 0, y: 0, z: 0 };
                        });
                        io.emit('roundStart');
                    }, 2000);
                }
            }
        }
    });

    // Handle round start
    socket.on('roundStart', () => {
        if (!isRoundInProgress) {
            isRoundInProgress = true;
            // Reset all players
            players.forEach(player => {
                player.isDead = false;
                player.position = { x: 0, y: 0, z: 0 };
            });
            io.emit('roundStart');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        players.delete(socket.id);
        io.emit('playerLeft', socket.id);

        // If no players left, reset round state
        if (players.size === 0) {
            isRoundInProgress = false;
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 