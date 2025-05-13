const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the current directory
app.use(express.static('./'));

// Game state
const MAX_PLAYERS = 10;
const players = new Map();

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Check if game is full
    if (players.size >= MAX_PLAYERS) {
        socket.emit('gameFull');
        socket.disconnect();
        return;
    }

    // Add new player
    players.set(socket.id, {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 }
    });

    // Send current players to new player
    socket.emit('currentPlayers', Object.fromEntries(players));

    // Notify other players about new player
    socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 }
    });

    // Handle player movement
    socket.on('playerMove', (data) => {
        if (players.has(socket.id)) {
            players.set(socket.id, {
                ...players.get(socket.id),
                position: data.position,
                rotation: data.rotation
            });
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation
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

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 