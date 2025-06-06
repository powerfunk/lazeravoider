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
const ARENA_SIZE = 38;
const players = new Map();
const snowmen = [
    { position: { x: -5, y: 0, z: -5 }, velocity: { x: 0.1, y: 0, z: 0.1 }, lastFireTime: 0, nextFireTime: 0 },
    { position: { x: 5, y: 0, z: -5 }, velocity: { x: -0.1, y: 0, z: 0.1 }, lastFireTime: 0, nextFireTime: 0 },
    { position: { x: 0, y: 0, z: 5 }, velocity: { x: 0.1, y: 0, z: -0.1 }, lastFireTime: 0, nextFireTime: 0 }
];
const lasers = new Map();

// Laser speed constants
const LASER_SPEEDS = {
    SLOW: 14,
    MEDIUM: 19,
    FAST: 24
};

// Update rate constants (in milliseconds)
const UPDATE_RATES = {
    SNOWMEN: 50,    // 20 FPS
    LASERS: 33,     // 30 FPS
    PLAYERS: 33,    // 30 FPS
    HITS: 16.67     // 60 FPS
};

// Last update timestamps
let lastSnowmenUpdate = 0;
let lastLasersUpdate = 0;
let lastPlayersUpdate = 0;
let lastHitsUpdate = 0;

// Update snowmen positions and handle firing
function updateSnowmen() {
    const currentTime = Date.now();
    
    snowmen.forEach((snowman, index) => {
        // Update position
        snowman.position.x += snowman.velocity.x;
        snowman.position.z += snowman.velocity.z;
        
        // Bounce off walls with slight randomization
        if (Math.abs(snowman.position.x) > ARENA_SIZE/2 - 1) {
            snowman.velocity.x *= -1;
            snowman.velocity.x += (Math.random() - 0.5) * 0.02;
            snowman.velocity.z += (Math.random() - 0.5) * 0.02;
            snowman.velocity.x = Math.max(Math.min(snowman.velocity.x, 0.15), -0.15);
            snowman.velocity.z = Math.max(Math.min(snowman.velocity.z, 0.15), -0.15);
        }
        if (Math.abs(snowman.position.z) > ARENA_SIZE/2 - 1) {
            snowman.velocity.z *= -1;
            snowman.velocity.x += (Math.random() - 0.5) * 0.02;
            snowman.velocity.z += (Math.random() - 0.5) * 0.02;
            snowman.velocity.x = Math.max(Math.min(snowman.velocity.x, 0.15), -0.15);
            snowman.velocity.z = Math.max(Math.min(snowman.velocity.z, 0.15), -0.15);
        }

        // Handle laser firing
        if (currentTime > snowman.nextFireTime) {
            // Randomly choose laser speed
            const speedType = Math.floor(Math.random() * 3); // 0=slow, 1=medium, 2=fast
            let speed;
            switch(speedType) {
                case 0: speed = LASER_SPEEDS.SLOW; break;
                case 1: speed = LASER_SPEEDS.MEDIUM; break;
                case 2: speed = LASER_SPEEDS.FAST; break;
            }

            // Calculate random direction
            const angle = Math.random() * Math.PI * 2;
            const velocity = {
                x: Math.cos(angle) * speed,
                y: 0,
                z: Math.sin(angle) * speed
            };

            // Create laser
            const laserId = Date.now().toString() + index;
            lasers.set(laserId, {
                position: {
                    x: snowman.position.x,
                    y: 2.4,
                    z: snowman.position.z
                },
                velocity: velocity,
                birthTime: currentTime,
                speedType: speedType // Add speed type for client-side effects
            });

            // Notify all clients about the new laser
            io.emit('laserCreated', {
                id: laserId,
                position: {
                    x: snowman.position.x,
                    y: 2.4,
                    z: snowman.position.z
                },
                velocity: velocity,
                speedType: speedType
            });

            // Update snowman's firing times
            snowman.lastFireTime = currentTime;
            snowman.nextFireTime = currentTime + Math.random() * (2500 - 1500) + 1500; // Random time between 1.5-2.5 seconds
        }
    });
}

// Update lasers
function updateLasers() {
    const currentTime = Date.now();
    const deltaTime = 1/60; // Assuming 60 FPS
    
    for (const [laserId, laser] of lasers.entries()) {
        // Update position based on velocity
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
            io.emit('laserDestroyed', { id: laserId });
        }
    }
}

// Check for laser hits
function checkLaserHits() {
    const PLAYER_SIZE = 0.5;
    const LASER_SIZE = 1.0;

    lasers.forEach((laser, laserId) => {
        players.forEach((player, playerId) => {
            if (player.isDead || player.isInvulnerable) {
                return;
            }

            const dx = player.position.x - laser.position.x;
            const dz = player.position.z - laser.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < PLAYER_SIZE + LASER_SIZE) {
                // Player hit by laser - server authority
                player.isDead = true;
                io.emit('playerDied', { id: playerId });
                
                // Remove the laser that caused the hit
                lasers.delete(laserId);
                io.emit('laserDestroyed', { id: laserId });
            }
        });
    });
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
        playerName: 'Player' + socket.id.slice(0, 4)
    });
    
    // Send current game state to new player
    socket.emit('gameState', {
        snowmen: snowmen,
        lasers: Array.from(lasers.entries())
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
            io.emit('playerNameUpdated', {
                id: socket.id,
                playerName: data.playerName
            });
        }
    });
    
    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (player && !player.isDead) {
            // Server validates and updates player position
            player.position = data.position;
            player.velocity = data.velocity;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                velocity: data.velocity
            });
        }
    });
    
    // Handle player respawn
    socket.on('playerRespawn', () => {
        const player = players.get(socket.id);
        if (player) {
            player.isDead = false;
            player.isInvulnerable = true;
            player.invulnerabilityStartTime = Date.now();
            player.position = { x: 0, y: 0, z: 0 };
            player.velocity = { x: 0, y: 0, z: 0 };
            
            io.emit('playerRespawn', {
                id: socket.id,
                position: player.position,
                velocity: player.velocity
            });
        }
    });
    
    // Handle chat messages
    socket.on('chatMessage', (data) => {
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

// Start game loop
setInterval(() => {
    const currentTime = Date.now();
    
    // Update snowmen at 20 FPS
    if (currentTime - lastSnowmenUpdate >= UPDATE_RATES.SNOWMEN) {
        updateSnowmen();
        io.emit('snowmanUpdate', snowmen);
        lastSnowmenUpdate = currentTime;
    }
    
    // Update lasers at 30 FPS
    if (currentTime - lastLasersUpdate >= UPDATE_RATES.LASERS) {
        updateLasers();
        lastLasersUpdate = currentTime;
    }
    
    // Update player positions at 30 FPS
    if (currentTime - lastPlayersUpdate >= UPDATE_RATES.PLAYERS) {
        players.forEach((player, playerId) => {
            io.emit('playerMoved', {
                id: playerId,
                position: player.position,
                velocity: player.velocity
            });
        });
        lastPlayersUpdate = currentTime;
    }
    
    // Check hits at 60 FPS for precision
    if (currentTime - lastHitsUpdate >= UPDATE_RATES.HITS) {
        checkLaserHits();
        lastHitsUpdate = currentTime;
    }
}, 16.67); // Run the main loop at 60 FPS but update different elements at their own rates

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 