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
const ARENA_SIZE = 29; // Updated to match client
const players = new Map();
const snowmen = [
    { position: { x: -5, y: 0, z: -5 }, velocity: { x: 0.1, y: 0, z: 0.1 } },
    { position: { x: 5, y: 0, z: -5 }, velocity: { x: -0.1, y: 0, z: 0.1 } },
    { position: { x: 0, y: 0, z: 5 }, velocity: { x: 0.1, y: 0, z: -0.1 } }
];
const lasers = new Map(); // Track active lasers

// Update snowmen positions
function updateSnowmen() {
    snowmen.forEach(snowman => {
        // Update position
        snowman.position.x += snowman.velocity.x;
        snowman.position.z += snowman.velocity.z;
        
        // Bounce off walls with slight randomization
        if (Math.abs(snowman.position.x) > ARENA_SIZE/2 - 1) {
            snowman.velocity.x *= -1;
            // Add slight random variation to velocity
            snowman.velocity.x += (Math.random() - 0.5) * 0.02;
            snowman.velocity.z += (Math.random() - 0.5) * 0.02;
            // Keep velocity within reasonable bounds
            snowman.velocity.x = Math.max(Math.min(snowman.velocity.x, 0.15), -0.15);
            snowman.velocity.z = Math.max(Math.min(snowman.velocity.z, 0.15), -0.15);
        }
        if (Math.abs(snowman.position.z) > ARENA_SIZE/2 - 1) {
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

// Check for laser hits
function checkLaserHits() {
    const PLAYER_SIZE = 0.5;
    const LASER_SIZE = 1.0;

    lasers.forEach((laser, laserId) => {
        // Check each player for collision
        players.forEach((player, playerId) => {
            // Skip if player is dead or invulnerable
            if (player.isDead || player.isInvulnerable) {
                return;
            }

            // Calculate distance in XZ plane only (ignore Y)
            const dx = player.position.x - laser.position.x;
            const dz = player.position.z - laser.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            // Log detailed hit detection info
            console.log('Server hit detection check:', {
                playerId,
                laserId,
                playerPos: { x: player.position.x, z: player.position.z },
                laserPos: { x: laser.position.x, z: laser.position.z },
                distance,
                hitDistance: PLAYER_SIZE + LASER_SIZE,
                isDead: player.isDead,
                isInvulnerable: player.isInvulnerable
            });

            // Check for collision
            if (distance < PLAYER_SIZE + LASER_SIZE) {
                console.log('Server detected hit:', {
                    playerId,
                    laserId,
                    distance,
                    hitDistance: PLAYER_SIZE + LASER_SIZE,
                    playerPos: { x: player.position.x, z: player.position.z },
                    laserPos: { x: laser.position.x, z: laser.position.z }
                });
                
                // Player hit by laser - server authority
                player.isDead = true;
                io.emit('playerDied', { id: playerId });
                
                // Remove the laser that caused the hit
                lasers.delete(laserId);
            }
        });
    });
}

// Update lasers
function updateLasers() {
    const currentTime = Date.now();
    const deltaTime = 1/60; // Assuming 60 FPS
    
    for (const [laserId, laser] of lasers.entries()) {
        // Update position based on velocity (convert to per-frame movement)
        laser.position.x += laser.velocity.x * deltaTime;
        laser.position.z += laser.velocity.z * deltaTime;

        // Bounce off walls
        if (Math.abs(laser.position.x) > ARENA_SIZE/2 - 1) {
            laser.position.x = Math.sign(laser.position.x) * (ARENA_SIZE/2 - 1);
            laser.velocity.x *= -1;
        }
        if (Math.abs(laser.position.z) > ARENA_SIZE/2 - 1) {
            laser.position.z = Math.sign(laser.position.z) * (ARENA_SIZE/2 - 1);
            laser.velocity.z *= -1;
        }

        // Check if laser has expired
        if (currentTime - laser.birthTime > 2500) { // 2.5 seconds
            lasers.delete(laserId);
        }
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Add player to game
    players.set(socket.id, {
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        isDead: false,
        isInvulnerable: false,
        invulnerabilityStartTime: 0,
        playerName: 'Player' + socket.id.slice(0, 4) // Default name
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
        isDead: false,
        playerName: players.get(socket.id).playerName
    });
    
    // Handle player name update
    socket.on('updatePlayerName', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.playerName = data.playerName;
            // Broadcast name update to all players
            io.emit('playerNameUpdated', {
                id: socket.id,
                playerName: data.playerName
            });
        }
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
            console.log('Server handling respawn for player:', socket.id);
            // Reset all player state
            player.isDead = false;
            player.isInvulnerable = true;
            player.invulnerabilityStartTime = Date.now();
            player.position = { x: 0, y: 0, z: 0 }; // Reset to center
            player.velocity = { x: 0, y: 0, z: 0 }; // Reset velocity
            
            // Broadcast respawn to all clients
            io.emit('playerRespawn', {
                id: socket.id,
                position: player.position,
                velocity: player.velocity
            });
        }
    });

    // Handle snowman firing laser
    socket.on('snowmanFiredLaser', (data) => {
        const laserId = Date.now().toString();
        // Create a deep copy of the position and velocity
        const position = {
            x: data.position.x,
            y: 2.4, // Match client height
            z: data.position.z
        };
        const velocity = {
            x: data.velocity.x,
            y: 0,
            z: data.velocity.z
        };
        
        lasers.set(laserId, {
            position: position,
            velocity: velocity,
            birthTime: Date.now()
        });
        
        io.emit('laserCreated', {
            id: laserId,
            position: position,
            velocity: velocity
        });
    });
    
    // Handle chat messages
    socket.on('chatMessage', (data) => {
        console.log('Received chat message:', {
            from: socket.id,
            message: data.message,
            playerName: players.get(socket.id).playerName
        });
        
        // Broadcast the message to ALL clients, including sender
        io.emit('chatMessage', {
            playerId: socket.id,
            message: data.message,
            playerName: players.get(socket.id).playerName
        });
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
    updateLasers();
    checkLaserHits(); // Server checks hits every frame
    io.emit('snowmanUpdate', snowmen);
    io.emit('laserUpdate', Array.from(lasers.entries()));
}, 1000 / 60); // 60 updates per second

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 