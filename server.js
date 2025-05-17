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
const ARENA_SIZE = 177; // Match client arena size
const SNOWMAN_SPEED = 0.04; // Match client snowman speed
const SNOWMAN_RESPAWN_TIME = 2000; // 2 seconds
const SNOWMAN_INVULNERABILITY_TIME = 2000; // 2 seconds of invulnerability after respawn
const PLAYER_COLLISION_RADIUS = 1.0; // Collision radius for players
const BOUNCE_FORCE = 0.3; // How much force is applied in collisions
const players = new Map();
const snowmen = [];
const lasers = new Map();
const PLAYER_SPEED = {
    normal: 0.03,
    vehicle: 0.06
};
const PLAYER_MOMENTUM = 0.95;

// Initialize snowmen
for (let i = 0; i < 3; i++) {
    snowmen.push({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
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

        // Update position with new speed
        snowman.position.x += snowman.velocity.x * SNOWMAN_SPEED;
        snowman.position.z += snowman.velocity.z * SNOWMAN_SPEED;
        
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
            // Calculate random direction
            const angle = Math.random() * Math.PI * 2;
            const velocity = {
                x: Math.cos(angle),
                y: 0,
                z: Math.sin(angle)
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
                velocity: velocity
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
    const LASER_SPEED = 0.2; // Match client laser speed
    
    for (const [laserId, laser] of lasers.entries()) {
        if (laser.isVehicleMode) {
            // Vehicle mode: Move grenade forward until collision or timeout
            laser.position.x += laser.velocity.x * LASER_SPEED * deltaTime;
            laser.position.z += laser.velocity.z * LASER_SPEED * deltaTime;

            // Check for wall collisions
            const halfArena = ARENA_SIZE / 2;
            if (Math.abs(laser.position.x) > halfArena - 1 || Math.abs(laser.position.z) > halfArena - 1) {
                // Explode on wall hit
                handleGrenadeExplosion(laserId, laser);
                continue;
            }

            // Check if grenade has expired
            if (currentTime - laser.birthTime > 1000) { // 1 second for grenades
                handleGrenadeExplosion(laserId, laser);
                continue;
            }
        } else {
            // Top view mode: Bouncing laser behavior
            laser.position.x += laser.velocity.x * LASER_SPEED * deltaTime;
            laser.position.z += laser.velocity.z * LASER_SPEED * deltaTime;

            // Bounce off walls
            const halfArena = ARENA_SIZE / 2;
            if (Math.abs(laser.position.x) > halfArena - 1) {
                laser.position.x = Math.sign(laser.position.x) * (halfArena - 1);
                laser.velocity.x *= -1;
            }
            if (Math.abs(laser.position.z) > halfArena - 1) {
                laser.position.z = Math.sign(laser.position.z) * (halfArena - 1);
                laser.velocity.z *= -1;
            }

            // Check if laser has expired
            if (currentTime - laser.birthTime > 2500) { // 2.5 seconds for bouncing lasers
                lasers.delete(laserId);
                io.emit('laserDestroyed', { id: laserId });
                continue;
            }
        }

        // Emit updated laser position to all clients
        io.emit('laserUpdate', {
            id: laserId,
            position: laser.position,
            velocity: laser.velocity,
            isVehicleMode: laser.isVehicleMode
        });
    }
}

// Handle grenade explosion
function handleGrenadeExplosion(laserId, laser) {
    const EXPLOSION_RADIUS = 3.0;
    
    // Check for players and snowmen in explosion radius
    players.forEach((player, playerId) => {
        // Skip if player is dead or is the shooter
        if (player.isDead || playerId === laser.ownerId) return;

        const dx = player.position.x - laser.position.x;
        const dz = player.position.z - laser.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance <= EXPLOSION_RADIUS) {
            player.isDead = true;
            io.emit('playerDied', {
                playerId: playerId,
                killerId: laser.ownerId
            });
        }
    });

    // Check snowmen in explosion radius
    snowmen.forEach((snowman, index) => {
        if (snowman.isInvulnerable) return;

        const dx = snowman.position.x - laser.position.x;
        const dz = snowman.position.z - laser.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance <= EXPLOSION_RADIUS) {
            snowmen.splice(index, 1);
            io.emit('snowmanDied', {
                position: snowman.position,
                killerId: laser.ownerId
            });
            setTimeout(respawnSnowman, SNOWMAN_RESPAWN_TIME);
        }
    });

    // Remove the grenade and notify clients
    lasers.delete(laserId);
    io.emit('laserDestroyed', { 
        id: laserId,
        exploded: true,
        position: laser.position
    });
}

// Check for laser hits
function checkLaserHits() {
    const PLAYER_SIZE = 0.5;
    const LASER_SIZE = 1.0;
    const EXPLOSION_RADIUS = 3.0; // Match client explosion radius

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

                // Check for explosion radius if it's a vehicle mode laser
                if (laser.isVehicleMode) {
                    if (distance < EXPLOSION_RADIUS) {
                        // Snowman hit by explosion
                        snowmen.splice(index, 1);
                        io.emit('snowmanDied', {
                            position: snowman.position,
                            killerId: laser.ownerId
                        });
                        
                        // Schedule respawn
                        setTimeout(respawnSnowman, SNOWMAN_RESPAWN_TIME);
                    }
                } else if (distance < PLAYER_SIZE + LASER_SIZE) {
                    // Snowman hit by regular laser
                    snowmen.splice(index, 1);
                    io.emit('snowmanDied', {
                        position: snowman.position,
                        killerId: laser.ownerId
                    });
                    
                    // Schedule respawn
                    setTimeout(respawnSnowman, SNOWMAN_RESPAWN_TIME);
                }
            });

            // Then check other players (but not the shooter)
            players.forEach((player, playerId) => {
                // Skip if player is dead or is the shooter
                if (player.isDead || playerId === laser.ownerId) return;

                const dx = player.position.x - laser.position.x;
                const dz = player.position.z - laser.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);

                // Check for explosion radius if it's a vehicle mode laser
                if (laser.isVehicleMode) {
                    if (distance < EXPLOSION_RADIUS) {
                        // Player hit by explosion
                        player.isDead = true;
                        io.emit('playerDied', {
                            playerId: playerId,
                            killerId: laser.ownerId
                        });
                    }
                } else if (distance < PLAYER_SIZE + LASER_SIZE) {
                    // Player hit by regular laser
                    player.isDead = true;
                    io.emit('playerDied', {
                        playerId: playerId,
                        killerId: laser.ownerId
                    });
                }
            });

            // Remove the laser that caused the hit
            lasers.delete(laserId);
            io.emit('laserDestroyed', { id: laserId });
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
    
    // Initialize player
    players.set(socket.id, {
        id: socket.id,
        position: {
            x: Math.random() * ARENA_SIZE - ARENA_SIZE/2,
            y: 0.5,
            z: Math.random() * ARENA_SIZE - ARENA_SIZE/2
        },
        direction: { x: 0, y: 0, z: -1 },
        momentum: { x: 0, z: 0 },
        isDead: false,
        kills: 0,
        deaths: 0,
        view: 'normal', // 'normal' or 'vehicle'
        lastUpdate: Date.now()
    });
    
    // Send current game state to new player
    socket.emit('gameState', {
        isRoundInProgress: false
    });
    
    // Send current players to new player
    socket.emit('currentPlayers', Array.from(players.entries()));
    
    // Broadcast new player to all other players
    socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: players.get(socket.id).position,
        isDead: false
    });
    
    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        const now = Date.now();
        const deltaTime = (now - player.lastUpdate) / 1000; // Convert to seconds
        player.lastUpdate = now;
        
        // Update momentum based on view mode
        if (player.view === 'vehicle') {
            // Apply momentum in vehicle mode
            player.momentum.x = player.momentum.x * PLAYER_MOMENTUM + data.momentum.x;
            player.momentum.z = player.momentum.z * PLAYER_MOMENTUM + data.momentum.z;
            
            // Update position with momentum
            player.position.x += player.momentum.x;
            player.position.z += player.momentum.z;
        } else {
            // Direct position update in normal mode
            player.position.x = data.position.x;
            player.position.z = data.position.z;
        }
        
        // Keep player within arena bounds
        const halfSize = ARENA_SIZE / 2 - 0.5; // 0.5 is player size
        player.position.x = Math.max(-halfSize, Math.min(halfSize, player.position.x));
        player.position.z = Math.max(-halfSize, Math.min(halfSize, player.position.z));
        
        // Update direction
        player.direction = data.direction;
        
        // Broadcast updated position to all other players
        socket.broadcast.emit('playerMoved', {
            id: socket.id,
            position: player.position,
            direction: player.direction,
            momentum: player.momentum
        });
    });
    
    // Handle view mode change
    socket.on('viewChange', (data) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        player.view = data.view;
        // Reset momentum when changing views
        player.momentum = { x: 0, z: 0 };
        
        // Broadcast view change to all other players
        socket.broadcast.emit('playerViewChanged', {
            id: socket.id,
            view: player.view
        });
    });
    
    // Handle player death
    socket.on('playerDied', (data) => {
        const player = players.get(socket.id);
        if (!player) return;
        
        player.isDead = true;
        player.deaths++;
        
        // Broadcast death to all players
        io.emit('playerDied', {
            id: socket.id,
            killerId: data.killerId
        });
        
        // Update killer's stats
        if (data.killerId && players.has(data.killerId)) {
            const killer = players.get(data.killerId);
            killer.kills++;
        }
    });
    
    // Handle player respawn
    socket.on('playerRespawn', () => {
        const player = players.get(socket.id);
        if (!player) return;
        
        player.isDead = false;
        player.position = {
            x: Math.random() * ARENA_SIZE - ARENA_SIZE/2,
            y: 0.5,
            z: Math.random() * ARENA_SIZE - ARENA_SIZE/2
        };
        player.momentum = { x: 0, z: 0 };
        
        // Broadcast respawn to all players
        io.emit('playerRespawned', {
            id: socket.id,
            position: player.position
        });
    });
    
    // Handle player firing
    socket.on('playerFire', (data) => {
        const player = players.get(socket.id);
        if (!player || player.isDead) return;

        const laserId = Date.now().toString() + socket.id;
        const laser = {
            position: {
                x: data.position.x,
                y: data.position.y,
                z: data.position.z
            },
            velocity: {
                x: data.direction.x,
                y: 0,
                z: data.direction.z
            },
            birthTime: Date.now(),
            isPlayerLaser: true,
            ownerId: socket.id,
            isVehicleMode: data.isVehicleMode
        };

        lasers.set(laserId, laser);

        // Notify all clients about the new laser
        io.emit('laserCreated', {
            id: laserId,
            position: laser.position,
            velocity: laser.velocity,
            isVehicleMode: data.isVehicleMode
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