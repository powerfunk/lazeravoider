const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Game state management
const gameState = {
    players: new Map(),
    eliminatedPlayers: new Set(),
    gameStarted: false,
    countdownActive: false,
    countdownValue: 3,
    minPlayers: 2,
    maxPlayers: 10
};

// Serve static files
app.use(express.static('.'));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Check if game is full
    if (gameState.players.size >= gameState.maxPlayers) {
        socket.emit('gameFull');
        socket.disconnect();
        return;
    }

    // Add player to game
    gameState.players.set(socket.id, {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: Math.PI, z: 0 },
        color: Math.floor(Math.random() * 0xFFFFFF),
        isEliminated: false,
        survivalTime: 0
    });

    // Send current game state to new player
    socket.emit('gameState', {
        players: Array.from(gameState.players.entries()),
        eliminatedPlayers: Array.from(gameState.eliminatedPlayers),
        gameStarted: gameState.gameStarted,
        countdownActive: gameState.countdownActive,
        countdownValue: gameState.countdownValue
    });

    // Notify other players
    socket.broadcast.emit('playerJoined', gameState.players.get(socket.id));

    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && !player.isEliminated) {
            player.position = data.position;
            player.rotation = data.rotation;
            socket.broadcast.emit('playerMoved', player);
        }
    });

    // Handle player elimination
    socket.on('playerEliminated', (data) => {
        const player = gameState.players.get(socket.id);
        if (player && !player.isEliminated) {
            player.isEliminated = true;
            player.survivalTime = data.survivalTime;
            gameState.eliminatedPlayers.add(socket.id);
            
            // Broadcast elimination
            io.emit('playerEliminated', {
                id: socket.id,
                survivalTime: data.survivalTime
            });

            // Check if game should end
            checkGameEnd();
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        gameState.players.delete(socket.id);
        gameState.eliminatedPlayers.delete(socket.id);
        io.emit('playerLeft', socket.id);
        
        // Check if game should end
        checkGameEnd();
    });
});

// Game state management functions
function startGame() {
    if (gameState.players.size >= gameState.minPlayers && !gameState.gameStarted) {
        gameState.gameStarted = true;
        gameState.countdownActive = true;
        gameState.countdownValue = 3;
        
        // Start countdown
        const countdownInterval = setInterval(() => {
            gameState.countdownValue--;
            io.emit('countdownUpdate', gameState.countdownValue);
            
            if (gameState.countdownValue <= 0) {
                clearInterval(countdownInterval);
                gameState.countdownActive = false;
                io.emit('gameStart');
            }
        }, 1000);
    }
}

function checkGameEnd() {
    const activePlayers = Array.from(gameState.players.values())
        .filter(player => !player.isEliminated);
    
    if (activePlayers.length <= 1 && gameState.gameStarted) {
        // Game over - we have a winner
        const winner = activePlayers[0];
        if (winner) {
            io.emit('gameOver', {
                winner: winner.id,
                survivalTime: winner.survivalTime
            });
        }
        
        // Reset game state after delay
        setTimeout(() => {
            gameState.players.clear();
            gameState.eliminatedPlayers.clear();
            gameState.gameStarted = false;
            gameState.countdownActive = false;
            io.emit('gameReset');
        }, 3000);
    }
}

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 