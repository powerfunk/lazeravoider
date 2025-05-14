const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state
const players = new Map();
const MAX_PLAYERS = 10;

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Check if server is full
    if (players.size >= MAX_PLAYERS) {
        socket.emit('serverFull');
        socket.disconnect();
        return;
    }

    // Add new player
    players.set(socket.id, {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        isDead: false
    });

    // Send current players to new player
    socket.emit('currentPlayers', Array.from(players.entries()));

    // Notify other players
    socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 }
    });

    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = data.position;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position
            });
        }
    });

    // Handle player death
    socket.on('playerDied', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.isDead = true;
            socket.broadcast.emit('playerDied', {
                id: socket.id,
                survivalTime: data.survivalTime
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

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 