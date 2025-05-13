import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { io } from 'https://cdn.socket.io/4.7.4/socket.io.esm.min.js';

class Laser {
    constructor(x, z, direction, color) {
        this.position = new THREE.Vector3(x, 0.5, z);
        const speed = 0.625; // Reduced from 0.9375 to match CPU speed
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
        
        this.color = 0xff00ff; // Always pink
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
            const scale = 2 + (this.lifetime / this.maxLifetime); // Start at 3x size, shrink to 2x
            this.mesh.scale.set(scale, scale, scale);
        }
        
        // Check wall collisions
        const arenaSize = 40;
        
        // Check X boundaries
        if (Math.abs(this.position.x) > arenaSize) {
            this.position.x = Math.sign(this.position.x) * arenaSize;
            // Add random angle to bounce
            const randomAngle = (Math.random() * Math.PI) - (Math.PI / 2);
            const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            this.velocity.x = Math.cos(randomAngle) * speed;
            this.velocity.z = Math.sin(randomAngle) * speed;
        }
        
        // Check Z boundaries
        if (Math.abs(this.position.z) > arenaSize) {
            this.position.z = Math.sign(this.position.z) * arenaSize;
            // Add random angle to bounce
            const randomAngle = (Math.random() * Math.PI) - (Math.PI / 2);
            const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            this.velocity.x = Math.cos(randomAngle) * speed;
            this.velocity.z = Math.sin(randomAngle) * speed;
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
        
        // Define a set of distinct colors
        const colors = [
            0xff0000, // Red
            0x00ff00, // Green
            0x0000ff, // Blue
            0xffff00, // Yellow
            0xff00ff, // Magenta
            0x00ffff, // Cyan
            0xff8000, // Orange
            0x8000ff, // Purple
            0xd2b48c, // Light Brown
            0xffffff  // White
        ];
        
        // Randomly select a color
        this.color = colors[Math.floor(Math.random() * colors.length)];
        
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
            // Create player kart group
            const kartGroup = new THREE.Group();
            
            // Create main body (box)
            const bodyGeometry = new THREE.BoxGeometry(1, 0.5, 2);
            const bodyMaterial = new THREE.MeshStandardMaterial({ 
                color: this.color,
                roughness: 0.5,
                metalness: 0.5
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            kartGroup.add(body);
            
            // Create cone for direction
            const coneGeometry = new THREE.ConeGeometry(0.3, 0.8, 8);
            const coneMaterial = new THREE.MeshStandardMaterial({
                color: 0xff0000, // Red cone
                roughness: 0.5,
                metalness: 0.5
            });
            const cone = new THREE.Mesh(coneGeometry, coneMaterial);
            cone.position.set(0, 0.4, -1); // Keep on same side
            cone.rotation.x = Math.PI / 2; // Flip direction
            kartGroup.add(cone);
            
            // Create face
            // Eyes
            const eyeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
            
            // Left eye
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(-0.2, 0.3, 0.5);
            kartGroup.add(leftEye);
            
            // Right eye
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(0.2, 0.3, 0.5);
            kartGroup.add(rightEye);
            
            // Smile (using a curved line)
            const smileGeometry = new THREE.TorusGeometry(0.3, 0.05, 8, 16, Math.PI);
            const smileMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const smile = new THREE.Mesh(smileGeometry, smileMaterial);
            smile.position.set(0, 0.2, 0.5);
            smile.rotation.x = Math.PI / 2;
            kartGroup.add(smile);
            
            kartGroup.position.copy(this.position);
            kartGroup.rotation.copy(this.rotation);
            return kartGroup;
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
                // Forward is in the direction we're facing
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
        
        // Initialize keys object
        this.keys = {
            ArrowUp: false,
            ArrowDown: false,
            ArrowLeft: false,
            ArrowRight: false,
            ' ': false
        };
        
        // Music URLs array
        this.musicUrls = Array.from({length: 176}, (_, i) => `music${i}.mp3`);
        
        // Multiplayer setup
        try {
            this.socket = io();
            this.otherPlayers = new Map();
            this.otherPlayerMeshes = new Map();
            
            // Set up socket event handlers
            this.socket.on('currentPlayers', (players) => {
                Object.entries(players).forEach(([id, player]) => {
                    if (id !== this.socket.id) {
                        this.addOtherPlayer(id, player);
                    }
                });
            });

            this.socket.on('playerJoined', (player) => {
                this.addOtherPlayer(player.id, player);
            });

            this.socket.on('playerLeft', (playerId) => {
                this.removeOtherPlayer(playerId);
            });

            this.socket.on('playerMoved', (player) => {
                this.updateOtherPlayer(player.id, player);
            });

            this.socket.on('gameReset', () => {
                this.resetGame();
            });

            this.socket.on('playerDied', (playerId) => {
                if (playerId === this.socket.id) {
                    this.resetGame();
                }
            });
        } catch (error) {
            console.log('Multiplayer disabled:', error);
            this.socket = null;
        }
        
        // UI Elements
        this.countdownElement = document.getElementById('countdown');
        this.gameOverElement = document.getElementById('gameOver');
        
        // Create start screen immediately
        this.startScreen = document.createElement('div');
        this.startScreen.style.position = 'fixed';
        this.startScreen.style.top = '0';
        this.startScreen.style.left = '0';
        this.startScreen.style.width = '100%';
        this.startScreen.style.height = '100%';
        this.startScreen.style.backgroundImage = 'url(title2.jpg)';
        this.startScreen.style.backgroundSize = 'cover';
        this.startScreen.style.backgroundPosition = 'center';
        this.startScreen.style.cursor = 'pointer';
        this.startScreen.style.zIndex = '1000';
        document.body.appendChild(this.startScreen);
        
        // Create click text overlay
        const clickText = document.createElement('div');
        clickText.style.position = 'absolute';
        clickText.style.bottom = '20%';
        clickText.style.left = '50%';
        clickText.style.transform = 'translateX(-50%)';
        clickText.style.color = 'white';
        clickText.style.fontSize = '24px';
        clickText.style.textAlign = 'center';
        clickText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        clickText.style.padding = '20px';
        clickText.style.borderRadius = '10px';
        clickText.innerHTML = 'Click to Start Game<br><span style="font-size: 16px;">(Music will start playing)</span>';
        this.startScreen.appendChild(clickText);
        
        // Game state
        this.gameOver = false;
        this.gameStarted = false;
        this.countdown = 3;
        this.lastCountdownValue = 4;
        this.gamesPlayed = 0;
        
        // Game objects
        this.lasers = [];
        this.cpuKarts = [];
        this.cpuKartMeshes = [];
        this.laserSounds = [];
        this.viewMode = 'firstPerson';
        this.isReady = false;
        this.musicEnabled = true;
        this.soundEnabled = true;
        this.audioInitialized = false;
        
        // Player and camera state
        this.kart = null;
        this.playerKartMesh = null;
        this.gamepad = null;
        this.lastGamepadState = null;
        this.backgroundMusic = null;
        
        // Current round textures
        this.currentFloorTexture = 0;
        this.currentWallTexture = 0;
        
        // Add click handler for start screen
        this.startScreen.addEventListener('click', () => {
            this.startScreen.style.display = 'none';
            this.initializeAudio();
            this.audioInitialized = true;
            this.gameStarted = true;
            this.resetGame();
            this.startCountdown();
        });

        // Add gamePaused state
        this.gamePaused = false;
    }

    resetGame() {
        // Reset game state
        this.gameOver = false;
        this.countdown = 3;
        this.lastCountdownValue = 4;
        
        // Reset survival time
        if (this.kart) {
            this.kart.survivalTime = 0;
        }
        if (this.survivalTimeDisplay) {
            this.survivalTimeDisplay.textContent = 'Survival Time: 0.0s';
        }
        
        // Generate random textures for this round
        this.currentFloorTexture = Math.floor(Math.random() * 10);
        this.currentWallTexture = Math.floor(Math.random() * 10);
        
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
        const numCPUs = 3;
        const cpuColors = [
            0x00ff00, // Green
            0xff00ff, // Purple
            0x0000ff  // Blue
        ];
        
        for (let i = 0; i < numCPUs; i++) {
            const angle = (i * Math.PI * 2) / numCPUs;
            const distance = 20;
            const initialDelay = 50 + (i * 20);
            const cpuKart = new Kart(
                Math.cos(angle) * distance,
                Math.sin(angle) * distance,
                true,
                initialDelay
            );
            
            cpuKart.color = cpuColors[i];
            this.cpuKarts.push(cpuKart);
            const cpuMesh = cpuKart.createMesh();
            this.cpuKartMeshes.push(cpuMesh);
            this.scene.add(cpuMesh);
        }
        
        this.gameOverElement.style.display = 'none';
        this.gamesPlayed++;
        
        // Update textures for this round
        this.updateVisuals();

        // Notify other players about game reset
        if (this.socket) {
            this.socket.emit('gameReset');
        }
    }

    updateVisuals() {
        // Update floor texture
        const textureLoader = new THREE.TextureLoader();
        const groundTexture = textureLoader.load(`floor${this.currentFloorTexture}.jpg`, 
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
            }
        );

        // Update wall texture
        const wallTexture = textureLoader.load(`wall${this.currentWallTexture}.jpg`,
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
            }
        );
    }

    createUI() {
        // Create UI container
        this.uiContainer = document.createElement('div');
        this.uiContainer.style.position = 'absolute';
        this.uiContainer.style.top = '0';
        this.uiContainer.style.left = '0';
        this.uiContainer.style.width = '100%';
        this.uiContainer.style.height = '100%';
        this.uiContainer.style.pointerEvents = 'none';
        this.uiContainer.style.zIndex = '1000';
        document.body.appendChild(this.uiContainer);

        // Create survival time display
        this.survivalTimeDisplay = document.createElement('div');
        this.survivalTimeDisplay.style.position = 'absolute';
        this.survivalTimeDisplay.style.top = '20px';
        this.survivalTimeDisplay.style.left = '50%';
        this.survivalTimeDisplay.style.transform = 'translateX(-50%)';
        this.survivalTimeDisplay.style.color = 'white';
        this.survivalTimeDisplay.style.fontSize = '24px';
        this.survivalTimeDisplay.style.fontFamily = 'Arial, sans-serif';
        this.survivalTimeDisplay.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        this.survivalTimeDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.survivalTimeDisplay.style.padding = '10px 20px';
        this.survivalTimeDisplay.style.borderRadius = '5px';
        this.survivalTimeDisplay.textContent = 'Survival Time: 0.0s';
        this.uiContainer.appendChild(this.survivalTimeDisplay);

        // Create score display
        this.scoreDisplay = document.createElement('div');
        this.scoreDisplay.style.position = 'absolute';
        this.scoreDisplay.style.top = '20px';
        this.scoreDisplay.style.left = '20px';
        this.scoreDisplay.style.color = 'white';
        this.scoreDisplay.style.fontSize = '24px';
        this.scoreDisplay.style.fontFamily = 'Arial, sans-serif';
        this.scoreDisplay.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        this.uiContainer.appendChild(this.scoreDisplay);

        // Create control tutorial
        this.controlTutorial = document.createElement('div');
        this.controlTutorial.style.position = 'absolute';
        this.controlTutorial.style.top = '20px';
        this.controlTutorial.style.right = '20px';
        this.controlTutorial.style.color = 'white';
        this.controlTutorial.style.fontSize = '16px';
        this.controlTutorial.style.fontFamily = 'Arial, sans-serif';
        this.controlTutorial.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        this.controlTutorial.style.textAlign = 'right';
        this.controlTutorial.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.controlTutorial.style.padding = '10px';
        this.controlTutorial.style.borderRadius = '5px';
        this.controlTutorial.innerHTML = `
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 10px; color: #ff9900;">M - Mute/Unmute</div>
            <div>Controls:</div>
            <div>↑ - Accelerate</div>
            <div>↓ - Brake</div>
            <div>← - Turn Left</div>
            <div>→ - Turn Right</div>
            <div>V - Change View</div>
            <div>P - Change Song</div>
        `;
        this.uiContainer.appendChild(this.controlTutorial);

        // Create game over screen
        this.gameOverScreen = document.createElement('div');
        this.gameOverScreen.style.position = 'absolute';
        this.gameOverScreen.style.top = '50%';
        this.gameOverScreen.style.left = '50%';
        this.gameOverScreen.style.transform = 'translate(-50%, -50%)';
        this.gameOverScreen.style.color = 'white';
        this.gameOverScreen.style.fontSize = '48px';
        this.gameOverScreen.style.fontFamily = 'Arial, sans-serif';
        this.gameOverScreen.style.textAlign = 'center';
        this.gameOverScreen.style.display = 'none';
        this.gameOverScreen.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        this.uiContainer.appendChild(this.gameOverScreen);

        // Create countdown display
        this.countdownDisplay = document.createElement('div');
        this.countdownDisplay.style.position = 'absolute';
        this.countdownDisplay.style.top = '50%';
        this.countdownDisplay.style.left = '50%';
        this.countdownDisplay.style.transform = 'translate(-50%, -50%)';
        this.countdownDisplay.style.color = 'white';
        this.countdownDisplay.style.fontSize = '72px';
        this.countdownDisplay.style.fontFamily = 'Arial, sans-serif';
        this.countdownDisplay.style.textAlign = 'center';
        this.countdownDisplay.style.display = 'none';
        this.countdownDisplay.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        this.uiContainer.appendChild(this.countdownDisplay);

        // Create win condition display
        this.winDisplay = document.createElement('div');
        this.winDisplay.style.position = 'absolute';
        this.winDisplay.style.top = '50%';
        this.winDisplay.style.left = '50%';
        this.winDisplay.style.transform = 'translate(-50%, -50%)';
        this.winDisplay.style.color = 'white';
        this.winDisplay.style.fontSize = '48px';
        this.winDisplay.style.fontFamily = 'Arial, sans-serif';
        this.winDisplay.style.textAlign = 'center';
        this.winDisplay.style.display = 'none';
        this.winDisplay.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        this.winDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.winDisplay.style.padding = '20px';
        this.winDisplay.style.borderRadius = '10px';
        this.uiContainer.appendChild(this.winDisplay);
    }

    startCountdown() {
        this.countdownElement.style.display = 'block';
        this.countdownElement.innerHTML = 'The colorful snowmen are tryin\' to zap you.<br>Be the best LAZER AVOIDER!<br><br><span style="font-size: 36px;">(Press V to cycle views)</span>';
        
        const countdownInterval = setInterval(() => {
            this.countdown--;
            if (this.countdown <= 0) {
                clearInterval(countdownInterval);
                this.countdownElement.style.display = 'none';
                this.gameStarted = true;
                this.gamePaused = false;
                // Start the game loop
                this.animate();
            } else {
                this.countdownElement.innerHTML = this.countdown;
            }
        }, 1000);
    }

    animate() {
        if (!this.isReady || this.scene.children.length === 0) {
            requestAnimationFrame(() => this.animate());
            return;
        }
        
        // Only proceed if karts are initialized and game has started
        if (!this.kart || !this.playerKartMesh || !this.gameStarted) {
            requestAnimationFrame(() => this.animate());
            return;
        }

        // If game is paused, just render the scene
        if (this.gamePaused) {
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(() => this.animate());
            return;
        }
        
        // Update survival time every 6 frames (0.1 seconds)
        if (this.kart) {
            this.kart.frameCount = (this.kart.frameCount || 0) + 1;
            if (this.kart.frameCount % 6 === 0) {
                this.kart.survivalTime = (this.kart.survivalTime || 0) + 0.1;
                if (this.survivalTimeDisplay) {
                    this.survivalTimeDisplay.textContent = `Survival Time: ${this.kart.survivalTime.toFixed(1)}s`;
                }
            }
        }
        
        // Initialize controls object
        const controls = {
            ArrowUp: this.keys['ArrowUp'] || false,
            ArrowDown: this.keys['ArrowDown'] || false,
            ArrowLeft: this.keys['ArrowLeft'] || false,
            ArrowRight: this.keys['ArrowRight'] || false,
            ' ': this.keys[' '] || false
        };
        
        // Update player kart
        if (this.kart) {
            this.kart.update(controls, this.kart);
        }
        
        // Track active CPU karts
        let activeCPUs = 0;
        let lastStandingColor = null;
        
        // Update CPU karts
        this.cpuKarts.forEach((kart, index) => {
            if (kart) {
                const shouldFireLaser = kart.update(controls, this.kart);
                if (shouldFireLaser) {
                    // Create laser from CPU kart
                    const laser = new Laser(
                        kart.position.x,
                        kart.position.z,
                        kart.rotation.y,
                        0xff00ff // Always pink
                    );
                    // Create laser mesh
                    const laserGeometry = new THREE.SphereGeometry(0.2, 8, 8);
                    const laserMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // Always pink
                    laser.mesh = new THREE.Mesh(laserGeometry, laserMaterial);
                    laser.mesh.position.copy(laser.position);
                    laser.mesh.scale.set(3, 3, 3); // Start at 3x size
                    this.scene.add(laser.mesh);
                    this.lasers.push(laser);
                    
                    // Play laser sound
                    if (this.soundEnabled && this.audioInitialized) {
                        const sound = this.laserSounds[Math.floor(Math.random() * this.laserSounds.length)];
                        sound.currentTime = 0;
                        sound.play().catch(error => console.log('Sound playback prevented:', error));
                    }
                }
                activeCPUs++;
                lastStandingColor = kart.color;
            }
        });
        
        // Check for win condition
        if (activeCPUs === 1 && this.winDisplay.style.display === 'none') {
            const colorNames = {
                0xff0000: 'RED',
                0x00ff00: 'GREEN',
                0x0000ff: 'BLUE',
                0xffff00: 'YELLOW',
                0xff00ff: 'MAGENTA',
                0x00ffff: 'CYAN',
                0xff8000: 'ORANGE',
                0x8000ff: 'PURPLE',
                0xd2b48c: 'BROWN',
                0xffffff: 'WHITE'
            };
            
            this.winDisplay.textContent = `${colorNames[lastStandingColor]} WINS!`;
            this.winDisplay.style.display = 'block';
            
            // Pause the game
            this.gamePaused = true;
            
            // Hide win display and start next round after 3 seconds
            setTimeout(() => {
                this.winDisplay.style.display = 'none';
                this.gamePaused = false;
                this.startCountdown();
            }, 3000);
        }
        
        // Update lasers and check collisions
        this.lasers = this.lasers.filter(laser => {
            const isAlive = laser.update();
            
            // Check collision with player
            if (isAlive && this.kart) {
                const dx = laser.position.x - this.kart.position.x;
                const dz = laser.position.z - this.kart.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance < (this.kart.radius + laser.radius)) {
                    // Player hit! Reset the game
                    if (this.socket) {
                        this.socket.emit('playerDied', this.socket.id);
                    }
                    this.resetGame();
                    return false;
                }
            }
            
            if (!isAlive && laser.mesh) {
                this.scene.remove(laser.mesh);
            }
            return isAlive;
        });
        
        // Update camera and meshes
        this.updateCamera();
        this.updateKartMeshes();
        this.updateVisuals();
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
        
        requestAnimationFrame(() => this.animate());
    }

    createEnvironment() {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 0);
        this.scene.add(directionalLight);
        
        // Create ground plane with default color
        const groundGeometry = new THREE.PlaneGeometry(80, 80);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x808080,
            roughness: 0.8,
            metalness: 0.2
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        this.scene.add(ground);
        
        // Load floor texture in background
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('floor0.jpg', 
            (texture) => {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(1, 1);
                ground.material.map = texture;
                ground.material.needsUpdate = true;
            }
        );
    }

    createArena() {
        const arenaSize = 40;
        const wallHeight = 5;
        
        // Create wall material with default color
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
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
        
        // Load wall texture in background
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
            }
        );
    }

    initializeAudio() {
        console.log('Initializing audio...');
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

        // Set up event listener for when a song ends
        this.backgroundMusic.addEventListener('ended', () => {
            console.log('Song ended, changing to next song...');
            this.changeSong();
        });

        // Start playing music immediately
        this.changeSong();
        this.audioInitialized = true;
        console.log('Audio initialized');
    }

    changeSong() {
        console.log('Changing song...');
        if (this.musicEnabled && this.audioInitialized) {
            // Generate a random number between 0 and 175
            const randomIndex = Math.floor(Math.random() * 176);
            const songUrl = `music${randomIndex}.mp3`;
            console.log('Loading song:', songUrl);
            
            // Set the new source
            this.backgroundMusic.src = songUrl;
            
            // Play the music
            const playPromise = this.backgroundMusic.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Music started playing');
                }).catch(error => {
                    console.log('Audio playback prevented:', error);
                    // Try to play again after user interaction
                    document.addEventListener('click', () => {
                        console.log('Attempting to play music after user interaction');
                        this.backgroundMusic.play().catch(e => console.log('Still cannot play:', e));
                    }, { once: true });
                });
            }
        } else {
            console.log('Music not enabled or audio not initialized');
        }
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
                const cameraOffset = new THREE.Vector3(0, 2, -4); // Changed from 4 to -4
                cameraOffset.applyEuler(this.kart.rotation);
                this.camera.position.copy(this.kart.position).add(cameraOffset);
                this.camera.lookAt(this.kart.position);
                break;
                
            case 'topView':
                // Top-down view - fixed position directly above
                this.camera.position.set(this.kart.position.x, 40, this.kart.position.z);
                this.camera.rotation.set(-Math.PI / 2, 0, 0); // Point straight down
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
            
            // Send position update to server
            if (this.socket) {
                this.socket.emit('playerMove', {
                    id: this.socket.id,
                    position: {
                        x: this.kart.position.x,
                        y: 0,
                        z: this.kart.position.z
                    },
                    rotation: {
                        x: 0,
                        y: this.kart.rotation.y,
                        z: 0
                    }
                });
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
            if (e.key === 'm') {
                e.preventDefault();
                this.toggleMute();
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
            if (e.key in this.keys) {
                e.preventDefault();
                this.keys[e.key] = true;
            }
        });

        window.addEventListener('keyup', (e) => {
            // Handle movement keys
            if (e.key in this.keys) {
                e.preventDefault();
                this.keys[e.key] = false;
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    addOtherPlayer(id, player) {
        // Create a new kart for the other player
        const otherKart = new Kart(
            player.position.x,
            player.position.z,
            false
        );
        otherKart.rotation.y = player.rotation.y;
        
        // Create mesh for the other player
        const otherMesh = otherKart.createMesh();
        otherMesh.material.color.setHex(0xff0000); // Make other players red
        
        // Add to scene
        this.scene.add(otherMesh);
        
        // Store references
        this.otherPlayers.set(id, otherKart);
        this.otherPlayerMeshes.set(id, otherMesh);
    }

    removeOtherPlayer(id) {
        const mesh = this.otherPlayerMeshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this.otherPlayerMeshes.delete(id);
            this.otherPlayers.delete(id);
        }
    }

    updateOtherPlayer(id, player) {
        const kart = this.otherPlayers.get(id);
        const mesh = this.otherPlayerMeshes.get(id);
        
        if (kart && mesh) {
            kart.position.set(player.position.x, 0, player.position.z);
            kart.rotation.y = player.rotation.y;
            mesh.position.copy(kart.position);
            mesh.rotation.copy(kart.rotation);
        }
    }

    toggleMute() {
        this.musicEnabled = !this.musicEnabled;
        this.soundEnabled = !this.soundEnabled;
        
        if (this.backgroundMusic) {
            this.backgroundMusic.muted = !this.musicEnabled;
            console.log('Music ' + (this.musicEnabled ? 'unmuted' : 'muted'));
        }
        
        // Update the control tutorial to show mute status
        const muteText = this.controlTutorial.querySelector('div:first-child');
        if (muteText) {
            muteText.textContent = `M - ${this.musicEnabled ? 'Mute' : 'Unmute'}`;
            muteText.style.color = this.musicEnabled ? '#ff9900' : '#ff0000';
        }
    }
}

// Preload title image
const titleImage = new Image();
titleImage.src = 'title2.jpg';

// Initialize the game when the page loads
window.addEventListener('load', () => {
    try {
        // Create game instance
        const game = new Game();
        
        // Create environment and arena immediately
        game.createEnvironment();
        game.createArena();
        
        // Create player kart
        game.kart = new Kart(0, 0, false);
        game.kart.rotation.y = Math.PI; // Start facing north
        
        // Create player mesh
        game.playerKartMesh = game.kart.createMesh();
        game.scene.add(game.playerKartMesh);
        
        // Create UI
        game.createUI();
        
        // Set up event listeners
        game.setupEventListeners();
        
        // Set isReady to true after everything is initialized
        game.isReady = true;
        
        // Start animation
        game.animate();
        
        // Initialize audio
        game.initializeAudio();
        
        // Start the game
        game.resetGame();
    } catch (error) {
        console.error('Error initializing game:', error);
    }
}); 