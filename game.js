import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class Laser {
    constructor(x, z, direction, color) {
        this.position = new THREE.Vector3(x, 0.5, z);
        const speed = 0.9375; // 1.5x CPU speed
        this.velocity = new THREE.Vector3(
            Math.cos(direction) * speed,
            0,
            Math.sin(direction) * speed
        );
        
        // Ensure minimum velocity
        if (Math.abs(this.velocity.x) < 0.1 && Math.abs(this.velocity.z) < 0.1) {
            // If velocity is too small, give it a default direction
            this.velocity.set(speed, 0, 0);
        }
        
        this.color = color;
        this.lifetime = 180; // 3 seconds at 60fps
        this.maxLifetime = 180; // Store initial lifetime for scaling
        this.radius = 1;
        this.mesh = null;
    }

    update() {
        // Only update if still alive
        if (this.lifetime <= 0) return false;
        
        // Ensure velocity is not zero
        if (Math.abs(this.velocity.x) < 0.1 && Math.abs(this.velocity.z) < 0.1) {
            return false; // Kill stationary lasers
        }
        
        this.position.add(this.velocity);
        this.lifetime--;
        
        // Update visual representation if it exists
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            // Scale the mesh based on remaining lifetime
            const scale = this.lifetime / this.maxLifetime;
            this.mesh.scale.set(scale, scale, scale);
        }
        
        // Check wall collisions
        const arenaSize = 40;
        
        // Check X boundaries
        if (Math.abs(this.position.x) > arenaSize) {
            this.position.x = Math.sign(this.position.x) * arenaSize;
            this.velocity.x *= -1;
        }
        
        // Check Z boundaries
        if (Math.abs(this.position.z) > arenaSize) {
            this.position.z = Math.sign(this.position.z) * arenaSize;
            this.velocity.z *= -1;
        }

        return this.lifetime > 0;
    }
}

class Kart {
    constructor(x, z, isCPU = false, initialDelay = 0) {
        this.position = new THREE.Vector3(x, 0, z);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.maxSpeed = 0.625;
        this.acceleration = 0.0125;
        this.deceleration = 0.00625;
        this.turnSpeed = 0.05;
        this.radius = 1;
        this.isCPU = isCPU;
        this.initialDelay = initialDelay;
        this.delayCounter = 0;
        this.lastLaserTime = 0;
            this.laserInterval = 108 + Math.floor(Math.random() * 24);
        this.chargeEffect = null;
        this.color = isCPU ? 0x00ff00 : 0x00ff00; // Default to green for both player and CPU
        // Set initial velocity for bouncing
        this.velocity = new THREE.Vector3(
            (Math.random() * 2 - 1) * this.maxSpeed,
            0,
            (Math.random() * 2 - 1) * this.maxSpeed
        );
    }

    createMesh() {
        if (this.isCPU) {
            // Create snowman group
            const snowmanGroup = new THREE.Group();
            
            // Create three dodecahedrons of decreasing size
            const sizes = [1.2, 0.9, 0.6]; // Bottom to top
            const heights = [0, 1.2, 2.1]; // Y positions for each sphere
            
            sizes.forEach((size, index) => {
                const dodecaGeometry = new THREE.DodecahedronGeometry(size, 0);
                const dodecaMaterial = new THREE.MeshStandardMaterial({
                    color: this.color,
                    roughness: 0.5,
                    metalness: 0.5
                });
                const dodeca = new THREE.Mesh(dodecaGeometry, dodecaMaterial);
                dodeca.position.y = heights[index];
                snowmanGroup.add(dodeca);
            });
            
            // Add eyes to the top dodecahedron
            const eyeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
            
            // Left eye
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(-0.2, 2.1, 0.4);
            snowmanGroup.add(leftEye);
            
            // Right eye
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(0.2, 2.1, 0.4);
            snowmanGroup.add(rightEye);
            
            // Add laser charge effect
            const chargeGeometry = new THREE.SphereGeometry(0.3, 8, 8);
            const chargeMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0
            });
            const chargeEffect = new THREE.Mesh(chargeGeometry, chargeMaterial);
            chargeEffect.position.y = 1.2;
            snowmanGroup.add(chargeEffect);
            this.chargeEffect = chargeEffect;
            
            snowmanGroup.position.copy(this.position);
            snowmanGroup.rotation.copy(this.rotation);
            return snowmanGroup;
        } else {
            // Create player kart mesh
            const kartGeometry = new THREE.BoxGeometry(1, 0.5, 2);
            const kartMaterial = new THREE.MeshStandardMaterial({ 
                color: this.color,
                roughness: 0.5,
                metalness: 0.5
            });
            
            const kartMesh = new THREE.Mesh(kartGeometry, kartMaterial);
            kartMesh.position.copy(this.position);
            kartMesh.rotation.copy(this.rotation);
            return kartMesh;
        }
    }

    update(controls, playerKart) {
        if (this.isCPU) {
            if (this.delayCounter < this.initialDelay) {
                this.delayCounter++;
                return false;
            }
            
            // Update position based on velocity
            this.position.x += this.velocity.x;
            this.position.z += this.velocity.z;
            
            // Keep within arena bounds and bounce off walls
            const arenaSize = 40;
            if (Math.abs(this.position.x) > arenaSize - 2) {
                this.position.x = Math.sign(this.position.x) * (arenaSize - 2);
                this.velocity.x *= -1;
            }
            if (Math.abs(this.position.z) > arenaSize - 2) {
                this.position.z = Math.sign(this.position.z) * (arenaSize - 2);
                this.velocity.z *= -1;
            }
            
            // Occasionally rotate slightly for visual interest
            if (Math.random() < 0.02) { // 2% chance per frame
                this.rotation.y += (Math.random() * 2 - 1) * this.turnSpeed * 0.5;
            }
            
            // Update laser firing
            this.lastLaserTime++;
            if (this.lastLaserTime >= this.laserInterval) {
                this.lastLaserTime = 0;
                return true; // Signal to create a laser
            }
            return false;
        } else {
            // Handle player kart movement
            
            // Calculate movement direction
            let moveDirection = 0;
            if (controls.ArrowUp) moveDirection = 1;
            if (controls.ArrowDown) moveDirection = -1;
            
            // Calculate turn direction
            let turnDirection = 0;
            if (controls.ArrowLeft) turnDirection = 1;
            if (controls.ArrowRight) turnDirection = -1;
            
            // Apply rotation
            this.rotation.y += turnDirection * this.turnSpeed;
            
            // Calculate velocity based on movement direction
            if (moveDirection !== 0) {
                this.velocity.x = Math.sin(this.rotation.y) * this.maxSpeed * moveDirection;
                this.velocity.z = Math.cos(this.rotation.y) * this.maxSpeed * moveDirection;
            } else {
                // Apply deceleration when no movement input
                this.velocity.x *= (1 - this.deceleration);
                this.velocity.z *= (1 - this.deceleration);
            }
            
            // Update position
            this.position.x += this.velocity.x;
            this.position.z += this.velocity.z;
            
            // Keep within arena bounds
        const arenaSize = 40;
            this.position.x = Math.max(-arenaSize + 2, Math.min(arenaSize - 2, this.position.x));
            this.position.z = Math.max(-arenaSize + 2, Math.min(arenaSize - 2, this.position.z));
            
            // Update survival time
            this.survivalTime = (this.survivalTime || 0) + 1/60; // Assuming 60fps
        }
    }
}

class Game {
    constructor() {
        // Three.js setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x4FC3F7);
        document.body.appendChild(this.renderer.domElement);
        
        // UI Elements
        this.countdownElement = document.getElementById('countdown');
        this.gameOverElement = document.getElementById('gameOver');
        this.achievementDisplay = document.getElementById('achievementDisplay');
        this.achievementNotification = document.getElementById('achievementNotification');
        this.codeInputOverlay = document.getElementById('codeInputOverlay');
        this.codeInput = document.getElementById('codeInput');
        
        // Create start screen
        this.startScreen = document.createElement('div');
        this.startScreen.style.position = 'fixed';
        this.startScreen.style.top = '50%';
        this.startScreen.style.left = '50%';
        this.startScreen.style.transform = 'translate(-50%, -50%)';
        this.startScreen.style.color = 'white';
        this.startScreen.style.fontSize = '24px';
        this.startScreen.style.textAlign = 'center';
        this.startScreen.style.cursor = 'pointer';
        this.startScreen.style.zIndex = '1000';
        this.startScreen.innerHTML = 'Click to Start Game<br><span style="font-size: 16px;">(Music will start playing)</span>';
        document.body.appendChild(this.startScreen);
        
        // Game state
        this.gameOver = false;
        this.gameStarted = false;
        this.countdown = 3;
        this.lastCountdownValue = 4;
        this.gamesPlayed = 0;
        this.achievementsUnlockedThisLife = 0;
        this.achievements = {
            floor: 1,
            wall: 1,
            lazer: 1
        };
        
        // Game objects
        this.lasers = [];
        this.cpuKarts = [];
        this.cpuKartMeshes = [];
        this.laserSounds = [];
        this.keys = {};
        this.viewMode = 'firstPerson';
        this.isReady = false;
        this.musicEnabled = true;
        this.soundEnabled = true;
        this.isEnteringCode = false;
        this.lastBPressed = false;
        this.audioInitialized = false;
        
        // Player and camera state
        this.kart = null;
        this.playerKartMesh = null;
        this.playerHitbox = null;
        this.gamepad = null;
        this.lastGamepadState = null;
        this.backgroundMusic = null;
        
        // Multiplayer setup
        this.socket = io();
        this.otherPlayers = new Map();
        this.isConnected = false;
        
        // Handle connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
        });
        
        this.socket.on('gameFull', () => {
            console.log('Game is full');
        });
        
        this.socket.on('currentPlayers', (players) => {
            Object.keys(players).forEach((id) => {
                if (id !== this.socket.id) {
                    this.addOtherPlayer(id, players[id]);
                }
            });
        });
        
        this.socket.on('playerJoined', (playerInfo) => {
            this.addOtherPlayer(playerInfo.id, playerInfo);
        });
        
        this.socket.on('playerMoved', (playerInfo) => {
            if (this.otherPlayers.has(playerInfo.id)) {
                const player = this.otherPlayers.get(playerInfo.id);
                player.position.copy(playerInfo.position);
                player.rotation.copy(playerInfo.rotation);
            }
        });
        
        this.socket.on('playerLeft', (playerId) => {
            if (this.otherPlayers.has(playerId)) {
                const player = this.otherPlayers.get(playerId);
                this.scene.remove(player);
                this.otherPlayers.delete(playerId);
            }
        });

        // Add click handler for start screen
        this.startScreen.addEventListener('click', () => {
            this.startScreen.style.display = 'none';
            this.initializeAudio();
            this.audioInitialized = true;
            this.resetGame();
        });
    }
    
    addOtherPlayer(id, playerInfo) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const player = new THREE.Mesh(geometry, material);
        
        player.position.copy(playerInfo.position);
        player.rotation.copy(playerInfo.rotation);
        
        this.scene.add(player);
        this.otherPlayers.set(id, player);
    }
    
    animate() {
        if (!this.isReady) return;
        
        requestAnimationFrame(() => this.animate());
        
        // Only proceed if karts are initialized
        if (!this.kart || !this.playerKartMesh || !this.playerHitbox) {
            console.error('Karts not properly initialized');
            return;
        }
        
        // Initialize controls object
        const controls = {
            ArrowUp: this.keys['ArrowUp'] || false,
            ArrowDown: this.keys['ArrowDown'] || false,
            ArrowLeft: this.keys['ArrowLeft'] || false,
            ArrowRight: this.keys['ArrowRight'] || false,
            ' ': this.keys[' '] || false
        };
        
        // Check for gamepad
        const gamepads = navigator.getGamepads();
        console.log('Gamepads:', gamepads);
        if (gamepads[0]) {
            console.log('Gamepad detected:', gamepads[0]);
            this.gamepad = gamepads[0];
            
            // Check if any gamepad button is pressed for game restart
            if (this.gameOver) {
                for (let i = 0; i < this.gamepad.buttons.length; i++) {
                    if (this.gamepad.buttons[i].pressed) {
                        this.resetGame();
                        return;
                    }
                }
            }
            
                // Left stick for movement
                const leftStickY = this.gamepad.axes[1];
            console.log('Left stick Y:', leftStickY);
                
                // Right stick for turning
                const rightStickX = this.gamepad.axes[2];
            console.log('Right stick X:', rightStickX);
                
                // Apply deadzone
                const deadzone = 0.1;
                
            // Movement - only update if stick has moved beyond deadzone
                if (Math.abs(leftStickY) > deadzone) {
                    controls.ArrowUp = leftStickY < -deadzone;
                    controls.ArrowDown = leftStickY > deadzone;
                console.log('Movement controls:', { ArrowUp: controls.ArrowUp, ArrowDown: controls.ArrowDown });
                }
                
            // Turning - only update if stick has moved beyond deadzone
                if (Math.abs(rightStickX) > deadzone) {
                    controls.ArrowLeft = rightStickX < -deadzone;
                    controls.ArrowRight = rightStickX > deadzone;
                console.log('Turning controls:', { ArrowLeft: controls.ArrowLeft, ArrowRight: controls.ArrowRight });
                }
                
                // Brake button (A button)
                controls[' '] = this.gamepad.buttons[0].pressed;
            console.log('Brake button:', controls[' ']);
            
            // View toggle (B button) - only trigger on button press, not hold
            const bButtonPressed = this.gamepad.buttons[1].pressed;
            console.log('B button:', bButtonPressed);
            if (bButtonPressed && !this.lastBPressed) {
                // Cycle through view modes
                switch (this.viewMode) {
                    case 'firstPerson':
                        this.viewMode = 'topView';
                        break;
                    case 'topView':
                        this.viewMode = 'isometric';
                        break;
                    case 'isometric':
                        this.viewMode = 'firstPerson';
                        break;
                }
            }
            this.lastBPressed = bButtonPressed;
            
            // Store current gamepad state
            this.lastGamepadState = {
                leftStickY: leftStickY,
                rightStickX: rightStickX,
                aButton: this.gamepad.buttons[0].pressed,
                bButton: bButtonPressed
            };
        } else {
            console.log('No gamepad detected');
            this.gamepad = null;
        }
        
        if (!this.gameStarted) {
            // Handle countdown
            if (this.countdown > 0) {
                const countdownValue = Math.ceil(this.countdown);
                if (countdownValue !== this.lastCountdownValue) {
                    this.countdownElement.innerHTML = 'The colorful snowmen are tryin\' to zap you.<br>Be the best LAZER AVOIDER!<br><br><span style="font-size: 36px;">(Press V to cycle views)</span><br><br><span style="font-size: 24px;">Press Z to enter achievement code</span><br><br>' + countdownValue.toString();
                    this.lastCountdownValue = countdownValue;
                }
                this.countdown -= 1/60; // Decrease countdown based on frame rate
            } else {
                this.countdownElement.textContent = 'START!';
                setTimeout(() => {
                    this.countdownElement.style.display = 'none';
                    this.gameStarted = true;
                }, 1000);
            }
        } else if (!this.gameOver) {
            // Check achievements
            this.checkAchievements();
            
            // Update karts
            this.kart.update(controls, this.kart);
            
            // Update CPU karts and handle laser firing
            this.cpuKarts.forEach((kart, index) => {
                // Update charge effect
                if (kart.chargeEffect) {
                    if (kart.lastLaserTime <= 30 && kart.lastLaserTime > 0) { // Show charge effect for last 0.5 seconds
                        kart.chargeEffect.material.opacity = (30 - kart.lastLaserTime) / 30; // Fade in
                        kart.chargeEffect.scale.setScalar(1 + (30 - kart.lastLaserTime) / 15); // Grow
                    } else {
                        kart.chargeEffect.material.opacity = 0;
                        kart.chargeEffect.scale.setScalar(1);
                    }
                }
                
                if (kart.update(controls, this.kart)) {
                    // Create new laser
                    const laser = new Laser(
                        kart.position.x,
                        kart.position.z,
                        kart.rotation.y,
                        kart.color
                    );
                    
                    // Create visual representation for laser
                    const laserGeometry = new THREE.SphereGeometry(laser.radius, 16, 16);
                    const laserMaterial = new THREE.MeshBasicMaterial({
                        color: 0xffff00, // Changed to yellow
                        transparent: true,
                        opacity: 0.5
                    });
                    laser.mesh = new THREE.Mesh(laserGeometry, laserMaterial);
                    laser.mesh.position.copy(laser.position);
                    this.scene.add(laser.mesh);
                    
                    // Play corresponding laser sound if sound effects are enabled
                    if (this.soundEnabled) {
                        this.laserSounds[index].currentTime = 0;
                        this.laserSounds[index].play();
                    }
                    
                    this.lasers.push(laser);
                }
            });
            
            // Update lasers
            for (let i = this.lasers.length - 1; i >= 0; i--) {
                const laser = this.lasers[i];
                
                // Update laser and check if it's still alive
                if (!laser.update()) {
                    // Remove dead laser
                    if (laser.mesh) {
                        this.scene.remove(laser.mesh);
                    }
                    this.lasers.splice(i, 1);
                    continue;
                }
                
                // Check for collision with player
                const dx = laser.position.x - this.kart.position.x;
                const dz = laser.position.z - this.kart.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < this.kart.radius + laser.radius) {
                    this.gameOver = true;
                    const minutes = Math.floor(this.kart.survivalTime / 60);
                    const seconds = Math.floor(this.kart.survivalTime % 60);
                    const milliseconds = Math.floor((this.kart.survivalTime % 1) * 100);
                    this.gameOverElement.innerHTML = `Game Over!<br>Survival Time: ${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}<br><br>Press any key to restart`;
                    this.gameOverElement.style.display = 'block';
                }
            }
        }
        
        // Update camera and meshes
        this.updateCamera();
        this.updateKartMeshes();
        this.updateVisuals();
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
        
        // Send position updates to server
        if (this.socket.connected) {
            this.socket.emit('playerMove', {
                position: this.camera.position,
                rotation: this.camera.rotation
            });
        }
        
        // Update other players' meshes
        this.otherPlayers.forEach((player) => {
            if (player && this.kart) {
                player.position.copy(this.kart.position);
                player.rotation.copy(this.kart.rotation);
            }
        });
    }

    async createEnvironment() {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 0);
        this.scene.add(directionalLight);
        
        // Create ground plane with default color first
        const groundGeometry = new THREE.PlaneGeometry(80, 80);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x808080, // Default gray color
            roughness: 0.8,
            metalness: 0.2
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        this.scene.add(ground);
        
        // Load texture after mesh is created and added to scene
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('floor0.jpg', 
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 1);
                ground.material.map = texture;
                ground.material.needsUpdate = true;
            },
            undefined,
            (error) => {
                console.error('Error loading floor texture:', error);
            }
        );
    }

    async createArena() {
        const arenaSize = 40;
        const wallHeight = 5;
        
        // Create wall material with default color
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080, // Default gray color
            roughness: 0.7,
            metalness: 0.3
        });

        // Create four walls for the square arena
        const walls = [
            // North wall
            { size: [arenaSize * 2, wallHeight, 1], position: [0, wallHeight/2, -arenaSize] },
            // South wall
            { size: [arenaSize * 2, wallHeight, 1], position: [0, wallHeight/2, arenaSize] },
            // East wall
            { size: [1, wallHeight, arenaSize * 2], position: [arenaSize, wallHeight/2, 0] },
            // West wall
            { size: [1, wallHeight, arenaSize * 2], position: [-arenaSize, wallHeight/2, 0] }
        ];

        const wallMeshes = [];
        walls.forEach(wall => {
            const geometry = new THREE.BoxGeometry(...wall.size);
            const mesh = new THREE.Mesh(geometry, wallMaterial);
            mesh.position.set(...wall.position);
            this.scene.add(mesh);
            wallMeshes.push(mesh);
        });
        
        // Load wall texture after meshes are created and added to scene
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('wall0.jpg',
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(4, 1);
                
                wallMeshes.forEach(mesh => {
                    mesh.material.map = texture;
                    mesh.material.needsUpdate = true;
                });
            },
            undefined,
            (error) => {
                console.error('Error loading wall texture:', error);
            }
        );
    }

    resetGame() {
        // Reset game state
        this.gameOver = false;
        this.gameStarted = false;
        this.countdown = 3;
        this.lastCountdownValue = 4;
        this.countdownElement.style.display = 'block';
        this.countdownElement.innerHTML = 'The colorful snowmen are tryin\' to zap you.<br>Be the best LAZER AVOIDER!<br><br><span style="font-size: 36px;">(Press V to cycle views)</span><br><br><span style="font-size: 24px;">Press Z to enter achievement code</span>';
        
        // Start a random song if this is the first game
        if (this.gamesPlayed === 0 && this.musicEnabled) {
            this.changeSong();
        }
        
        // Clean up existing lasers
        this.lasers.forEach(laser => {
            if (laser.mesh) {
                this.scene.remove(laser.mesh);
            }
        });
        this.lasers = [];
        
        // Reset sounds
        this.laserSounds.forEach(sound => {
            sound.pause();
            sound.currentTime = 0;
        });
        
        // Clean up existing CPU meshes
        this.cpuKartMeshes.forEach(mesh => {
            if (mesh) {
                this.scene.remove(mesh);
            }
        });
        
        // Create player kart at center, facing north (towards CPU karts)
        this.kart = new Kart(0, 0, false);
        this.kart.rotation.y = Math.PI; // Rotate 180 degrees to face north
        this.cpuKarts = [];
        this.cpuKartMeshes = [];
        
        // Create CPU karts
        const numCPUs = this.achievements.lazer === 9 ? 4 : 3;
        const cpuColors = [
            0x00ff00, // Green
            0xff00ff, // Purple
            0x0000ff, // Blue
            0xffffff  // White (for level 9)
        ];
        
        for (let i = 0; i < numCPUs; i++) {
            const angle = (i * Math.PI * 2) / numCPUs;
            const distance = 20;
            // Add initial delay for all CPU karts (50 frames = less than 1 second)
            const initialDelay = 50 + (i * 20); // Stagger the delays by 1/3 second each
            const cpuKart = new Kart(
                Math.cos(angle) * distance,
                Math.sin(angle) * distance,
                true,
                initialDelay
            );
            
            // Set the color based on lazer level
            if (this.achievements.lazer === 9) {
                cpuKart.color = cpuColors[3]; // White for level 9
            } else {
                cpuKart.color = cpuColors[i]; // Green, Purple, Blue for other levels
            }
            
            this.cpuKarts.push(cpuKart);
            
            // Create and add the mesh
            const cpuMesh = cpuKart.createMesh();
            this.cpuKartMeshes.push(cpuMesh);
            this.scene.add(cpuMesh);
        }
        
        this.gameOverElement.style.display = 'none';
        
        // Update games played counter
        this.gamesPlayed++;
        this.achievementsUnlockedThisLife = 0;
        this.updateAchievementDisplay();
    }

    changeSong() {
        if (this.musicEnabled && this.audioInitialized) {
            this.backgroundMusic.src = this.getRandomSong();
            const playPromise = this.backgroundMusic.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.log('Audio playback prevented:', error);
                });
            }
        }
    }

    updateAchievementDisplay() {
        // Calculate achievement code as a 3-digit number (floor/wall/lazer)
        const code = this.achievements.floor * 100 + this.achievements.wall * 10 + this.achievements.lazer;
        // Multiply by 7 for display
        const displayCode = code * 7;
        
        this.achievementDisplay.innerHTML = `
            Games played: ${this.gamesPlayed}<br>
            Achievement code: ${displayCode.toString().padStart(3, '0')}<br>
            Floor level: ${this.achievements.floor}<br>
            Wall level: ${this.achievements.wall}<br>
            Lazer level: ${this.achievements.lazer}
        `;
    }

    checkAchievements() {
        if (this.achievementsUnlockedThisLife >= 3) return;

        const survivalTime = this.kart.survivalTime;
        const achievements = [
            { time: 5, type: 'wall', level: 1, message: 'WALL COLOR 1 UNLOCKED!' },
            { time: 10, type: 'floor', level: 1, message: 'FLOOR COLOR 1 UNLOCKED!' },
            { games: 4, type: 'lazer', level: 1, message: 'LAZER COLOR 1 UNLOCKED!' },
            { time: 15, type: 'wall', level: 2, message: 'WALL COLOR 2 UNLOCKED!' },
            { time: 20, type: 'floor', level: 2, message: 'FLOOR COLOR 2 UNLOCKED!' },
            { games: 8, type: 'lazer', level: 2, message: 'LAZER COLOR 2 UNLOCKED!' },
            { time: 25, type: 'wall', level: 3, message: 'WALL COLOR 3 UNLOCKED!' },
            { time: 30, type: 'floor', level: 3, message: 'FLOOR COLOR 3 UNLOCKED!' },
            { games: 12, type: 'lazer', level: 3, message: 'LAZER COLOR 3 UNLOCKED!' },
            { time: 35, type: 'wall', level: 4, message: 'WALL COLOR 4 UNLOCKED!' },
            { time: 40, type: 'floor', level: 4, message: 'FLOOR COLOR 4 UNLOCKED!' },
            { games: 16, type: 'lazer', level: 4, message: 'LAZER COLOR 4 UNLOCKED!' },
            { time: 45, type: 'wall', level: 5, message: 'WALL COLOR 5 UNLOCKED!' },
            { time: 50, type: 'floor', level: 5, message: 'FLOOR COLOR 5 UNLOCKED!' },
            { games: 20, type: 'lazer', level: 5, message: 'LAZER COLOR 5 UNLOCKED!' },
            { time: 55, type: 'wall', level: 6, message: 'WALL COLOR 6 UNLOCKED!' },
            { time: 60, type: 'floor', level: 6, message: 'FLOOR COLOR 6 UNLOCKED!' },
            { games: 24, type: 'lazer', level: 6, message: 'LAZER COLOR 6 UNLOCKED!' },
            { time: 65, type: 'wall', level: 7, message: 'WALL COLOR 7 UNLOCKED!' },
            { time: 70, type: 'floor', level: 7, message: 'FLOOR COLOR 7 UNLOCKED!' },
            { games: 28, type: 'lazer', level: 7, message: 'LAZER COLOR 7 UNLOCKED!' },
            { time: 85, type: 'wall', level: 8, message: 'WALL COLOR 8 UNLOCKED!' },
            { time: 90, type: 'floor', level: 8, message: 'FLOOR COLOR 8 UNLOCKED!' },
            { games: 32, type: 'lazer', level: 8, message: 'LAZER COLOR 8 UNLOCKED!' },
            { time: 100, type: 'wall', level: 9, message: 'WALL COLOR 9 UNLOCKED!' },
            { time: 110, type: 'floor', level: 9, message: 'FLOOR COLOR 9 UNLOCKED!' },
            { games: 36, type: 'lazer', level: 9, message: 'LAZER COLOR 9 UNLOCKED!' }
        ];

        for (const achievement of achievements) {
            if (achievement.time && survivalTime >= achievement.time && 
                this.achievements[achievement.type] < achievement.level) {
                this.achievements[achievement.type] = achievement.level;
                this.achievementsUnlockedThisLife++;
                this.updateAchievementDisplay();
                this.updateVisuals();
                this.showAchievementNotification(achievement.message);
                break;
            } else if (achievement.games && this.gamesPlayed >= achievement.games && 
                      this.achievements[achievement.type] < achievement.level) {
                this.achievements[achievement.type] = achievement.level;
                this.achievementsUnlockedThisLife++;
                this.updateAchievementDisplay();
                this.updateVisuals();
                this.showAchievementNotification(achievement.message);
                break;
            }
        }
    }

    updateVisuals() {
        // Update floor texture
        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load(`floor${this.achievements.floor}.jpg`, 
            // Success callback
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 1);
                
                const ground = this.scene.children.find(child => 
                    child instanceof THREE.Mesh && 
                    child.geometry instanceof THREE.PlaneGeometry
                );
                if (ground) {
                    ground.material.map = texture;
                    ground.material.needsUpdate = true;
                }
            },
            // Progress callback
            undefined,
            // Error callback
            (error) => {
                console.error('Error loading floor texture:', error);
                // Keep existing texture if loading fails
            }
        );

        // Update wall texture
        const wallTexture = textureLoader.load(`wall${this.achievements.wall}.jpg`,
            // Success callback
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(4, 1);
                
                this.scene.children
                    .filter(child => 
                        child instanceof THREE.Mesh && 
                        child.geometry instanceof THREE.BoxGeometry
                    )
                    .forEach(wall => {
                        wall.material.map = texture;
                        wall.material.needsUpdate = true;
                    });
            },
            // Progress callback
            undefined,
            // Error callback
            (error) => {
                console.error('Error loading wall texture:', error);
                // Keep existing texture if loading fails
            }
        );

        // Update laser colors and CPU behavior
        const lazerLevel = this.achievements.lazer;
        const lazerColors = [
            0xffff00, // yellow
            0x00ff00, // green
            0x00ffff, // light blue
            0x0000ff, // dark blue
            0xff00ff, // light purple
            0xff69b4, // pink
            0xff0000, // red
            0xffa500, // light orange
            0xcd853f, // light brown
            0xffffff  // white
        ];

        // Update CPU karts
        if (this.cpuKarts) {
            this.cpuKarts.forEach((kart, index) => {
                if (kart && index < (lazerLevel === 9 ? 4 : 3)) {
                    // Only update speed and laser interval, not color
                    kart.maxSpeed = 0.625 * (lazerLevel >= 3 ? 1.15 : 1);
                    kart.laserInterval = (108 + Math.floor(Math.random() * 24)) * (lazerLevel >= 6 ? 0.85 : 1);
                }
            });
        }

        // Update existing lasers
        if (this.lasers) {
            this.lasers.forEach(laser => {
                if (laser && laser.mesh) {
                    laser.mesh.material.color.setHex(lazerColors[lazerLevel]);
                }
            });
        }
    }

    handleCodeInput(code) {
        // Divide by 7 first
        const achievementCode = Math.floor(parseInt(code) / 7);
        if (isNaN(achievementCode)) return;

        // Extract individual digits
        const floor = Math.floor(achievementCode / 100);
        const wall = Math.floor((achievementCode % 100) / 10);
        const lazer = achievementCode % 10;

        if (floor >= 0 && floor <= 9 && wall >= 0 && wall <= 9 && lazer >= 0 && lazer <= 9) {
            this.achievements.floor = floor;
            this.achievements.wall = wall;
            this.achievements.lazer = lazer;
            this.achievementCode = achievementCode;
            this.updateAchievementDisplay();
            this.updateVisuals();
        }
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (this.gameOver) {
                this.resetGame();
                return;
            }
            
            // Handle code input mode
            if (this.isEnteringCode) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const code = document.getElementById('codeInput').value;
                    this.handleCodeInput(code);
                    this.isEnteringCode = false;
                    this.codeInputOverlay.style.display = 'none';
                    document.getElementById('codeInput').value = '';
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.isEnteringCode = false;
                    this.codeInputOverlay.style.display = 'none';
                    document.getElementById('codeInput').value = '';
                }
                return;
            }
            
            // Handle normal game controls
            if (e.key === 'v') {
                e.preventDefault();
                // Cycle through view modes
                switch (this.viewMode) {
                    case 'firstPerson':
                        this.viewMode = 'topView';
                        break;
                    case 'topView':
                        this.viewMode = 'isometric';
                        break;
                    case 'isometric':
                        this.viewMode = 'firstPerson';
                        break;
                }
                return;
            }
            if (e.key === 'p') {
                e.preventDefault();
                this.changeSong();
                return;
            }
            if (e.key === 'z' && !this.gameStarted) {
                e.preventDefault();
                this.isEnteringCode = true;
                this.codeInputOverlay.style.display = 'block';
                document.getElementById('codeInput').focus();
                return;
            }
            
            // Handle movement keys
            if (e.key === 'ArrowUp') this.keys.ArrowUp = true;
            if (e.key === 'ArrowDown') this.keys.ArrowDown = true;
            if (e.key === 'ArrowLeft') this.keys.ArrowLeft = true;
            if (e.key === 'ArrowRight') this.keys.ArrowRight = true;
            if (e.key === ' ') this.keys[' '] = true;
        });

        window.addEventListener('keyup', (e) => {
            // Handle movement keys
            if (e.key === 'ArrowUp') this.keys.ArrowUp = false;
            if (e.key === 'ArrowDown') this.keys.ArrowDown = false;
            if (e.key === 'ArrowLeft') this.keys.ArrowLeft = false;
            if (e.key === 'ArrowRight') this.keys.ArrowRight = false;
            if (e.key === ' ') this.keys[' '] = false;
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initializeAudio() {
        // Create background music
        this.backgroundMusic = new Audio();
        this.backgroundMusic.loop = false; // We'll handle looping ourselves
        this.backgroundMusic.volume = 0.5;
        
        // Create laser sounds
        this.laserSounds = [
            new Audio('laser1.mp3'),
            new Audio('laser2.mp3'),
            new Audio('laser3.mp3')
        ];
        
        // Set volume
        this.laserSounds.forEach(sound => sound.volume = 0.3);
        
        // Music URLs array
        this.musicUrls = [
            'https://www.openmusicarchive.org/audio/Dont_Go_Way_Nobody.mp3',
            'https://www.openmusicarchive.org/audio/Pinetops_Blues.mp3',
            'https://www.openmusicarchive.org/audio/Pinetops_Boogie_Woogie.mp3',
            'https://www.openmusicarchive.org/audio/Little_Bits.mp3',
            'https://www.openmusicarchive.org/audio/Struggling.mp3',
            'https://www.openmusicarchive.org/audio/In_The_Dark_Flashes.mp3',
            'https://www.openmusicarchive.org/audio/Waiting_For_A_Train.mp3',
            'https://www.openmusicarchive.org/audio/Im_Gonna_Get_Me_A_Man_Thats_All.mp3',
            'https://www.openmusicarchive.org/audio/Rolls_Royce_Papa.mp3',
            'https://www.openmusicarchive.org/audio/Evil_Minded_Blues.mp3',
            'https://www.openmusicarchive.org/audio/Titanic_Blues.mp3',
            'https://www.openmusicarchive.org/audio/Night_Latch_Key_Blues.mp3',
            'https://www.openmusicarchive.org/audio/Whitehouse_Blues.mp3',
            'https://www.openmusicarchive.org/audio/Ragtime_Annie.mp3',
            'https://www.openmusicarchive.org/audio/At_The_Ball_Thats_All.mp3',
            'https://www.openmusicarchive.org/audio/O_Patria_Mia_From_Aida.mp3',
            'https://www.openmusicarchive.org/audio/Intro_And_Tarantelle.mp3',
            'https://www.openmusicarchive.org/audio/Oi_ya_nestchastay.mp3',
            'https://www.openmusicarchive.org/audio/Umbrellas_To_Mend.mp3',
            'https://www.openmusicarchive.org/audio/For_Months_And_Months_And_Months.mp3',
            'https://www.openmusicarchive.org/audio/Six_Cold_Feet_In_The_Ground.mp3',
            'https://www.openmusicarchive.org/audio/One_Dime_Blues.mp3',
            'https://www.openmusicarchive.org/audio/Henry%20Lee%20by%20Dick%20Justice.mp3',
            'https://www.openmusicarchive.org/audio/The%20House%20Carpenter%20by%20Clarence%20Ashley.mp3',
            'https://www.openmusicarchive.org/audio/Drunkards%20Special%20by%20Coley%20Jones.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Lady%20And%20The%20Devil%20by%20Bill%20And%20Belle%20Reed.mp3',
            'https://www.openmusicarchive.org/audio/The%20Butchers%20Boy%20by%20Buell%20Kazee.mp3',
            'https://www.openmusicarchive.org/audio/The%20Wagoners%20Lad%20by%20Buell%20Kazee.mp3',
            'https://www.openmusicarchive.org/audio/King%20Kong%20Kitchie%20Kitchie%20Kimio%20by%20Chubby%20Parker%20And%20His%20Old%20Time%20Banjo.mp3',
            'https://www.openmusicarchive.org/audio/Willie%20Moore%20by%20Burnett%20And%20Rutherford.mp3',
            'https://www.openmusicarchive.org/audio/A%20Lazy%20Farmer%20Boy%20by%20Buster%20Carter%20And%20Preston%20Young.mp3',
            'https://www.openmusicarchive.org/audio/Peg%20And%20Awl%20by%20The%20Carolina%20Tar%20Heels.mp3',
            'https://www.openmusicarchive.org/audio/Ommie%20Wise%20by%20G%20B%20Grayson.mp3',
            'https://www.openmusicarchive.org/audio/My%20Name%20Is%20John%20Johanna%20by%20Kelly%20Harrell%20And%20The%20Virginia%20String%20Band.mp3',
            'https://www.openmusicarchive.org/audio/Charles%20Giteau%20by%20Kelly%20Harrell.mp3',
            'https://www.openmusicarchive.org/audio/White%20House%20Blues%20by%20Charlie%20Poole%20With%20The%20North%20Carolina%20Ramblers.mp3',
            'https://www.openmusicarchive.org/audio/Frankie%20by%20Mississippi%20John%20Hurt.mp3',
            'https://www.openmusicarchive.org/audio/Mississippi%20Boweavil%20Blues%20by%20The%20Masked%20Marvel.mp3',
            'https://www.openmusicarchive.org/audio/Sail%20Away%20Lady%20by%20Uncle%20Bunt%20Stephens.mp3',
            'https://www.openmusicarchive.org/audio/The%20Wild%20Wagoner%20by%20Jilson%20Setters.mp3',
            'https://www.openmusicarchive.org/audio/Wake%20Up%20Jacob%20by%20Prince%20Albert%20Hunts%20Texas%20Ramblers.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Dog%20Blue%20by%20Jim%20Jackson.mp3',
            'https://www.openmusicarchive.org/audio/Since%20I%20Laid%20My%20Burden%20Down%20by%20The%20Elders%20Mcintorsh%20And%20Edwards%27%20Sanctified%20Singers.mp3',
            'https://www.openmusicarchive.org/audio/Dry%20Bones%20by%20Bascom%20Lamar%20Lunsford.mp3',
            'https://www.openmusicarchive.org/audio/John%20The%20Revelator%20by%20Blind%20Willie%20Johnson.mp3',
            'https://www.openmusicarchive.org/audio/Fifty%20Miles%20Of%20Elbow%20Room%20by%20Reverend%20F%20M%20Mcgee.mp3',
            'https://www.openmusicarchive.org/audio/The%20Coo%20Coo%20Bird%20by%20Clarence%20Ashley.mp3',
            'https://www.openmusicarchive.org/audio/East%20Virginia%20by%20Buell%20Kazee.mp3',
            'https://www.openmusicarchive.org/audio/James%20Alley%20Blues%20by%20Richard%20Rabbit%20Brown.mp3',
            'https://www.openmusicarchive.org/audio/Sugar%20Baby%20by%20Dock%20Boggs.mp3',
            'https://www.openmusicarchive.org/audio/I%20Wish%20I%20Was%20A%20Mole%20In%20The%20Ground%20by%20Bascom%20Lamar%20Lunsford.mp3',
            'https://www.openmusicarchive.org/audio/The%20Mountaineers%20Courtship%20by%20Mr%20And%20Mrs%20Ernest%20V%20Stoneman.mp3',
            'https://www.openmusicarchive.org/audio/Le%20Vieux%20Soulard%20Et%20Sa%20Femme%20by%20Cleoma%20Breaux%20And%20Joseph%20Falcon.mp3',
            'https://www.openmusicarchive.org/audio/Rabbit%20Foot%20Blues%20by%20Blind%20Lemon%20Jefferson.mp3',
            'https://www.openmusicarchive.org/audio/See%20That%20My%20Grave%20Is%20Kept%20Clean%20by%20Blind%20Lemon%20Jefferson.mp3',
            'https://www.openmusicarchive.org/audio/The%20Lone%20Star%20Trail%20by%20Ken%20Maynard.mp3',
            'https://www.openmusicarchive.org/audio/Loving%20Henry%20by%20Joan%20Obryant.mp3',
            'https://www.openmusicarchive.org/audio/House%20Carpenter%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20House%20Carpenter%20by%20Mrs%20Texas%20Gladden.mp3',
            'https://www.openmusicarchive.org/audio/House%20Carpenter%20by%20William%20Edens.mp3',
            'https://www.openmusicarchive.org/audio/House%20Carpenter%20by%20Mrs%20Doug%20Ina%20Harvey.mp3',
            'https://www.openmusicarchive.org/audio/House%20Carpenter%20by%20Allie%20Long%20Parker.mp3',
            'https://www.openmusicarchive.org/audio/The%20House%20Carpenter%20by%20Lucy%20Quigley.mp3',
            'https://www.openmusicarchive.org/audio/The%20House%20Carpenter%20by%20Roxie%20Phillips.mp3',
            'https://www.openmusicarchive.org/audio/Drunken%20Fool%20by%20Doris%20Venie.mp3',
            'https://www.openmusicarchive.org/audio/Our%20Goodman%20by%20Thomas%20Moran.mp3',
            'https://www.openmusicarchive.org/audio/Farmers%20Curst%20Wife%20by%20Mrs%20May%20Kennedy%20Mccord.mp3',
            'https://www.openmusicarchive.org/audio/Devils%20Curst%20Wife%20by%20Johnny%20Morris.mp3',
            'https://www.openmusicarchive.org/audio/Devil%20Doings%20by%20Mrs%20George%20Ripley.mp3',
            'https://www.openmusicarchive.org/audio/The%20Devil%20by%20Jimmy%20White.mp3',
            'https://www.openmusicarchive.org/audio/The%20Butcher%20Boy%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20Wagoners%20Lad%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Pretty%20Saro%20by%20Guy%20Carawan.mp3',
            'https://www.openmusicarchive.org/audio/The%20Rose%20Of%20Naideen%20by%20Mrs%20Laura%20Mcdonald.mp3',
            'https://www.openmusicarchive.org/audio/My%20Horses%20Aint%20Hungry%20by%20Mrs%20Haden%20Robinson.mp3',
            'https://www.openmusicarchive.org/audio/My%20Horses%20Aint%20Hungry%20by%20Mrs%20Kenneth%20Wright%20And%20Mrs%20Gladys%20Jennings.mp3',
            'https://www.openmusicarchive.org/audio/The%20Wagoners%20Lad%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Frog%20Went%20A%20Courtin%20by%20Odis%20Bird.mp3',
            'https://www.openmusicarchive.org/audio/Froggie%20Went%20A%20Courting%20by%20J.%20W.%20Breazeal.mp3',
            'https://www.openmusicarchive.org/audio/Uncle%20Rat%20Went%20Out%20To%20Ride%20The%20Frog%20And%20The%20Mouse%20by%20Elizabeth%20Cronin.mp3',
            'https://www.openmusicarchive.org/audio/With%20His%20Long%20Cane%20Pipe%20A%20Smokin%20by%20Mr%20Clyde%20Johnson.mp3',
            'https://www.openmusicarchive.org/audio/With%20His%20Old%20Gray%20Beard%20A%20Shining%20by%20Mrs%20Laura%20Mcdonald%20And%20Reba%20Glaze.mp3',
            'https://www.openmusicarchive.org/audio/With%20His%20Ole%20Gray%20Beard%20A%20Shining%20by%20Mrs%20Pearl%20Brewer.mp3',
            'https://www.openmusicarchive.org/audio/Sweet%20William%20And%20Lady%20Margaret%20by%20Jean%20Ritchie.mp3',
            'https://www.openmusicarchive.org/audio/Willie%20Moore%20by%20Fred%20Starr.mp3',
            'https://www.openmusicarchive.org/audio/The%20Young%20Man%20Who%20Wouldnt%20Raise%20Corn%20by%20Jean%20Ritchie%20And%20Family.mp3',
            'https://www.openmusicarchive.org/audio/The%20Young%20Man%20Who%20Wouldnt%20Hoe%20Corn%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Peg%20And%20Awl%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Omie%20Wise%20by%20Obray%20Ramsey.mp3',
            'https://www.openmusicarchive.org/audio/Naomi%20Wise%20by%20Paul%20Clayton.mp3',
            'https://www.openmusicarchive.org/audio/Little%20Omie%20by%20Harrison%20Burnett.mp3',
            'https://www.openmusicarchive.org/audio/Arkansas%20by%20Henry%20Thomas.mp3',
            'https://www.openmusicarchive.org/audio/Cole%20Younger%20by%20Mr%20William%20Edens.mp3',
            'https://www.openmusicarchive.org/audio/Cole%20Younger%20by%20Warde%20Ford.mp3',
            'https://www.openmusicarchive.org/audio/Charles%20Guiteau%20by%20Mr%20Lo%20Smith.mp3',
            'https://www.openmusicarchive.org/audio/John%20Hardy%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/John%20Hardy%20by%20Paul%20Clayton.mp3',
            'https://www.openmusicarchive.org/audio/John%20Henry%20by%20Odis%20Bird.mp3',
            'https://www.openmusicarchive.org/audio/John%20Henry%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/John%20Henry%20by%20Paul%20Clayton.mp3',
            'https://www.openmusicarchive.org/audio/John%20Henry%20by%20Wise%20Jones.mp3',
            'https://www.openmusicarchive.org/audio/Stagolee%20by%20Cisco%20Houston.mp3',
            'https://www.openmusicarchive.org/audio/The%20Unlucky%20Road%20To%20Washington%20by%20Ernest%20Stoneman%20And%20His%20Dixie%20Mountaineers.mp3',
            'https://www.openmusicarchive.org/audio/White%20House%20Blues%20by%20The%20New%20Lost%20City%20Ramblers.mp3',
            'https://www.openmusicarchive.org/audio/Frankie%20by%20Paul%20Clayton.mp3',
            'https://www.openmusicarchive.org/audio/Frankie%20by%20Mrs%20Oakley%20Fox.mp3',
            'https://www.openmusicarchive.org/audio/Frankie%20And%20Johnny%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20Titanic%20Disaster%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Ship%20Titanic%20Songs%20Of%20Camp%20by%20Ed%20Badeaux.mp3',
            'https://www.openmusicarchive.org/audio/The%20Brave%20Engineer%20by%20Roy%20Harvey.mp3',
            'https://www.openmusicarchive.org/audio/Casey%20Jones%20The%20Union%20Scab%20by%20Harry%20Mcclintock.mp3',
            'https://www.openmusicarchive.org/audio/Casey%20Jones%20by%20Mrs%20Laura%20Mcdonald%20And%20Reba%20Glaze.mp3',
            'https://www.openmusicarchive.org/audio/Casey%20Jones%20by%20Mr%20T%20R%20Hammond.mp3',
            'https://www.openmusicarchive.org/audio/Hard%20Times%20In%20The%20Mill%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20Boll%20Weevil%20by%20Ramblin%20Jack%20Elliot.mp3',
            'https://www.openmusicarchive.org/audio/The%20Boll%20Weevil%20by%20Hermes%20Nye.mp3',
            'https://www.openmusicarchive.org/audio/The%20Boll%20Weevil%20by%20Amy%20Pridemore.mp3',
            'https://www.openmusicarchive.org/audio/Sail%20Away%20Ladies%20by%20The%20Wagoners.mp3',
            'https://www.openmusicarchive.org/audio/Sail%20Away%20Ladies%20by%20Guy%20Carawan.mp3',
            'https://www.openmusicarchive.org/audio/Tennessee%20Wagoner%20by%20Ray%20Sosbee.mp3',
            'https://www.openmusicarchive.org/audio/Wagoner%20by%20John%20Morgan%20Salyer.mp3',
            'https://www.openmusicarchive.org/audio/Wagoner%20One%20Step%20Version%201%20by%20Isham%20Monday.mp3',
            'https://www.openmusicarchive.org/audio/Wagoner%20One%20Step%20Version%202%20by%20Isham%20Monday.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Blue%20by%20Joan%20Obryant.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Blue%20by%20Cisco%20Houston.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Blue%20by%20Guy%20Carawan.mp3',
            'https://www.openmusicarchive.org/audio/Home%20Sweet%20Home%20by%20Nellie%20Melba.mp3',
            'https://www.openmusicarchive.org/audio/Cowboys%20Home%20Sweet%20Home%20by%20Mrs%20Iva%20Haslett.mp3',
            'https://www.openmusicarchive.org/audio/Cowboys%20Home%20Sweet%20Home%20by%20Nancy%20Philley.mp3',
            'https://www.openmusicarchive.org/audio/At%20The%20Cross%20by%20Fiddlin%20John%20Carson.mp3',
            'https://www.openmusicarchive.org/audio/Glory%20Glory%20by%20Odetta.mp3',
            'https://www.openmusicarchive.org/audio/When%20I%20Lay%20My%20Burdens%20Down%20by%20Blind%20Roosevelt%20Graves.mp3',
            'https://www.openmusicarchive.org/audio/John%20Said%20He%20Saw%20A%20Number%20by%20Arizona%20Dranes.mp3',
            'https://www.openmusicarchive.org/audio/John%20The%20Revelator%20by%20The%20Golden%20Gate%20Quartet.mp3',
            'https://www.openmusicarchive.org/audio/Little%20Moses%20by%20Mrs%20Iva%20Haslett.mp3',
            'https://www.openmusicarchive.org/audio/Shine%20On%20Me%20by%20The%20Wiseman%20Sextette.mp3',
            'https://www.openmusicarchive.org/audio/Let%20Your%20Light%20Shine%20On%20Me%20by%20Blind%20Willie%20Johnson.mp3',
            'https://www.openmusicarchive.org/audio/The%20Coo%20Coo%20by%20Mr%20And%20Mrs%20John%20Sams.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20Shes%20A%20Fine%20Bird%20by%20Kelly%20Harrell.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20by%20Lillie%20Steele.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20Shes%20A%20Pretty%20Bird%20by%20Jean%20Ritchie.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20by%20Jean%20Ritchie.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20by%20Bill%20Westaway.mp3',
            'https://www.openmusicarchive.org/audio/False%20Hearted%20Lover%20by%20Olivia%20Hauser.mp3',
            'https://www.openmusicarchive.org/audio/East%20Virginia%20by%20Pete%20Steele.mp3',
            'https://www.openmusicarchive.org/audio/East%20Virginia%20by%20Cisco%20Houston.mp3',
            'https://www.openmusicarchive.org/audio/Mole%20In%20The%20Ground%20by%20Logan%20English.mp3',
            'https://www.openmusicarchive.org/audio/Mole%20In%20The%20Ground%20by%20Bascom%20Lamar%20Lunsford.mp3',
            'https://www.openmusicarchive.org/audio/Go%20Tell%20Aunt%20Rhody%20by%20Woody%20Guthrie.mp3',
            'https://www.openmusicarchive.org/audio/Go%20Tell%20Aunt%20Nancy%20by%20Mrs%20Shirley%20Lomax%20Mansell.mp3',
            'https://www.openmusicarchive.org/audio/The%20Old%20Grey%20Goose%20by%20The%20Carolina%20Tar%20Heels.mp3',
            'https://www.openmusicarchive.org/audio/What%20Shall%20I%20Wear%20To%20The%20Wedding%20John%20by%20Aunt%20Fanny%20Rumble%20Albert%20Collins.mp3',
            'https://www.openmusicarchive.org/audio/All%20Of%20Her%20Answers%20Were%20No%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/No%20Sir%20No%20Sir%20by%20Sam%20Larner.mp3',
            'https://www.openmusicarchive.org/audio/No%20Sir%20No%20Sir%20by%20Mary%20Jo%20Davis.mp3',
            'https://www.openmusicarchive.org/audio/No%20Sir%20Oh%20No%20John%20by%20Emily%20Bishop.mp3',
            'https://www.openmusicarchive.org/audio/When%20I%20Was%20Single%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20Drunken%20Man%20by%20D%20J%20Dom%20Ingenthron.mp3',
            'https://www.openmusicarchive.org/audio/Single%20Girl%20by%20Julius%20Sutton.mp3',
            'https://www.openmusicarchive.org/audio/I%20Wish%20I%20Was%20A%20Single%20Girl%20Again%20by%20Kelly%20Harrell.mp3',
            'https://www.openmusicarchive.org/audio/Good%20Ole%20Husband%20by%20Violet%20Smith.mp3',
            'https://www.openmusicarchive.org/audio/My%20Dear%20Old%20Husband%20by%20Odis%20Bird.mp3',
            'https://www.openmusicarchive.org/audio/My%20Good%20Ole%20Man%20by%20Laura%20Mcdonald%20And%20Reba%20Glaze.mp3',
            'https://www.openmusicarchive.org/audio/My%20Kind%20Old%20Husband%20by%20Mrs%20Pearl%20Brewer.mp3',
            'https://www.openmusicarchive.org/audio/My%20Kind%20Old%20Husband%20by%20Charley%20W%20Igenthron.mp3',
            'https://www.openmusicarchive.org/audio/Poor%20Boy%20A%20Long%20Ways%20From%20Home%20by%20Barbecue%20Bob.mp3',
            'https://www.openmusicarchive.org/audio/Dig%20My%20Grave%20With%20A%20Silver%20Spade%20by%20Tom%20Dutson.mp3',
            'https://www.openmusicarchive.org/audio/See%20That%20My%20Grave%20Is%20Kept%20Clean%20by%20Bob%20Dylan.mp3',
            'https://www.openmusicarchive.org/audio/Two%20White%20Horses%20Standin%20In%20Line%20by%20Smith%20Cason.mp3',
            'https://www.openmusicarchive.org/audio/Roll%20Down%20The%20Line%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Goin%20Down%20The%20Road%20Feelin%20Bad%20by%20Cliff%20Carlisle.mp3',
            'https://www.openmusicarchive.org/audio/Im%20Going%20Down%20The%20Road%20by%20J%20Kearns%20Planche.mp3',
            'https://www.openmusicarchive.org/audio/Im%20Going%20Down%20This%20Road%20Feelin%20Bad%20by%20Warde%20Ford.mp3',
            'https://www.openmusicarchive.org/audio/Going%20Down%20The%20Road%20Feeling%20Bad%20by%20Ruth%20Huber%20And%20Lois%20Judd.mp3',
            'https://www.openmusicarchive.org/audio/Im%20Goin%20Down%20The%20Road%20Feelin%20Bad%20by%20Gussie%20Ward%20Stone.mp3',
            'https://www.openmusicarchive.org/audio/K%20C%20Railroad%20Blues%20by%20Andrew%20And%20Jim%20Baxter.mp3'
        ];

        // Set up event listener for when a song ends
        this.backgroundMusic.addEventListener('ended', () => {
            this.changeSong();
        });

        // Start playing music
        this.changeSong();
    }

    getRandomSong() {
        // Generate a random number between 0 and 175
        const randomIndex = Math.floor(Math.random() * 176);
        return this.musicUrls[randomIndex];
    }

    showAchievementNotification(message) {
        this.achievementNotification.textContent = message;
        this.achievementNotification.style.display = 'block';
        this.achievementNotification.style.opacity = '1';
        
        // Hide the notification after 3 seconds
        setTimeout(() => {
            this.achievementNotification.style.opacity = '0';
            setTimeout(() => {
                this.achievementNotification.style.display = 'none';
            }, 500);
        }, 3000);
    }

    updateCamera() {
        if (!this.kart || !this.playerKartMesh) return;

        switch (this.viewMode) {
            case 'firstPerson':
                // First person view - camera follows kart from behind
                const cameraOffset = new THREE.Vector3(0, 2, 4);
                cameraOffset.applyEuler(this.kart.rotation);
                this.camera.position.copy(this.kart.position).add(cameraOffset);
                this.camera.lookAt(this.kart.position);
                break;
                
            case 'topView':
                // Top-down view
                this.camera.position.set(0, 30, 0);
                this.camera.lookAt(this.kart.position);
                break;
                
            case 'isometric':
                // Isometric view
                this.camera.position.set(20, 20, 20);
                this.camera.lookAt(this.kart.position);
                break;
        }
    }

    updateKartMeshes() {
        // Update player kart mesh
        if (this.playerKartMesh && this.kart) {
            this.playerKartMesh.position.copy(this.kart.position);
            this.playerKartMesh.rotation.copy(this.kart.rotation);
            
            // Update hitbox position
            if (this.playerHitbox) {
                this.playerHitbox.position.copy(this.kart.position);
                this.playerHitbox.rotation.copy(this.kart.rotation);
            }
        }
        
        // Update CPU kart meshes
        this.cpuKarts.forEach((kart, index) => {
            if (this.cpuKartMeshes[index]) {
                this.cpuKartMeshes[index].position.copy(kart.position);
                this.cpuKartMeshes[index].rotation.copy(kart.rotation);
            }
        });
    }
}

// Initialize the game when the page loads
window.addEventListener('load', async () => {
    const game = new Game();
    await game.createEnvironment();
    await game.createArena();
    game.setupEventListeners();
    game.isReady = true; // Mark game as ready after environment is created
    
    // Create player kart and initialize game state
    game.kart = new Kart(0, 0, false);
    game.kart.rotation.y = Math.PI; // Rotate 180 degrees to face north
    game.playerKartMesh = game.kart.createMesh();
    game.scene.add(game.playerKartMesh);
    
    // Create player hitbox
    const hitboxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const hitboxMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        wireframe: true,
        transparent: true,
        opacity: 0.5
    });
    game.playerHitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
    game.scene.add(game.playerHitbox);
    
    // Start animation loop
    game.animate();
}); 