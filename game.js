console.log('START OF GAME.JS');
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import './lib/nipplejs.min.js';  // Just import the script, don't try to use it as a module

// Constants
const ARENA_SIZE = 20;
const SNOWMAN_COLORS = [0x800080, 0x0000FF, 0x00FF00]; // Purple, Blue, Green
const LASER_COLOR = 0xFF69B4; // Pink
const SNOWMAN_SIZE = 1;
const PLAYER_SIZE = 0.5;
const LASER_INITIAL_SIZE = 0.84; // Increased from 0.67 to 0.84 (25% increase)
const LASER_DURATION = 2000; // Reduced from 2500 to 2000 for faster lasers
const LASER_SHRINK_RATE = 0.1;
const SNOWMAN_FIRE_INTERVAL = { min: 1500, max: 2500 }; // 1.5-2.5 seconds
const SNOWMAN_FACE_PLAYER_CHANCE = 0.2; // 20% chance

// Player colors (ROYGBIV + Brown, White, Black)
const PLAYER_COLORS = [
    0xFF0000, // Red
    0xFF7F00, // Orange
    0xFFFF00, // Yellow
    0x00FF00, // Green
    0x0000FF, // Blue
    0x4B0082, // Indigo
    0x9400D3, // Violet
    0x8B4513, // Brown
    0xFFFFFF, // White
    0x000000  // Black
];

class Game {
    constructor() {
        console.log('Game constructor started');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Initialize properties
        this.players = new Map();
        this.snowmen = [];
        this.lasers = [];
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.currentView = 'top';
        this.hasUserInteracted = false;
        
        // Initialize laser sound
        this.laserSound = new Audio('laser.mp3');
        this.laserSound.autoplay = false;
        
        // Initialize controls
        this.gamepad = null;
        this.gamepadIndex = null;
        this.leftJoystick = null;
        this.rightJoystick = null;
        
        // Initialize keyboard state
        this.keys = {
            'ArrowUp': false,
            'ArrowDown': false,
            'ArrowLeft': false,
            'ArrowRight': false
        };
        
        console.log('Setting up game components...');
        this.setupScene();
        this.setupControls();
        this.setupEventListeners();
        this.setupSocket();
        this.setupGamepad();
        
        // Add snowman update interval
        this.snowmanUpdateInterval = setInterval(() => {
            this.socket.emit('requestSnowmanUpdate');
        }, 1000 / 60);
        
        console.log('Starting game loop...');
        this.animate();
        window.game = this;
        
        // Hide loading screen
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        console.log('Game initialization complete');
    }
    
    setupScene() {
        // Floor
        const floorTexture = new THREE.TextureLoader().load('floor.jpg');
        const floorGeometry = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
        const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        
        // Walls
        const wallTexture = new THREE.TextureLoader().load('wall.jpg');
        const wallMaterial = new THREE.MeshBasicMaterial({ map: wallTexture });
        
        const wallGeometry = new THREE.BoxGeometry(ARENA_SIZE, 5, 0.1);
        const walls = [
            { pos: [0, 2.5, ARENA_SIZE/2], rot: [0, 0, 0] },
            { pos: [0, 2.5, -ARENA_SIZE/2], rot: [0, 0, 0] },
            { pos: [ARENA_SIZE/2, 2.5, 0], rot: [0, Math.PI/2, 0] },
            { pos: [-ARENA_SIZE/2, 2.5, 0], rot: [0, Math.PI/2, 0] }
        ];
        
        walls.forEach(wall => {
            const mesh = new THREE.Mesh(wallGeometry, wallMaterial);
            mesh.position.set(...wall.pos);
            mesh.rotation.set(...wall.rot);
            this.scene.add(mesh);
        });
        
        // Create snowmen
        for (let i = 0; i < 3; i++) {
            this.snowmen.push(new Snowman(this.scene, SNOWMAN_COLORS[i], this));
        }
        
        // Set initial camera position
        this.updateCameraView();
    }
    
    setupControls() {
        console.log('Setting up controls, isMobile:', this.isMobile);
        if (this.isMobile) {
            console.log('Setting up mobile controls');
            // Show mobile controls
            const mobileControls = document.getElementById('mobileControls');
            const mobileButtons = document.getElementById('mobileButtons');
            const leftJoystick = document.getElementById('leftJoystick');
            const rightJoystick = document.getElementById('rightJoystick');
            
            if (mobileControls) mobileControls.style.display = 'block';
            if (mobileButtons) mobileButtons.style.display = 'block';
            if (leftJoystick) leftJoystick.style.display = 'block';
            if (rightJoystick) rightJoystick.style.display = 'block';
            
            // Left joystick for movement
            const leftOptions = {
                zone: leftJoystick,
                mode: 'static',
                position: { left: '25%', bottom: '25%' },
                color: 'white',
                size: 120,
                dynamicPage: true
            };
            
            console.log('Creating left joystick');
            this.leftJoystick = nipplejs.create(leftOptions);
            this.leftJoystick.on('move', (evt, data) => {
                if (this.currentPlayer) {
                    this.currentPlayer.move(data.vector.x, data.vector.y);
                }
            });
            
            // Right joystick for camera control
            const rightOptions = {
                zone: rightJoystick,
                mode: 'static',
                position: { right: '25%', bottom: '25%' },
                color: 'white',
                size: 120,
                dynamicPage: true
            };
            
            console.log('Creating right joystick');
            this.rightJoystick = nipplejs.create(rightOptions);
            this.rightJoystick.on('move', (evt, data) => {
                if (this.currentView === 'first-person' && this.currentPlayer) {
                    // Rotate camera based on joystick position
                    const angle = Math.atan2(data.vector.y, data.vector.x);
                    this.currentPlayer.direction.x = Math.cos(angle);
                    this.currentPlayer.direction.z = Math.sin(angle);
                }
            });
        } else {
            console.log('Setting up keyboard controls');
            this.setupKeyboardControls();
            // Hide mobile controls on desktop
            const mobileControls = document.getElementById('mobileControls');
            const mobileButtons = document.getElementById('mobileButtons');
            if (mobileControls) mobileControls.style.display = 'none';
            if (mobileButtons) mobileButtons.style.display = 'none';
        }
    }
    
    setupKeyboardControls() {
        this.keys = {
            'ArrowUp': false,
            'ArrowDown': false,
            'ArrowLeft': false,
            'ArrowRight': false
        };
        document.addEventListener('keydown', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = true;
                console.log('Key pressed:', e.key, this.keys);
            }
            if (e.key === 'v' || e.key === 'V') {
                this.cycleView();
            }
        });
        document.addEventListener('keyup', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = false;
                console.log('Key released:', e.key, this.keys);
            }
        });
    }
    
    setupSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            
            // Clean up any existing player for this ID
            if (this.currentPlayer) {
                this.currentPlayer.remove();
                this.players.delete(this.socket.id);
            }
            
            // Create current player with socket reference
            this.currentPlayer = new Player(this.scene, this.socket.id, this.socket);
            this.players.set(this.socket.id, this.currentPlayer);
        });
        
        this.socket.on('gameState', (state) => {
            console.log('Received game state:', state);
            
            // Update snowmen positions if provided
            if (state.snowmen) {
                state.snowmen.forEach((snowmanData, index) => {
                    if (this.snowmen[index]) {
                        this.snowmen[index].mesh.position.set(
                            snowmanData.position.x,
                            snowmanData.position.y,
                            snowmanData.position.z
                        );
                        this.snowmen[index].velocity.set(
                            snowmanData.velocity.x,
                            snowmanData.velocity.y,
                            snowmanData.velocity.z
                        );
                    }
                });
            }
        });
        
        // Add respawn handler
        this.socket.on('playerRespawn', (data) => {
            const player = this.players.get(data.id);
            if (player && player !== this.currentPlayer) {
                player.respawn();
            }
        });
        
        this.socket.on('disconnect', () => {
            // Clean up current player
            if (this.currentPlayer) {
                this.currentPlayer.remove();
                this.players.delete(this.socket.id);
                this.currentPlayer = null;
            }
        });
        
        this.socket.on('currentPlayers', (playersData) => {
            console.log('Received current players:', playersData);
            
            // Clean up any players that are no longer in the list
            const currentIds = new Set(playersData.map(([id]) => id));
            for (const [id, player] of this.players.entries()) {
                if (!currentIds.has(id) && id !== this.socket.id) {
                    player.remove();
                    this.players.delete(id);
                }
            }
            
            // Update or create players
            playersData.forEach(([id, data]) => {
                if (id !== this.socket.id) {  // Don't create duplicate for self
                    let player = this.players.get(id);
                    if (!player) {
                        console.log('Creating new player:', id);
                        player = new Player(this.scene, id, this.socket);
                        this.players.set(id, player);
                    }
                    player.updatePosition(data.position);
                    player.isDead = data.isDead;
                    if (player.isDead) {
                        player.baseCube.material.color.set(0x808080);
                        player.topCube.material.color.set(0x808080);
                    }
                }
            });
        });
        
        this.socket.on('playerJoined', (playerData) => {
            console.log('Player joined:', playerData);
            if (this.players.size < 10) {
                const player = new Player(this.scene, playerData.id, this.socket);
                this.players.set(playerData.id, player);
                player.isDead = playerData.isDead;
                if (player.isDead) {
                    player.baseCube.material.color.set(0x808080);
                    player.topCube.material.color.set(0x808080);
                }
            }
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left:', playerId);
            const player = this.players.get(playerId);
            if (player) {
                player.remove();
                this.players.delete(playerId);
            }
        });

        this.socket.on('playerMoved', (data) => {
            const player = this.players.get(data.id);
            if (player && player !== this.currentPlayer) {
                // Directly set position from server data
                player.mesh.position.set(
                    data.position.x,
                    data.position.y,
                    data.position.z
                );
                // Update velocity for visual effects
                player.velocity.set(
                    data.velocity.x,
                    data.velocity.y,
                    data.velocity.z
                );
            }
        });
        
        this.socket.on('playerDied', (data) => {
            console.log('Player died:', data.id);
            const player = this.players.get(data.id);
            if (player) {
                player.die();
            }
        });

        this.socket.on('snowmanUpdate', (snowmenData) => {
            console.log('Received snowman update:', snowmenData);
            snowmenData.forEach((snowmanData, index) => {
                if (this.snowmen[index]) {
                    this.snowmen[index].mesh.position.set(
                        snowmanData.position.x,
                        snowmanData.position.y,
                        snowmanData.position.z
                    );
                }
            });
        });
    }
    
    setupGamepad() {
        window.addEventListener("gamepadconnected", (e) => {
            console.log("Gamepad connected:", e.gamepad);
            this.gamepadIndex = e.gamepad.index;
            this.gamepad = navigator.getGamepads()[this.gamepadIndex];
        });
        
        window.addEventListener("gamepaddisconnected", (e) => {
            console.log("Gamepad disconnected:", e.gamepad);
            if (e.gamepad.index === this.gamepadIndex) {
                this.gamepad = null;
                this.gamepadIndex = null;
            }
        });
    }
    
    updateCameraView() {
        switch (this.currentView) {
            case 'top':
                this.camera.position.set(0, 20, 0);
                this.camera.lookAt(0, 0, 0);
                break;
            case 'isometric':
                this.camera.position.set(15, 15, 15);
                this.camera.lookAt(0, 0, 0);
                break;
            case 'first-person':
                if (this.currentPlayer) {
                    // Position camera 5 units back and 3 units up from player
                    const offset = new THREE.Vector3(
                        -this.currentPlayer.direction.x * 5,
                        3,
                        -this.currentPlayer.direction.z * 5
                    );
                    this.camera.position.copy(this.currentPlayer.mesh.position).add(offset);
                    this.camera.lookAt(
                        this.currentPlayer.mesh.position.x + this.currentPlayer.direction.x,
                        this.currentPlayer.mesh.position.y,
                        this.currentPlayer.mesh.position.z + this.currentPlayer.direction.z
                    );
                }
                break;
        }
    }
    
    cycleView() {
        const views = ['top', 'isometric', 'first-person'];
        const currentIndex = views.indexOf(this.currentView);
        this.currentView = views[(currentIndex + 1) % views.length];
        this.updateCameraView();
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update gamepad state
        if (this.gamepad) {
            this.gamepad = navigator.getGamepads()[this.gamepadIndex];
            if (this.gamepad && this.currentPlayer && !this.currentPlayer.isDead) {
                // Left stick for movement
                const moveX = this.gamepad.axes[0];
                const moveZ = this.gamepad.axes[1];
                if (Math.abs(moveX) > 0.1 || Math.abs(moveZ) > 0.1) {
                    this.currentPlayer.move(-moveX, moveZ); // Removed negative from moveZ
                    // Send position update to server
                    this.socket.emit('playerMove', {
                        position: this.currentPlayer.mesh.position,
                        velocity: this.currentPlayer.velocity
                    });
                }
                
                // Right stick for camera control in first-person view
                if (this.currentView === 'first-person') {
                    const lookX = this.gamepad.axes[2];
                    const lookZ = this.gamepad.axes[3];
                    if (Math.abs(lookX) > 0.1 || Math.abs(lookZ) > 0.1) {
                        this.currentPlayer.direction.x = lookX;
                        this.currentPlayer.direction.z = lookZ;
                    }
                }
                
                // Buttons
                if (this.gamepad.buttons[0].pressed) { // A button
                    this.cycleView();
                }
            }
        }
        
        // Update snowmen (only visual updates, position is synced from server)
        this.snowmen.forEach(snowman => {
            // Only update visual elements, not position
            if (Date.now() > snowman.nextFireTime) {
                snowman.fireLaser();
                snowman.lastFireTime = Date.now();
                snowman.nextFireTime = snowman.getNextFireTime();
            }
        });
        
        // Update lasers
        this.lasers = this.lasers.filter(laser => {
            laser.update();
            return !laser.isDead;
        });
        
        // Update players
        this.players.forEach(player => {
            // Update player state (including invulnerability and survival time)
            player.update();
            
            if (player === this.currentPlayer && !player.isDead) {
                // Handle keyboard input for current player
                if (!this.isMobile && !this.gamepad) {
                    let steering = 0;
                    let throttle = 0;
                    
                    // Steering (left/right) - fixed direction
                    if (this.keys['ArrowLeft']) steering -= 1;  // Changed back to -= for correct direction
                    if (this.keys['ArrowRight']) steering += 1; // Changed back to += for correct direction
                    
                    // Throttle (forward/backward)
                    if (this.keys['ArrowUp']) throttle += 1;
                    if (this.keys['ArrowDown']) throttle -= 1;
                    
                    if (steering !== 0 || throttle !== 0) {
                        console.log('Moving player:', steering, throttle);
                        player.move(steering, throttle);
                        // Send position update to server
                        this.socket.emit('playerMove', {
                            position: player.mesh.position,
                            velocity: player.velocity
                        });
                    }
                }
            }
            
            // Check for laser hits
            this.lasers.forEach(laser => {
                if (player.checkLaserHit(laser)) {
                    player.die();
                }
            });
        });
        
        // Update camera if in first-person view
        if (this.currentView === 'first-person') {
            this.updateCameraView();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    updateStats() {
        if (this.currentPlayer && !this.currentPlayer.isDead) {
            const survivalTime = (Date.now() - this.startTime) / 1000;
            const minutes = Math.floor(survivalTime / 60);
            const seconds = Math.floor(survivalTime % 60);
            const tenths = Math.floor((survivalTime % 1) * 10);
            document.getElementById('survivalTime').textContent = 
                `Survival time: ${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}s`;
        }
        requestAnimationFrame(() => this.updateStats());
    }
    
    startNewRound() {
        // Show countdown screen
        document.getElementById('countdownScreen').style.display = 'block';
        document.getElementById('countdown').textContent = '3';
        document.getElementById('controls').style.display = 'block';
        
        // Start countdown
        let count = 3;
        const countdownElement = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
            count--;
            countdownElement.textContent = count;
            if (count <= 0) {
                clearInterval(countdownInterval);
                document.getElementById('countdownScreen').style.display = 'none';
                
                // Reset all players
                this.players.forEach(player => {
                    player.isDead = false;
                    player.baseCube.material.color.set(PLAYER_COLORS[parseInt(player.id) % 10] || 0xFFFFFF);
                    player.topCube.material.color.set(PLAYER_COLORS[parseInt(player.id) % 10] || 0xFFFFFF);
                    player.mesh.position.set(0, 0, 0);
                    player.velocity.set(0, 0, 0);
                    player.startInvulnerability();
                });
                
                // Reset game timer
                this.startTime = Date.now();
                this.updateStats();
                
                // Notify server that round is starting
                this.socket.emit('roundStart');
            }
        }, 1000);
    }
    
    setupEventListeners() {
        console.log('Setting up event listeners...');
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Add click/tap listener for first interaction
        const startInteraction = (event) => {
            event.preventDefault();
            console.log('User interaction detected');
            this.hasUserInteracted = true;
            
            // Hide loading screen
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
            
            // Remove the listeners after first interaction
            document.removeEventListener('click', startInteraction);
            document.removeEventListener('touchstart', startInteraction);
        };
        
        // Add both click and touchstart listeners
        document.addEventListener('click', startInteraction);
        document.addEventListener('touchstart', startInteraction, { passive: false });
        
        // Setup keyboard controls
        document.addEventListener('keydown', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = true;
                console.log('Key pressed:', e.key, this.keys);
            }
            if (e.key === 'v' || e.key === 'V') {
                this.cycleView();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (this.keys.hasOwnProperty(e.key)) {
                this.keys[e.key] = false;
                console.log('Key released:', e.key, this.keys);
            }
        });
        
        if (this.isMobile) {
            document.getElementById('viewButton').addEventListener('click', () => this.cycleView());
        }
        console.log('Event listeners setup complete');
    }

    checkAllSpectators() {
        if (this.players.size > 0) {
            let allDead = true;
            for (const player of this.players.values()) {
                if (!player.isDead) {
                    allDead = false;
                    break;
                }
            }
            if (allDead) {
                console.log('All players are in spectator mode, initiating countdown');
                this.startNewRound();
            }
        }
    }
}

class Player {
    constructor(scene, id, socket) {
        this.scene = scene;
        this.id = id;
        this.socket = socket;
        this.mesh = new THREE.Group();
        
        // Create base cube (larger)
        const baseGeometry = new THREE.BoxGeometry(PLAYER_SIZE * 1.5, PLAYER_SIZE * 1.5, PLAYER_SIZE * 1.5);
        const baseMaterial = new THREE.MeshBasicMaterial({ 
            color: PLAYER_COLORS[parseInt(id) % 10] || 0xFFFFFF 
        });
        this.baseCube = new THREE.Mesh(baseGeometry, baseMaterial);
        this.mesh.add(this.baseCube);
        
        // Create top cube (smaller)
        const topGeometry = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
        const topMaterial = new THREE.MeshBasicMaterial({ 
            color: PLAYER_COLORS[parseInt(id) % 10] || 0xFFFFFF 
        });
        this.topCube = new THREE.Mesh(topGeometry, topMaterial);
        this.topCube.position.y = PLAYER_SIZE * 1.25; // Position on top of base cube
        this.mesh.add(this.topCube);
        
        // Create smiley face on top cube
        this.createSmileyFace();
        
        this.scene.add(this.mesh);
        
        // Car-like physics properties
        this.direction = new THREE.Vector3(0, 0, 1); // Current facing direction
        this.velocity = new THREE.Vector3(0, 0, 0); // Current velocity
        this.speed = 0; // Current speed (magnitude of velocity)
        this.steeringAngle = 0; // Current steering angle
        
        // Physics constants
        this.maxSpeed = 0.3;
        this.acceleration = 0.005;
        this.deceleration = 0.003;
        this.steeringSpeed = 0.2; // Doubled from 0.1 for tighter turns
        this.driftFactor = 0.95;
        this.friction = 0.98;
        
        this.isDead = false;
        this.isInvulnerable = false;
        this.invulnerabilityStartTime = 0;
        this.originalColors = {
            base: PLAYER_COLORS[parseInt(id) % 10] || 0xFFFFFF,
            top: PLAYER_COLORS[parseInt(id) % 10] || 0xFFFFFF
        };
        
        // Add survival time tracking
        this.currentSurvivalTime = 0;
        this.bestSurvivalTime = 0;
        this.lastDeathTime = Date.now();
        
        // Create survival time display
        this.createSurvivalDisplay();
    }
    
    createSmileyFace() {
        // Create eyes (dots)
        const eyeGeometry = new THREE.SphereGeometry(PLAYER_SIZE * 0.1);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        
        leftEye.position.set(-PLAYER_SIZE * 0.2, PLAYER_SIZE * 0.1, PLAYER_SIZE * 0.51);
        rightEye.position.set(PLAYER_SIZE * 0.2, PLAYER_SIZE * 0.1, PLAYER_SIZE * 0.51);
        
        this.topCube.add(leftEye);
        this.topCube.add(rightEye);
        
        // Create smile (curved line)
        const smileGeometry = new THREE.TorusGeometry(PLAYER_SIZE * 0.3, PLAYER_SIZE * 0.05, 8, 16, Math.PI);
        const smileMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const smile = new THREE.Mesh(smileGeometry, smileMaterial);
        
        smile.position.set(0, -PLAYER_SIZE * 0.1, PLAYER_SIZE * 0.51);
        smile.rotation.x = Math.PI / 2;
        
        this.topCube.add(smile);
    }
    
    createSurvivalDisplay() {
        // Create a canvas for the text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;  // Doubled from 256
        canvas.height = 256; // Doubled from 128
        
        // Create sprite from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            opacity: 0.9  // Make it slightly transparent to blend better
        });
        this.survivalSprite = new THREE.Sprite(material);
        this.survivalSprite.position.y = 2.5; // Raised slightly higher
        this.survivalSprite.scale.set(4, 2, 1); // Doubled the scale
        this.mesh.add(this.survivalSprite);
        
        // Store canvas and context for updates
        this.survivalCanvas = canvas;
        this.survivalContext = context;
    }
    
    updateSurvivalDisplay() {
        if (!this.survivalContext) return;
        
        const ctx = this.survivalContext;
        const canvas = this.survivalCanvas;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Add text shadow for better visibility
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        // Set text style
        ctx.fillStyle = '#000000'; // Pure black for maximum contrast
        ctx.font = 'bold 48px Arial'; // Doubled font size and made it bold
        ctx.textAlign = 'center';
        
        // Format times
        const formatTime = (ms) => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        };
        
        // Draw current survival time
        ctx.fillText(`Current: ${formatTime(this.currentSurvivalTime)}`, canvas.width/2, 80);
        
        // Draw best survival time
        ctx.fillText(`Best: ${formatTime(this.bestSurvivalTime)}`, canvas.width/2, 160);
        
        // Update texture
        this.survivalSprite.material.map.needsUpdate = true;
    }
    
    move(steering, throttle) {
        if (this.isDead) return;
        
        console.log('Player.move called with:', steering, throttle); // Debug log
        
        // Update steering angle (removed negative sign to fix direction)
        this.steeringAngle = steering * this.steeringSpeed;
        
        // Rotate direction based on steering
        const rotationMatrix = new THREE.Matrix4().makeRotationY(this.steeringAngle);
        this.direction.applyMatrix4(rotationMatrix);
        this.direction.normalize();
        
        // Update speed based on throttle
        if (throttle > 0) {
            // Forward movement in the direction we're facing
            this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
        } else if (throttle < 0) {
            // Backward movement opposite to the direction we're facing
            this.speed = Math.max(this.speed - this.acceleration, -this.maxSpeed * 0.5); // Reverse is slower
            // Invert direction for backward movement
            this.direction.x *= -1;
            this.direction.z *= -1;
        } else {
            // Apply deceleration when no throttle
            if (Math.abs(this.speed) > this.deceleration) {
                this.speed -= Math.sign(this.speed) * this.deceleration;
            } else {
                this.speed = 0;
            }
        }
        
        // Calculate new velocity based on direction and speed
        this.velocity.copy(this.direction).multiplyScalar(this.speed);
        
        // Apply drift (velocity perpendicular to direction)
        const drift = new THREE.Vector3(
            this.velocity.x - this.direction.x * this.velocity.dot(this.direction),
            this.velocity.y,
            this.velocity.z - this.direction.z * this.velocity.dot(this.direction)
        );
        drift.multiplyScalar(this.driftFactor);
        
        // Combine drift with directional velocity
        this.velocity.x = this.direction.x * this.velocity.dot(this.direction) + drift.x;
        this.velocity.z = this.direction.z * this.velocity.dot(this.direction) + drift.z;
        
        // Apply friction
        this.velocity.x *= this.friction;
        this.velocity.z *= this.friction;
        
        // Update position based on velocity
        this.mesh.position.x += this.velocity.x;
        this.mesh.position.z += this.velocity.z;
        
        // Rotate the top cube to face the direction of movement
        this.topCube.rotation.y = Math.atan2(this.direction.x, this.direction.z);
        
        console.log('New velocity:', this.velocity); // Debug log
        console.log('New position:', this.mesh.position); // Debug log
        
        // Keep player within arena bounds with bounce effect
        if (Math.abs(this.mesh.position.x) > ARENA_SIZE/2 - PLAYER_SIZE) {
            this.mesh.position.x = Math.sign(this.mesh.position.x) * (ARENA_SIZE/2 - PLAYER_SIZE);
            this.velocity.x *= -0.5;
            this.speed *= 0.5; // Reduce speed on wall collision
        }
        if (Math.abs(this.mesh.position.z) > ARENA_SIZE/2 - PLAYER_SIZE) {
            this.mesh.position.z = Math.sign(this.mesh.position.z) * (ARENA_SIZE/2 - PLAYER_SIZE);
            this.velocity.z *= -0.5;
            this.speed *= 0.5; // Reduce speed on wall collision
        }
    }
    
    updatePosition(position) {
        this.mesh.position.copy(position);
    }
    
    update() {
        // Update survival time
        if (!this.isDead) {
            this.currentSurvivalTime = Date.now() - this.lastDeathTime;
            if (this.currentSurvivalTime > this.bestSurvivalTime) {
                this.bestSurvivalTime = this.currentSurvivalTime;
            }
        }
        
        // Update survival display
        this.updateSurvivalDisplay();
        
        // Handle invulnerability flashing
        if (this.isInvulnerable) {
            const timeSinceStart = Date.now() - this.invulnerabilityStartTime;
            if (timeSinceStart >= 1200) { // 1.2 seconds
                this.isInvulnerable = false;
                this.baseCube.material.color.set(this.originalColors.base);
                this.topCube.material.color.set(this.originalColors.top);
            } else {
                // Flash between original color and white
                const flashRate = 100; // Flash every 100ms
                const shouldFlash = Math.floor(timeSinceStart / flashRate) % 2 === 0;
                const color = shouldFlash ? 0xFFFFFF : this.originalColors.base;
                this.baseCube.material.color.set(color);
                this.topCube.material.color.set(color);
            }
        }
    }

    startInvulnerability() {
        console.log('Starting invulnerability for player:', this.id);
        this.isInvulnerable = true;
        this.invulnerabilityStartTime = Date.now();
        this.originalColors = {
            base: this.baseCube.material.color.getHex(),
            top: this.topCube.material.color.getHex()
        };
    }

    checkLaserHit(laser) {
        if (this.isInvulnerable) {
            console.log('Player is invulnerable, ignoring laser hit');
            return false;
        }
        return this.mesh.position.distanceTo(laser.mesh.position) < PLAYER_SIZE + laser.size;
    }
    
    die() {
        if (!this.isDead && !this.isInvulnerable) {
            console.log('Player died:', this.id);
            this.isDead = true;
            this.baseCube.material.color.set(0x808080);
            this.topCube.material.color.set(0x808080);
            
            // Only emit if this is the current player
            if (this.socket && this.id === this.socket.id) {
                this.socket.emit('playerDied');
            }
            
            // Respawn after a short delay
            setTimeout(() => this.respawn(), 1000);
        }
    }
    
    respawn() {
        console.log('Respawning player:', this.id);
        
        // Show countdown screen
        document.getElementById('countdownScreen').style.display = 'block';
        document.getElementById('countdown').textContent = '3';
        
        // Start countdown
        let count = 3;
        const countdownElement = document.getElementById('countdown');
        const countdownInterval = setInterval(() => {
            count--;
            countdownElement.textContent = count;
            if (count <= 0) {
                clearInterval(countdownInterval);
                document.getElementById('countdownScreen').style.display = 'none';
                
                // Actually respawn the player after countdown
                this.isDead = false;
                this.lastDeathTime = Date.now();
                this.currentSurvivalTime = 0;
                this.mesh.position.set(0, 0, 0);
                this.velocity.set(0, 0, 0);
                this.speed = 0; // Reset speed
                this.baseCube.material.color.set(this.originalColors.base);
                this.topCube.material.color.set(this.originalColors.top);
                this.startInvulnerability();
                
                // Notify server of respawn
                if (this.socket && this.id === this.socket.id) {
                    this.socket.emit('playerRespawn', {
                        position: this.mesh.position,
                        velocity: this.velocity
                    });
                }
            }
        }, 1000);
    }
    
    remove() {
        this.scene.remove(this.mesh);
    }
}

class Snowman {
    constructor(scene, color, game) {
        this.scene = scene;
        this.color = color;
        this.game = game;
        this.mesh = new THREE.Group();
        
        // Create three stacked dodecahedrons
        for (let i = 0; i < 3; i++) {
            const size = SNOWMAN_SIZE * (1 - i * 0.2);
            const geometry = new THREE.DodecahedronGeometry(size);
            const material = new THREE.MeshBasicMaterial({ color: this.color });
            const part = new THREE.Mesh(geometry, material);
            part.position.y = i * size * 1.5;
            this.mesh.add(part);
        }
        
        // Add eyes and nose to the top dodecahedron
        const eyeGeometry = new THREE.SphereGeometry(0.1);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const noseGeometry = new THREE.ConeGeometry(0.1, 0.2);
        const noseMaterial = new THREE.MeshBasicMaterial({ color: 0xFFA500 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        
        // Position eyes and nose on the top dodecahedron
        const topSize = SNOWMAN_SIZE * (1 - 2 * 0.2); // Size of top dodecahedron
        const topY = 2 * SNOWMAN_SIZE * 1.5; // Y position of top dodecahedron
        
        leftEye.position.set(-0.2, topY, topSize * 0.8);
        rightEye.position.set(0.2, topY, topSize * 0.8);
        nose.position.set(0, topY - 0.1, topSize * 0.8);
        nose.rotation.x = -Math.PI / 2;
        
        this.mesh.add(leftEye, rightEye, nose);
        
        this.scene.add(this.mesh);
        
        this.lastFireTime = 0;
        this.nextFireTime = this.getNextFireTime();
    }
    
    getNextFireTime() {
        return Date.now() + Math.random() * (SNOWMAN_FIRE_INTERVAL.max - SNOWMAN_FIRE_INTERVAL.min) + SNOWMAN_FIRE_INTERVAL.min;
    }
    
    fireLaser() {
        // Create pink flash
        const flashGeometry = new THREE.SphereGeometry(SNOWMAN_SIZE * 0.5);
        const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xFF69B4 });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.copy(this.mesh.position);
        this.scene.add(flash);
        
        // Remove flash after 100ms
        setTimeout(() => this.scene.remove(flash), 100);
        
        // Create laser
        const laser = new Laser(this.scene, this.mesh.position.clone());
        this.game.lasers.push(laser);
        
        // Play laser sound
        this.game.laserSound.currentTime = 0;
        this.game.laserSound.play().catch(error => {
            console.log('Laser sound play failed:', error);
        });
    }
}

class Laser {
    constructor(scene, position) {
        this.scene = scene;
        this.size = LASER_INITIAL_SIZE;
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(this.size),
            new THREE.MeshBasicMaterial({ color: LASER_COLOR })
        );
        this.mesh.position.copy(position);
        this.scene.add(this.mesh);
        this.birthTime = Date.now();
        this.isDead = false;
        
        // Add velocity for movement (doubled speed)
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.6, // Doubled from 0.3
            0,
            (Math.random() - 0.5) * 0.6  // Doubled from 0.3
        );
    }
    
    update() {
        const age = Date.now() - this.birthTime;
        if (age > LASER_DURATION) {
            this.isDead = true;
            this.scene.remove(this.mesh);
            return;
        }
        
        // Move laser based on velocity
        this.mesh.position.add(this.velocity);
        
        // Bounce off walls
        if (Math.abs(this.mesh.position.x) > ARENA_SIZE/2 - this.size) {
            this.mesh.position.x = Math.sign(this.mesh.position.x) * (ARENA_SIZE/2 - this.size);
            this.velocity.x *= -1;
        }
        if (Math.abs(this.mesh.position.z) > ARENA_SIZE/2 - this.size) {
            this.mesh.position.z = Math.sign(this.mesh.position.z) * (ARENA_SIZE/2 - this.size);
            this.velocity.z *= -1;
        }
        
        // Shrink laser
        this.size = LASER_INITIAL_SIZE * (1 - age / LASER_DURATION);
        this.mesh.scale.set(this.size, this.size, this.size);
    }
}

// Initialize game when window loads
window.addEventListener('load', () => {
    console.log('Window loaded, initializing game...');
    try {
        const game = new Game();
        console.log('Game initialized successfully');
        
        // Force hide loading screen after a short delay if it's still showing
        setTimeout(() => {
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen && loadingScreen.style.display !== 'none') {
                console.log('Force hiding loading screen');
                loadingScreen.style.display = 'none';
            }
        }, 2000);
    } catch (error) {
        console.error('Error initializing game:', error);
        // Show error message to user
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.innerHTML = 'Error loading game. Please refresh the page.';
        }
    }
}); 