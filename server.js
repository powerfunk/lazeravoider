const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files from the root directory
app.use(express.static(__dirname));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state
const players = new Map();
const snowmen = [
    { position: { x: -5, y: 0, z: -5 }, velocity: { x: 0.1, y: 0, z: 0.1 } },
    { position: { x: 5, y: 0, z: -5 }, velocity: { x: -0.1, y: 0, z: 0.1 } },
    { position: { x: 0, y: 0, z: 5 }, velocity: { x: 0.1, y: 0, z: -0.1 } }
];

// Update snowmen positions
function updateSnowmen() {
    snowmen.forEach(snowman => {
        // Update position
        snowman.position.x += snowman.velocity.x;
        snowman.position.z += snowman.velocity.z;
        
        // Bounce off walls with slight randomization
        if (Math.abs(snowman.position.x) > 9) {
            snowman.velocity.x *= -1;
            // Add slight random variation to velocity
            snowman.velocity.x += (Math.random() - 0.5) * 0.02;
            snowman.velocity.z += (Math.random() - 0.5) * 0.02;
            // Keep velocity within reasonable bounds
            snowman.velocity.x = Math.max(Math.min(snowman.velocity.x, 0.15), -0.15);
            snowman.velocity.z = Math.max(Math.min(snowman.velocity.z, 0.15), -0.15);
        }
        if (Math.abs(snowman.position.z) > 9) {
            snowman.velocity.z *= -1;
            // Add slight random variation to velocity
            snowman.velocity.x += (Math.random() - 0.5) * 0.02;
            snowman.velocity.z += (Math.random() - 0.5) * 0.02;
            // Keep velocity within reasonable bounds
            snowman.velocity.x = Math.max(Math.min(snowman.velocity.x, 0.15), -0.15);
            snowman.velocity.z = Math.max(Math.min(snowman.velocity.z, 0.15), -0.15);
        }
    });
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Add player to game
    players.set(socket.id, {
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        isDead: false
    });
    
    // Send current game state to new player
    socket.emit('gameState', {
        snowmen: snowmen
    });
    
    // Send current players to new player
    socket.emit('currentPlayers', Array.from(players.entries()));
    
    // Notify other players of new player
    socket.broadcast.emit('playerJoined', {
        id: socket.id,
        isDead: false
    });
    
    // Handle snowman update requests
    socket.on('requestSnowmanUpdate', () => {
        socket.emit('snowmanUpdate', snowmen);
    });
    
    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = data.position;
            player.velocity = data.velocity;
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
            socket.broadcast.emit('playerDied', { id: socket.id });
        }
    });
    
    // Handle player respawn
    socket.on('playerRespawn', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.isDead = false;
            player.position = data.position;
            player.velocity = data.velocity;
            socket.broadcast.emit('playerRespawn', {
                id: socket.id,
                position: data.position,
                velocity: data.velocity
            });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        players.delete(socket.id);
        io.emit('playerLeft', socket.id);
    });
});

// Update game state and broadcast to all clients
setInterval(() => {
    updateSnowmen();
    io.emit('snowmanUpdate', snowmen);
}, 1000 / 60); // 60 updates per second

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 