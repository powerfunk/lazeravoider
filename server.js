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
const ARENA_SIZE = 200;
const MAX_HEALTH = 3;
const SNOWMAN_RESPAWN_TIME = 5000; // 5 seconds
const SNOWMAN_INVULNERABILITY_TIME = 2000; // 2 seconds of invulnerability after respawn
const PLAYER_COLLISION_RADIUS = 1.0; // Collision radius for players
const BOUNCE_FORCE = 0.3; // How much force is applied in collisions
const players = new Map();
const snowmen = [];
const lasers = new Map();

// Initialize snowmen with health and invulnerability state
for (let i = 0; i < 3; i++) {
    snowmen.push({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        health: MAX_HEALTH,
        lastFireTime: 0,
        isInvulnerable: false,
        invulnerabilityEndTime: 0
    });
}

// Laser speed constants
const LASER_SPEEDS = {
    SLOW: 14,
    MEDIUM: 21,
    FAST: 30
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

// Function to get random position within arena bounds
function getRandomPosition() {
    const margin = 5; // Keep away from edges
    return {
        x: (Math.random() - 0.5) * (ARENA_SIZE - margin * 2),
        y: 0,
        z: (Math.random() - 0.5) * (ARENA_SIZE - margin * 2)
    };
}

// Function to respawn a snowman
function respawnSnowman() {
    const position = getRandomPosition();
    const snowman = {
        position: position,
        velocity: {
            x: (Math.random() - 0.5) * 0.15,
            y: 0,
            z: (Math.random() - 0.5) * 0.15
        },
        health: MAX_HEALTH,
        lastFireTime: Date.now(),
        isInvulnerable: true,
        invulnerabilityEndTime: Date.now() + SNOWMAN_INVULNERABILITY_TIME
    };
    snowmen.push(snowman);
    
    // Notify clients about the new snowman
    io.emit('snowmanRespawned', {
        position: snowman.position,
        velocity: snowman.velocity,
        health: snowman.health,
        isInvulnerable: true
    });
}

// Update snowmen positions and handle firing
function updateSnowmen() {
    const currentTime = Date.now();
    
    snowmen.forEach((snowman, index) => {
        // Check invulnerability
        if (snowman.isInvulnerable && currentTime > snowman.invulnerabilityEndTime) {
            snowman.isInvulnerable = false;
            io.emit('snowmanVulnerable', { index: index });
        }

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

        // Handle laser firing (only if not invulnerable)
        if (!snowman.isInvulnerable && currentTime > snowman.lastFireTime + 2000) {
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
                speedType: speedType,
                isPlayerLaser: false,
                ownerId: null
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
        if (laser.isPlayerLaser) {
            // Player lasers can hit other players and snowmen
            // First check snowmen
            snowmen.forEach((snowman, index) => {
                // Skip if snowman is invulnerable
                if (snowman.isInvulnerable) return;

                const dx = snowman.position.x - laser.position.x;
                const dz = snowman.position.z - laser.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance < PLAYER_SIZE + LASER_SIZE) {
                    // Snowman hit by player laser
                    snowman.health--;
                    if (snowman.health <= 0) {
                        // Remove snowman and schedule respawn
                        snowmen.splice(index, 1);
                        io.emit('snowmanDied', {
                            position: snowman.position,
                            killerId: laser.ownerId
                        });
                        
                        // Schedule respawn
                        setTimeout(respawnSnowman, SNOWMAN_RESPAWN_TIME);
                    }
                    // Remove the laser that caused the hit
                    lasers.delete(laserId);
                    io.emit('laserDestroyed', { id: laserId });
                }
            });

            // Then check other players (but not the shooter)
            players.forEach((player, playerId) => {
                // Skip if player is dead, invulnerable, or is the shooter
                if (player.isDead || player.isInvulnerable || playerId === laser.ownerId) {
                    return;
                }

                const dx = player.position.x - laser.position.x;
                const dz = player.position.z - laser.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance < PLAYER_SIZE + LASER_SIZE) {
                    // Player hit by another player's laser
                    player.health--;
                    if (player.health <= 0) {
                        player.isDead = true;
                        player.deaths++;
                        
                        // Award kill to the shooter
                        const shooter = players.get(laser.ownerId);
                        if (shooter) {
                            shooter.kills = (shooter.kills || 0) + 1;
                            io.emit('playerStatsUpdate', {
                                id: laser.ownerId,
                                kills: shooter.kills,
                                deaths: shooter.deaths
                            });
                        }

                        io.emit('playerDied', {
                            id: playerId,
                            kills: player.kills,
                            deaths: player.deaths
                        });
                    }
                    // Remove the laser that caused the hit
                    lasers.delete(laserId);
                    io.emit('laserDestroyed', { id: laserId });
                }
            });
        } else {
            // Snowman lasers only hit players
            players.forEach((player, playerId) => {
                if (player.isDead || player.isInvulnerable) {
                    return;
                }

                const dx = player.position.x - laser.position.x;
                const dz = player.position.z - laser.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance < PLAYER_SIZE + LASER_SIZE) {
                    // Player hit by snowman laser
                    player.health--;
                    if (player.health <= 0) {
                        player.isDead = true;
                        player.deaths++;
                        io.emit('playerDied', {
                            id: playerId,
                            kills: player.kills,
                            deaths: player.deaths
                        });
                    }
                    // Remove the laser that caused the hit
                    lasers.delete(laserId);
                    io.emit('laserDestroyed', { id: laserId });
                }
            });
        }
    });
}

// Function to calculate player speed
function getPlayerSpeed(velocity) {
    return Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
}

// Function to handle player collisions
function handlePlayerCollisions() {
    const playerArray = Array.from(players.entries());
    
    for (let i = 0; i < playerArray.length; i++) {
        const [id1, player1] = playerArray[i];
        if (player1.isDead) continue;

        for (let j = i + 1; j < playerArray.length; j++) {
            const [id2, player2] = playerArray[j];
            if (player2.isDead) continue;

            // Calculate distance between players
            const dx = player2.position.x - player1.position.x;
            const dz = player2.position.z - player1.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            // Check for collision
            if (distance < PLAYER_COLLISION_RADIUS * 2) {
                // Calculate collision normal
                const nx = dx / distance;
                const nz = dz / distance;

                // Calculate relative velocity
                const relativeVx = player2.velocity.x - player1.velocity.x;
                const relativeVz = player2.velocity.z - player1.velocity.z;
                const relativeSpeed = Math.sqrt(relativeVx * relativeVx + relativeVz * relativeVz);

                // Calculate player speeds
                const speed1 = getPlayerSpeed(player1.velocity);
                const speed2 = getPlayerSpeed(player2.velocity);

                // Determine which player is moving faster
                const fasterPlayer = speed1 > speed2 ? player1 : player2;
                const slowerPlayer = speed1 > speed2 ? player2 : player1;

                // Apply bounce force
                const bounceForce = BOUNCE_FORCE * relativeSpeed;
                
                // Move players apart to prevent sticking
                const overlap = (PLAYER_COLLISION_RADIUS * 2) - distance;
                const moveX = nx * overlap * 0.5;
                const moveZ = nz * overlap * 0.5;

                // Update positions
                player1.position.x -= moveX;
                player1.position.z -= moveZ;
                player2.position.x += moveX;
                player2.position.z += moveZ;

                // Apply bounce velocities
                fasterPlayer.velocity.x += nx * bounceForce;
                fasterPlayer.velocity.z += nz * bounceForce;
                slowerPlayer.velocity.x -= nx * bounceForce * 0.5;
                slowerPlayer.velocity.z -= nz * bounceForce * 0.5;

                // Notify clients about the collision
                io.emit('playerCollision', {
                    player1: {
                        id: id1,
                        position: player1.position,
                        velocity: player1.velocity
                    },
                    player2: {
                        id: id2,
                        position: player2.position,
                        velocity: player2.velocity
                    }
                });
            }
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
        playerName: 'Player' + socket.id.slice(0, 4),
        health: MAX_HEALTH,
        kills: 0,
        deaths: 0
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
            player.health = MAX_HEALTH;
            player.position = {
                x: (Math.random() - 0.5) * (ARENA_SIZE - 4),
                y: 0,
                z: (Math.random() - 0.5) * (ARENA_SIZE - 4)
            };
            player.velocity = { x: 0, y: 0, z: 0 };
            
            io.emit('playerRespawn', {
                id: socket.id,
                position: player.position,
                health: player.health
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

    socket.on('playerFiredLaser', (data) => {
        const laserId = Date.now().toString();
        lasers.set(laserId, {
            position: data.position,
            velocity: data.velocity,
            ownerId: socket.id,
            isPlayerLaser: true,
            birthTime: Date.now()
        });
        
        // Broadcast to all clients
        io.emit('playerFiredLaser', {
            id: laserId,
            position: data.position,
            velocity: data.velocity,
            ownerId: socket.id
        });
    });
    
    socket.on('snowmanDied', (data) => {
        // Find the snowman that died
        const snowmanIndex = snowmen.findIndex(s => 
            Math.abs(s.position.x - data.position.x) < 1 &&
            Math.abs(s.position.z - data.position.z) < 1
        );
        
        if (snowmanIndex !== -1) {
            // Award kill to the player who fired the laser
            const player = players.get(data.killerId);
            if (player) {
                player.kills = (player.kills || 0) + 1;
                io.emit('playerStatsUpdate', {
                    id: data.killerId,
                    kills: player.kills,
                    deaths: player.deaths
                });
            }
            
            // Respawn snowman after delay
            setTimeout(() => {
                if (snowmen.length < 3) {
                    snowmen.push({
                        position: {
                            x: (Math.random() - 0.5) * (ARENA_SIZE - 4),
                            y: 0,
                            z: (Math.random() - 0.5) * (ARENA_SIZE - 4)
                        },
                        velocity: {
                            x: (Math.random() - 0.5) * 7.875,
                            y: 0,
                            z: (Math.random() - 0.5) * 7.875
                        },
                        health: MAX_HEALTH,
                        lastFireTime: Date.now()
                    });
                }
            }, 5000); // Respawn after 5 seconds
        }
    });
    
    // Update player state to include health and stats
    socket.on('playerJoin', (data) => {
        players.set(socket.id, {
            position: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            playerName: data.playerName || 'Player' + socket.id.slice(0, 4),
            health: MAX_HEALTH,
            kills: 0,
            deaths: 0,
            isDead: false
        });
    });
    
    // Update player death handling
    socket.on('playerDied', () => {
        const player = players.get(socket.id);
        if (player) {
            player.isDead = true;
            player.deaths++;
            player.health = MAX_HEALTH; // Reset health for respawn
            
            // Broadcast death to all clients
            io.emit('playerDied', {
                id: socket.id,
                kills: player.kills,
                deaths: player.deaths
            });
        }
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
    
    // Update player positions and handle collisions at 30 FPS
    if (currentTime - lastPlayersUpdate >= UPDATE_RATES.PLAYERS) {
        handlePlayerCollisions();
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
}, 16.67);

// Update game loop to handle health and damage
setInterval(() => {
    // Update lasers
    for (const [id, laser] of lasers) {
        // Move laser
        laser.position.x += laser.velocity.x * (1/60);
        laser.position.z += laser.velocity.z * (1/60);
        
        // Check for hits
        if (laser.isPlayerLaser) {
            // Check snowman hits
            for (const snowman of snowmen) {
                const dx = snowman.position.x - laser.position.x;
                const dz = snowman.position.z - laser.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < 1.5) { // Hit radius
                    snowman.health--;
                    if (snowman.health <= 0) {
                        // Remove snowman
                        const index = snowmen.indexOf(snowman);
                        if (index !== -1) {
                            snowmen.splice(index, 1);
                            io.emit('snowmanDied', {
                                position: snowman.position,
                                killerId: laser.ownerId
                            });
                        }
                    }
                    lasers.delete(id);
                    break;
                }
            }
        } else {
            // Check player hits
            for (const [playerId, player] of players) {
                if (player.isDead) continue;
                
                const dx = player.position.x - laser.position.x;
                const dz = player.position.z - laser.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < 1.5) { // Hit radius
                    player.health--;
                    if (player.health <= 0) {
                        player.isDead = true;
                        player.deaths++;
                        io.emit('playerDied', {
                            id: playerId,
                            kills: player.kills,
                            deaths: player.deaths
                        });
                    }
                    lasers.delete(id);
                    break;
                }
            }
        }
        
        // Remove old lasers
        if (Date.now() - laser.birthTime > 2500) {
            lasers.delete(id);
        }
    }
    
    // Broadcast updates
    io.emit('laserUpdate', Array.from(lasers.entries()));
    io.emit('snowmanUpdate', snowmen.map(s => ({
        position: s.position,
        velocity: s.velocity,
        health: s.health
    })));
}, 1000 / 60);

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 