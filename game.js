import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { io } from 'https://cdn.socket.io/4.7.4/socket.io.esm.min.js';
import * as nipplejs from './lib/nipplejs.min.js';

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
            // Scale the mesh based on remaining lifetime - start at 4x size, shrink to 1x
            const scale = 1 + (3 * this.lifetime / this.maxLifetime); // 4x to 1x scaling
            this.mesh.scale.set(scale, scale, scale);
        }
        
        // Check wall collisions
        const arenaSize = 40;
        
        // Check X boundaries
        if (Math.abs(this.position.x) > arenaSize) {
            this.position.x = Math.sign(this.position.x) * arenaSize;
            // Reverse X velocity and add some randomness
            this.velocity.x *= -1;
            this.velocity.z += (Math.random() - 0.5) * 0.2; // Add small random Z component
        }
        
        // Check Z boundaries
        if (Math.abs(this.position.z) > arenaSize) {
            this.position.z = Math.sign(this.position.z) * arenaSize;
            // Reverse Z velocity and add some randomness
            this.velocity.z *= -1;
            this.velocity.x += (Math.random() - 0.5) * 0.2; // Add small random X component
        }

        return this.lifetime > 0;
    }

    checkCollision(kart) {
        // Simple sphere collision detection
        const distance = this.position.distanceTo(kart.position);
        return distance < (this.radius + kart.radius);
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
        
        // Randomly select a color, default to red if something goes wrong
        this.color = colors[Math.floor(Math.random() * colors.length)] || 0xff0000;
        
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
            smile.position.set(0, 0.4, 0.5); // Moved up from 0.2 to 0.4
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
        // Add resource loading state
        this.resourcesLoaded = false;
        this.resourcesToLoad = 0;
        this.resourcesLoadedCount = 0;
        
        // Add performance monitoring
        this.lastFrameTime = 0;
        this.targetFrameRate = 60;
        this.frameTime = 1000 / this.targetFrameRate;
        
        // Add visibility state
        this.isVisible = true;
        
        // Initialize Three.js first
        this.initializeThreeJS();
        
        // Start resource loading
        this.loadResources().then(() => {
            this.resourcesLoaded = true;
            this.initializeGame();
        });
    }
    
    initializeThreeJS() {
        // Three.js setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x4FC3F7);
        document.body.appendChild(this.renderer.domElement);
    }
    
    async loadResources() {
        // Create loading screen
        this.createLoadingScreen();
        
        // Load laser sounds
        const laserSoundFiles = ['laser1.mp3', 'laser2.mp3', 'laser3.mp3'];
        this.laserSounds = [];
        this.resourcesToLoad += laserSoundFiles.length;
        
        for (const soundFile of laserSoundFiles) {
            const sound = new Audio();
            sound.src = soundFile;
            sound.volume = 0.3;
            this.laserSounds.push(sound);
            
            try {
                await new Promise((resolve, reject) => {
                    sound.addEventListener('canplaythrough', resolve);
                    sound.addEventListener('error', reject);
                });
                this.resourcesLoadedCount++;
                this.updateLoadingProgress();
            } catch (error) {
                console.error(`Failed to load sound: ${soundFile}`, error);
            }
        }
        
        // Load title image
        this.resourcesToLoad++;
        try {
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = resolve;
                img.onerror = reject;
                img.src = 'title2.jpg';
                this.titleImage = img;
            });
            this.resourcesLoadedCount++;
            this.updateLoadingProgress();
        } catch (error) {
            console.error('Failed to load title image', error);
        }
    }
    
    createLoadingScreen() {
        this.loadingScreen = document.createElement('div');
        this.loadingScreen.style.position = 'absolute';
        this.loadingScreen.style.top = '0';
        this.loadingScreen.style.left = '0';
        this.loadingScreen.style.width = '100%';
        this.loadingScreen.style.height = '100%';
        this.loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.loadingScreen.style.display = 'flex';
        this.loadingScreen.style.flexDirection = 'column';
        this.loadingScreen.style.justifyContent = 'center';
        this.loadingScreen.style.alignItems = 'center';
        this.loadingScreen.style.color = 'white';
        this.loadingScreen.style.fontFamily = 'Arial, sans-serif';
        this.loadingScreen.style.zIndex = '2000';
        
        const loadingText = document.createElement('div');
        loadingText.textContent = 'Loading Resources...';
        loadingText.style.fontSize = '24px';
        loadingText.style.marginBottom = '20px';
        
        const progressBar = document.createElement('div');
        progressBar.style.width = '300px';
        progressBar.style.height = '20px';
        progressBar.style.backgroundColor = '#333';
        progressBar.style.borderRadius = '10px';
        progressBar.style.overflow = 'hidden';
        
        const progressFill = document.createElement('div');
        progressFill.style.width = '0%';
        progressFill.style.height = '100%';
        progressFill.style.backgroundColor = '#4CAF50';
        progressFill.style.transition = 'width 0.3s';
        
        progressBar.appendChild(progressFill);
        this.loadingScreen.appendChild(loadingText);
        this.loadingScreen.appendChild(progressBar);
        this.progressFill = progressFill;
        
        document.body.appendChild(this.loadingScreen);
    }
    
    updateLoadingProgress() {
        const progress = (this.resourcesLoadedCount / this.resourcesToLoad) * 100;
        this.progressFill.style.width = `${progress}%`;
        
        if (progress >= 100) {
            setTimeout(() => {
                this.loadingScreen.style.display = 'none';
            }, 500);
        }
    }
    
    initializeGame() {
        // Initialize game state
        this.gameStatus = 'waiting';
        this.roundNumber = 0;
        this.eliminatedPlayers = new Set();
        
        // Create environment and arena
        this.createEnvironment();
        this.createArena();
        
        // Create player kart
        this.kart = new Kart(0, 0, false);
        this.kart.rotation.y = Math.PI;
        
        // Create player mesh
        this.playerKartMesh = this.kart.createMesh();
        this.scene.add(this.playerKartMesh);
        
        // Create UI
        this.createUI();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize socket connection
        this.initializeSocket();
        
        // Start animation loop
        this.isReady = true;
        this.animate();
    }
    
    animate() {
        if (!this.isReady || !this.resourcesLoaded) {
            requestAnimationFrame(() => this.animate());
            return;
        }
        
        // Frame rate limiting
        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        
        if (elapsed > this.frameTime) {
            this.lastFrameTime = now - (elapsed % this.frameTime);
            
            // Only update if tab is visible
            if (this.isVisible) {
                // Update game state
                this.updateGameState();
                
                // Render scene
                this.renderer.render(this.scene, this.camera);
            }
        }
        
        requestAnimationFrame(() => this.animate());
    }
    
    updateGameState() {
        // Clean up old lasers
        this.lasers = this.lasers.filter(laser => {
            if (laser.lifetime <= 0) {
                if (laser.mesh) {
                    this.scene.remove(laser.mesh);
                    laser.mesh.geometry.dispose();
                    laser.mesh.material.dispose();
                }
                return false;
            }
            return true;
        });
        
        // Limit movement buffer size
        if (this.movementBuffer.length > 10) {
            this.movementBuffer = this.movementBuffer.slice(-10);
        }
        
        // Update multiplayer state
        this.updateMultiplayerState();
        
        // Update camera
        this.updateCamera();
    }
    
    setupEventListeners() {
        // ... existing event listeners ...
        
        // Add visibility change handler
        document.addEventListener('visibilitychange', () => {
            this.isVisible = document.visibilityState === 'visible';
            if (this.isVisible) {
                this.lastFrameTime = performance.now();
            }
        });
        
        // Add error handlers
        window.addEventListener('error', (event) => {
            console.error('Game error:', event.error);
            this.showNotification('An error occurred. Please refresh the page.');
        });
        
        // Add unload handler for cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }
    
    cleanup() {
        // Dispose of Three.js resources
        this.scene.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        
        // Clear intervals and timeouts
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
        }
        
        // Stop audio
        if (this.backgroundMusic) {
            this.backgroundMusic.pause();
            this.backgroundMusic = null;
        }
        
        this.laserSounds.forEach(sound => {
            sound.pause();
            sound = null;
        });
    }

    initializeSocket() {
        this.socket = io({
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            timeout: 5000
        });

        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.reconnectAttempts = 0;
            this.showNotification('Connected to server');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showNotification('Disconnected from server. Attempting to reconnect...');
            this.handleDisconnect();
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.showNotification('Connection error. Retrying...');
        });

        this.socket.on('serverFull', () => {
            this.showNotification('Server is full. Please try again later.');
            this.socket.disconnect();
        });

        this.socket.on('gameState', (state) => {
            this.handleGameState(state);
        });

        this.socket.on('gameStateUpdate', (state) => {
            this.handleGameStateUpdate(state);
        });

        this.socket.on('playerJoined', (player) => {
            this.handlePlayerJoined(player);
        });

        this.socket.on('playerLeft', (playerId) => {
            this.handlePlayerLeft(playerId);
        });

        this.socket.on('playerMoved', (data) => {
            this.handlePlayerMoved(data);
        });

        this.socket.on('playerEliminated', (data) => {
            this.handlePlayerEliminated(data);
        });

        this.socket.on('invalidMovement', (data) => {
            this.handleInvalidMovement(data);
        });

        this.socket.on('gameOver', (data) => {
            this.handleGameOver(data);
        });

        // Start ping measurement
        this.startPingMeasurement();

        this.socket.on('currentPlayers', (players) => {
            console.log('Received current players:', players);
            Object.entries(players).forEach(([id, player]) => {
                if (id !== this.socket.id) {
                    this.addOtherPlayer(id, player);
                }
            });
        });

        this.socket.on('playerJoined', (player) => {
            console.log('Player joined:', player);
            this.addOtherPlayer(player.id, player);
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left:', playerId);
            this.removeOtherPlayer(playerId);
        });

        this.socket.on('playerMoved', (player) => {
            this.updateOtherPlayer(player.id, player);
        });

        this.socket.on('laserFired', (data) => {
            if (data.playerId !== this.socket.id) {
                this.createLaserFromOtherPlayer(data);
            }
        });
        
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
        
        // Add gamePaused state
        this.gamePaused = false;

        // Add start screen state
        this.showStartScreen = true;
        this.countdownActive = false;
        this.countdownValue = 3;
        
        // Create start screen and countdown elements
        this.createStartScreen();
        
        // Create environment and arena immediately
        this.createEnvironment();
        this.createArena();
        
        // Create player kart
        this.kart = new Kart(0, 0, false);
        this.kart.rotation.y = Math.PI; // Start facing north
        
        // Create player mesh
        this.playerKartMesh = this.kart.createMesh();
        this.scene.add(this.playerKartMesh);
        
        // Create UI
        this.createUI();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Set isReady to true after everything is initialized
        this.isReady = true;
        
        // Start animation
        this.animate();
        
        // Initialize audio
        this.initializeAudio();
        
        // Start the game
        this.resetGame();

        // Add mobile detection
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Initialize virtual joysticks if mobile
        if (this.isMobile) {
            this.initMobileControls();
        }

        // Add player elimination tracking
        this.eliminatedPlayers = new Set();

        // Add new game state properties
        this.gameStatus = 'waiting';
        this.roundNumber = 0;
        this.lastServerUpdate = 0;
        this.serverTimeOffset = 0;
        this.movementBuffer = [];
        this.interpolationDelay = 100; // ms
        this.spectatorMode = false;
        this.spectatedPlayer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectTimeout = null;

        // Initialize socket with reconnection handling
        this.initializeSocket();
    }

    initMobileControls() {
        // Create container for left joystick (movement)
        const leftJoystickContainer = document.createElement('div');
        leftJoystickContainer.style.position = 'absolute';
        leftJoystickContainer.style.bottom = '20px';
        leftJoystickContainer.style.left = '20px';
        leftJoystickContainer.style.width = '150px';
        leftJoystickContainer.style.height = '150px';
        leftJoystickContainer.style.zIndex = '1000';
        document.body.appendChild(leftJoystickContainer);

        // Create container for right joystick (rotation)
        const rightJoystickContainer = document.createElement('div');
        rightJoystickContainer.style.position = 'absolute';
        rightJoystickContainer.style.bottom = '20px';
        rightJoystickContainer.style.right = '20px';
        rightJoystickContainer.style.width = '150px';
        rightJoystickContainer.style.height = '150px';
        rightJoystickContainer.style.zIndex = '1000';
        document.body.appendChild(rightJoystickContainer);

        // Initialize left joystick (movement)
        this.leftJoystick = nipplejs.create({
            zone: leftJoystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120
        });

        // Initialize right joystick (rotation)
        this.rightJoystick = nipplejs.create({
            zone: rightJoystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120
        });

        // Handle left joystick events (movement)
        this.leftJoystick.on('move', (evt, data) => {
            if (!this.gameStarted || this.countdownActive) return;
            
            // Convert joystick position to movement
            const angle = data.angle.radian;
            const force = Math.min(data.force, 1);
            
            // Update movement keys based on joystick position
            this.keys.ArrowUp = force > 0.1 && angle > -Math.PI/2 && angle < Math.PI/2;
            this.keys.ArrowDown = force > 0.1 && (angle > Math.PI/2 || angle < -Math.PI/2);
        });

        // Handle right joystick events (rotation)
        this.rightJoystick.on('move', (evt, data) => {
            if (!this.gameStarted || this.countdownActive) return;
            
            // Convert joystick position to rotation
            const angle = data.angle.radian;
            const force = Math.min(data.force, 1);
            
            // Update rotation keys based on joystick position
            this.keys.ArrowLeft = force > 0.1 && angle > Math.PI/2 && angle < Math.PI * 1.5;
            this.keys.ArrowRight = force > 0.1 && (angle > -Math.PI/2 && angle < Math.PI/2);
        });

        // Reset keys when joysticks are released
        this.leftJoystick.on('end', () => {
            this.keys.ArrowUp = false;
            this.keys.ArrowDown = false;
        });

        this.rightJoystick.on('end', () => {
            this.keys.ArrowLeft = false;
            this.keys.ArrowRight = false;
        });

        // Add mobile-specific UI elements
        const mobileControls = document.createElement('div');
        mobileControls.style.position = 'absolute';
        mobileControls.style.bottom = '180px';
        mobileControls.style.left = '50%';
        mobileControls.style.transform = 'translateX(-50%)';
        mobileControls.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        mobileControls.style.padding = '10px';
        mobileControls.style.borderRadius = '5px';
        mobileControls.style.color = 'white';
        mobileControls.style.fontFamily = 'Arial, sans-serif';
        mobileControls.style.textAlign = 'center';
        mobileControls.style.zIndex = '1000';
        mobileControls.innerHTML = `
            <div>Left Stick - Move</div>
            <div>Right Stick - Rotate</div>
        `;
        document.body.appendChild(mobileControls);
    }

    addOtherPlayer(id, player) {
        console.log('Adding other player:', id, player);
        const otherKart = new Kart(player.position.x, player.position.z, false);
        // Ensure color is set from player data or default to red
        otherKart.color = player.color || 0xff0000;
        otherKart.rotation.y = player.rotation.y;
        
        const otherMesh = otherKart.createMesh();
        this.scene.add(otherMesh);
        
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

    createLaserFromOtherPlayer(data) {
        const laser = new Laser(
            data.position.x,
            data.position.z,
            data.direction,
            data.color
        );
        
        const laserGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const laserMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        laser.mesh = new THREE.Mesh(laserGeometry, laserMaterial);
        laser.mesh.position.copy(laser.position);
        laser.mesh.scale.set(4, 4, 4); // Start at 4x size
        this.scene.add(laser.mesh);
        this.lasers.push(laser);
    }

    updateMultiplayerState() {
        if (!this.kart) return;
        
        // Send our position, rotation, and color
        this.socket.emit('playerMove', {
            position: {
                x: this.kart.position.x,
                y: 0,
                z: this.kart.position.z
            },
            rotation: {
                x: 0,
                y: this.kart.rotation.y,
                z: 0
            },
            color: this.kart.color // Include color in the update
        });
    }

    createEnvironment() {
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        this.scene.add(directionalLight);

        // Add fog
        this.scene.fog = new THREE.Fog(0x4FC3F7, 20, 100);
    }

    createArena() {
        // Create floor
        const floorGeometry = new THREE.PlaneGeometry(80, 80);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.1;
        this.scene.add(floor);

        // Create walls
        const wallGeometry = new THREE.BoxGeometry(80, 10, 1);
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.3
        });

        // North wall
        const northWall = new THREE.Mesh(wallGeometry, wallMaterial);
        northWall.position.set(0, 5, -40);
        this.scene.add(northWall);

        // South wall
        const southWall = new THREE.Mesh(wallGeometry, wallMaterial);
        southWall.position.set(0, 5, 40);
        this.scene.add(southWall);

        // East wall
        const eastWall = new THREE.Mesh(wallGeometry, wallMaterial);
        eastWall.rotation.y = Math.PI / 2;
        eastWall.position.set(40, 5, 0);
        this.scene.add(eastWall);

        // West wall
        const westWall = new THREE.Mesh(wallGeometry, wallMaterial);
        westWall.rotation.y = Math.PI / 2;
        westWall.position.set(-40, 5, 0);
        this.scene.add(westWall);
    }

    handleGameState(state) {
        this.gameStatus = state.gameStatus;
        this.roundNumber = state.roundNumber;
        this.eliminatedPlayers = new Set(state.eliminatedPlayers);

        // Update player list
        state.players.forEach(([id, player]) => {
            if (id !== this.socket.id) {
                this.addOtherPlayer(id, player);
            }
        });

        // Update UI based on game state
        this.updateUI();
    }

    handleGameStateUpdate(state) {
        // Update local game state
        this.gameStatus = state.gameStatus;
        this.roundNumber = state.roundNumber;
        this.eliminatedPlayers = new Set(state.eliminatedPlayers);

        // Update player positions with interpolation
        state.players.forEach(([id, player]) => {
            if (id !== this.socket.id) {
                this.updateOtherPlayer(id, player);
            }
        });

        // Update UI
        this.updateUI();
    }

    handlePlayerJoined(player) {
        this.addOtherPlayer(player.id, player);
        this.showNotification(`Player ${player.id} joined the game`);
    }

    handlePlayerLeft(playerId) {
        this.removeOtherPlayer(playerId);
        this.showNotification(`Player ${playerId} left the game`);

        // If we were spectating this player, switch to another
        if (this.spectatorMode && this.spectatedPlayer === playerId) {
            this.switchSpectatedPlayer();
        }
    }

    handlePlayerMoved(data) {
        const player = this.otherPlayers.get(data.id);
        if (player) {
            // Add to movement buffer for interpolation
            this.movementBuffer.push({
                id: data.id,
                position: data.position,
                rotation: data.rotation,
                timestamp: Date.now()
            });

            // Keep buffer size reasonable
            if (this.movementBuffer.length > 10) {
                this.movementBuffer.shift();
            }
        }
    }

    handlePlayerEliminated(data) {
        this.eliminatedPlayers.add(data.id);
        this.showNotification(`Player ${data.id} was eliminated! Survival time: ${this.formatTime(data.survivalTime)}`);

        // If we were spectating this player, switch to another
        if (this.spectatorMode && this.spectatedPlayer === data.id) {
            this.switchSpectatedPlayer();
        }
    }

    handleInvalidMovement(data) {
        // Reset position to last valid position
        if (this.kart) {
            this.kart.position.copy(data.position);
            if (this.playerKartMesh) {
                this.playerKartMesh.position.copy(data.position);
            }
        }
    }

    handleGameOver(data) {
        this.gameStatus = 'finished';
        if (data.winner === this.socket.id) {
            this.showNotification('You won!');
        } else {
            this.showNotification(`Player ${data.winner} won!`);
        }

        // Show final scores
        this.showFinalScores(data);
    }

    handleDisconnect() {
        this.reconnectAttempts++;
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            this.showNotification(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            this.reconnectTimeout = setTimeout(() => {
                this.socket.connect();
            }, 1000 * this.reconnectAttempts);
        } else {
            this.showNotification('Failed to reconnect. Please refresh the page.');
        }
    }

    startPingMeasurement() {
        setInterval(() => {
            const start = Date.now();
            this.socket.emit('ping', () => {
                const latency = Date.now() - start;
                this.serverTimeOffset = latency / 2;
            });
        }, 1000);
    }

    updateCamera() {
        if (this.spectatorMode && this.spectatedPlayer) {
            // Spectator camera
            const targetPlayer = this.otherPlayers.get(this.spectatedPlayer);
            if (targetPlayer) {
                const targetMesh = this.otherPlayerMeshes.get(this.spectatedPlayer);
                if (targetMesh) {
                    this.camera.position.copy(targetMesh.position);
                    this.camera.position.y += 5;
                    this.camera.lookAt(targetMesh.position);
                }
            }
        } else {
            // Normal camera modes
            switch (this.viewMode) {
                case 'firstPerson':
                    this.camera.position.copy(this.kart.position);
                    this.camera.position.y += 1;
                    this.camera.rotation.copy(this.kart.rotation);
                    break;
                case 'topView':
                    this.camera.position.set(
                        this.kart.position.x,
                        this.kart.position.y + 20,
                        this.kart.position.z
                    );
                    this.camera.lookAt(this.kart.position);
                    break;
                case 'isometric':
                    this.camera.position.set(
                        this.kart.position.x + 10,
                        this.kart.position.y + 10,
                        this.kart.position.z + 10
                    );
                    this.camera.lookAt(this.kart.position);
                    break;
            }
        }
    }

    switchSpectatedPlayer() {
        const activePlayers = Array.from(this.otherPlayers.keys())
            .filter(id => !this.eliminatedPlayers.has(id));

        if (activePlayers.length > 0) {
            const currentIndex = activePlayers.indexOf(this.spectatedPlayer);
            const nextIndex = (currentIndex + 1) % activePlayers.length;
            this.spectatedPlayer = activePlayers[nextIndex];
            this.showNotification(`Spectating player ${this.spectatedPlayer}`);
        } else {
            this.spectatorMode = false;
            this.spectatedPlayer = null;
            this.showNotification('No players to spectate');
        }
    }

    showFinalScores(data) {
        const scores = Array.from(this.otherPlayers.entries())
            .map(([id, player]) => ({
                id,
                survivalTime: player.survivalTime
            }))
            .concat([{
                id: this.socket.id,
                survivalTime: this.kart.survivalTime
            }])
            .sort((a, b) => b.survivalTime - a.survivalTime);

        let scoreText = 'Final Scores:\n';
        scores.forEach((score, index) => {
            scoreText += `${index + 1}. Player ${score.id}: ${this.formatTime(score.survivalTime)}\n`;
        });

        this.showNotification(scoreText);
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = (seconds % 60).toFixed(1);
        return `${minutes}:${remainingSeconds.padStart(4, '0')}`;
    }

    showNotification(message) {
        if (this.achievementNotification) {
            this.achievementNotification.textContent = message;
            this.achievementNotification.style.display = 'block';
            this.achievementNotification.style.opacity = '1';
            
            setTimeout(() => {
                this.achievementNotification.style.opacity = '0';
                setTimeout(() => {
                    this.achievementNotification.style.display = 'none';
                }, 500);
            }, 3000);
        }
    }
}

// ... rest of the code ... 