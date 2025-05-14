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
    // Broadcast initial snowman positions to all clients
    io.emit('snowmanUpdate', snowmen);
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
            snowman.position.x = Math.sign(snowman.position.x) * 10;
        }
        if (Math.abs(snowman.position.z) > 10) {
            snowman.velocity.z *= -1;
            snowman.position.z = Math.sign(snowman.position.z) * 10;
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
    
    // Send game state and current snowman positions
    socket.emit('gameState', {
        isRoundInProgress,
        snowmen: snowmen // Send current snowman positions
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
            // Update player position and velocity
            player.position = data.position;
            player.velocity = data.velocity;
            
            // Broadcast to all other players
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                velocity: data.velocity
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
                
                // Start new round after countdown
                setTimeout(() => {
                    isRoundInProgress = true;
                    // Reset all players
                    players.forEach(p => {
                        p.isDead = false;
                        p.position = { x: 0, y: 0, z: 0 };
                    });
                    // Reinitialize snowmen for new round
                    initializeSnowmen();
                    io.emit('roundStart');
                }, 3000); // Wait for 3-second countdown
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
            // Reinitialize snowmen for new round
            initializeSnowmen();
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