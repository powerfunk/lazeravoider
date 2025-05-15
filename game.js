// Debug logging setup
console.log('SCRIPT STARTING');
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Error: ' + msg + '\nURL: ' + url + '\nLine: ' + lineNo + '\nColumn: ' + columnNo + '\nError object: ' + JSON.stringify(error));
    return false;
};

console.log('START OF GAME.JS');
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import './lib/nipplejs.min.js';  // Just import the script, don't try to use it as a module

// Constants
const ARENA_SIZE = 27;
const SNOWMAN_COLORS = [0x800080, 0x0000FF, 0x00FF00]; // Purple, Blue, Green
const LASER_COLOR = 0xFF69B4; // Pink
const SNOWMAN_SIZE = 1;
const PLAYER_SIZE = 0.5;
const LASER_INITIAL_SIZE = 0.84; // Increased from 0.67 to 0.84 (25% increase)
const LASER_DURATION = 2500; // Changed from 2000 to 2500 (2.5 seconds)
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
        
        // Initialize core components first
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Optimize renderer setup
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: document.getElementById('gameCanvas'),
            antialias: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Initialize properties
        this.players = new Map();
        this.snowmen = [];
        this.lasers = [];
        
        // Chat properties
        this.chatInput = document.getElementById('chatInput');
        this.chatMessages = document.getElementById('chatMessages');
        this.isChatting = false;
        
        // More accurate mobile detection
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
        const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.innerWidth <= 768;
        
        this.isMobile = isMobileDevice && (hasTouchScreen || isSmallScreen);
        console.log('Mobile detection:', {
            userAgent: userAgent,
            isMobileDevice: isMobileDevice,
            hasTouchScreen: hasTouchScreen,
            isSmallScreen: isSmallScreen,
            finalIsMobile: this.isMobile
        });
        
        // Hide mobile controls on desktop
        if (!this.isMobile) {
            const mobileControls = document.getElementById('mobileControls');
            const mobileButtons = document.getElementById('mobileButtons');
            if (mobileControls) {
                mobileControls.style.display = 'none';
                mobileControls.style.visibility = 'hidden';
            }
            if (mobileButtons) {
                mobileButtons.style.display = 'none';
                mobileButtons.style.visibility = 'hidden';
            }
        }
        
        this.currentView = 'top';
        this.hasUserInteracted = false;
        this.gameStarted = false;
        this.isMuted = false;
        
        // Initialize laser sound with preload
        this.laserSound = new Audio('laser.mp3');
        this.laserSound.preload = 'auto';
        this.laserSound.load();
        
        // Initialize controls
        this.gamepad = null;
        this.gamepadIndex = null;
        
        // Initialize keyboard state
        this.keys = {
            'ArrowUp': false,
            'ArrowDown': false,
            'ArrowLeft': false,
            'ArrowRight': false
        };
        
        // Setup everything synchronously for faster initial load
        this.setupScene();
        this.setupControls();
        this.setupEventListeners();
        this.setupSocket();
        this.setupGamepad();
        
        // Start game loop
        console.log('Starting game loop...');
        this.animate();
        window.game = this;
        
        console.log('Game initialization complete');
    }
    
    setupScene() {
        console.log('Setting up scene...');
        
        // Set background color immediately
        this.scene.background = new THREE.Color(0x87CEEB);
        
        // Create floor with basic material first
        const floorGeometry = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
        const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        
        // Load floor texture synchronously
        const floorTexture = new THREE.TextureLoader().load('floor.jpg');
        floorMaterial.map = floorTexture;
        floorMaterial.needsUpdate = true;
        
        // Create walls with basic material first
        const wallGeometry = new THREE.BoxGeometry(ARENA_SIZE, 5, 0.1);
        const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x808080 });
        
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
        
        // Load wall texture synchronously
        const wallTexture = new THREE.TextureLoader().load('wall.jpg');
        wallMaterial.map = wallTexture;
        wallMaterial.needsUpdate = true;
        
        // Create snowmen
        for (let i = 0; i < 3; i++) {
            this.snowmen.push(new Snowman(this.scene, SNOWMAN_COLORS[i], this));
        }
        
        // Set initial camera position
        this.updateCameraView();
        
        console.log('Scene setup complete');
    }
    
    setupControls() {
        console.log('Setting up controls, isMobile:', this.isMobile);
        
        // Get mobile control elements
        const mobileControls = document.getElementById('mobileControls');
        const mobileButtons = document.getElementById('mobileButtons');
        const directionalButtons = document.getElementById('directionalButtons');
        const upButton = document.getElementById('upButton');
        const downButton = document.getElementById('downButton');
        const leftButton = document.getElementById('leftButton');
        const rightButton = document.getElementById('rightButton');
        const viewButton = document.getElementById('viewButton');
        const muteButton = document.getElementById('muteButton');
        
        if (this.isMobile) {
            console.log('Setting up mobile controls');
            
            // Show mobile controls
            if (mobileControls) {
                mobileControls.style.display = 'block';
                mobileControls.style.visibility = 'visible';
                mobileControls.style.pointerEvents = 'auto';
                console.log('Mobile controls container shown');
            }
            if (mobileButtons) {
                mobileButtons.style.display = 'flex';
                mobileButtons.style.visibility = 'visible';
                mobileButtons.style.pointerEvents = 'auto';
                console.log('Mobile buttons shown');
            }
            if (directionalButtons) {
                directionalButtons.style.display = 'grid';
                directionalButtons.style.visibility = 'visible';
                directionalButtons.style.pointerEvents = 'auto';
                console.log('Directional buttons shown');
            }
            
            // Setup view button
            if (viewButton) {
                viewButton.style.display = 'block';
                viewButton.style.pointerEvents = 'auto';
                viewButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('View button touched');
                    this.cycleView();
                });
                console.log('View button listener added');
            } else {
                console.error('View button not found!');
            }
            
            // Setup mute button
            if (muteButton) {
                muteButton.style.display = 'block';
                muteButton.style.pointerEvents = 'auto';
                muteButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Mute button touched');
                    if (this.laserSound) {
                        this.laserSound.muted = !this.laserSound.muted;
                        muteButton.textContent = this.laserSound.muted ? '🔊' : '🔇';
                    }
                });
                console.log('Mute button listener added');
            } else {
                console.error('Mute button not found!');
            }
            
            // Setup directional buttons to match arrow key behavior
            if (upButton && downButton && leftButton && rightButton) {
                // Track active touches
                let activeTouches = new Set();
                
                // Up button - direct forward movement
                upButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    activeTouches.add('up');
                    if (this.currentPlayer) {
                        this.currentPlayer.move(0, 1);
                    }
                });
                
                upButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    activeTouches.delete('up');
                    if (this.currentPlayer) {
                        this.currentPlayer.move(0, 0);
                    }
                });
                
                // Down button - direct backward movement
                downButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    activeTouches.add('down');
                    if (this.currentPlayer) {
                        this.currentPlayer.move(0, -1);
                    }
                });
                
                downButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    activeTouches.delete('down');
                    if (this.currentPlayer) {
                        this.currentPlayer.move(0, 0);
                    }
                });
                
                // Left button - direct left turn
                leftButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    activeTouches.add('left');
                    if (this.currentPlayer) {
                        this.currentPlayer.move(-1, 0);
                    }
                });
                
                leftButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    activeTouches.delete('left');
                    if (this.currentPlayer) {
                        this.currentPlayer.move(0, 0);
                    }
                });
                
                // Right button - direct right turn
                rightButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    activeTouches.add('right');
                    if (this.currentPlayer) {
                        this.currentPlayer.move(1, 0);
                    }
                });
                
                rightButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    activeTouches.delete('right');
                    if (this.currentPlayer) {
                        this.currentPlayer.move(0, 0);
                    }
                });
                
                console.log('Directional buttons listeners added');
            }
        } else {
            console.log('Setting up keyboard controls');
            this.setupKeyboardControls();
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
            
            // Clean up any existing players for this ID
            if (this.currentPlayer) {
                console.log('Cleaning up existing player:', this.socket.id);
                this.currentPlayer.remove();
                this.players.delete(this.socket.id);
            }
            
            // Create current player with socket reference and proper color
            const playerColor = PLAYER_COLORS[parseInt(this.socket.id) % 10] || 0xFF0000;
            this.currentPlayer = new Player(this.scene, this.socket.id, this.socket, playerColor);
            this.players.set(this.socket.id, this.currentPlayer);
            
            // Request current players immediately after connection
            this.socket.emit('requestCurrentPlayers');
        });
        
        this.socket.on('currentPlayers', (playersData) => {
            console.log('Received current players:', playersData);
            
            // Clean up any players that are no longer in the list
            const currentIds = new Set(playersData.map(([id]) => id));
            for (const [id, player] of this.players.entries()) {
                if (!currentIds.has(id) && id !== this.socket.id) {
                    console.log('Removing disconnected player:', id);
                    player.remove();
                    this.players.delete(id);
                }
            }
            
            // Update or create players
            playersData.forEach(([id, data]) => {
                if (id !== this.socket.id) {  // Don't create duplicate for self
                    let player = this.players.get(id);
                    if (!player) {
                        console.log('Creating new player:', id, data);
                        const playerColor = PLAYER_COLORS[parseInt(id) % 10] || 0xFF0000;
                        player = new Player(this.scene, id, this.socket, playerColor);
                        this.players.set(id, player);
                    }
                    // Always update position and state
                    player.updatePosition(data.position);
                    player.isDead = data.isDead;
                    if (player.isDead) {
                        player.prism.material.color.set(0x808080);
                    } else {
                        player.prism.material.color.set(playerColor);
                    }
                }
            });
        });
        
        this.socket.on('playerJoined', (playerData) => {
            console.log('Player joined:', playerData);
            if (this.players.size < 10) {
                const playerColor = PLAYER_COLORS[parseInt(playerData.id) % 10] || 0xFF0000;
                const player = new Player(this.scene, playerData.id, this.socket, playerColor);
                this.players.set(playerData.id, player);
                player.isDead = playerData.isDead;
                if (player.isDead) {
                    player.prism.material.color.set(0x808080);
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
                    this.snowmen[index].updateFromServer(
                        new THREE.Vector3(
                            snowmanData.position.x,
                            snowmanData.position.y,
                            snowmanData.position.z
                        ),
                        new THREE.Vector3(
                            snowmanData.velocity.x,
                            snowmanData.velocity.y,
                            snowmanData.velocity.z
                        )
                    );
                }
            });
        });

        // Add chat message handler
        this.socket.on('chatMessage', (data) => {
            this.addChatMessage(data.playerId, data.message, data.playerName);
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
                    this.currentPlayer.move(-moveX, moveZ);
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
        
        // Update snowmen with client-side movement
        this.snowmen.forEach(snowman => {
            snowman.update();
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
                    
                    // Steering (left/right)
                    if (this.keys['ArrowLeft']) steering -= 1;
                    if (this.keys['ArrowRight']) steering += 1;
                    
                    // Throttle (forward/backward)
                    if (this.keys['ArrowUp']) throttle += 1;
                    if (this.keys['ArrowDown']) throttle -= 1;
                    
                    if (steering !== 0 || throttle !== 0) {
                        console.log('Moving player:', { steering, throttle, keys: this.keys });
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
                    player.prism.material.color.set(PLAYER_COLORS[parseInt(player.id) % 10] || 0xFFFFFF);
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
        
        // Prevent default touch behaviors
        const preventDefaultTouch = (e) => {
            e.preventDefault();
        };
        
        // Add touch event listeners to prevent default behaviors
        document.addEventListener('touchstart', preventDefaultTouch, { passive: false });
        document.addEventListener('touchmove', preventDefaultTouch, { passive: false });
        document.addEventListener('touchend', preventDefaultTouch, { passive: false });
        document.addEventListener('touchcancel', preventDefaultTouch, { passive: false });
        
        // Prevent double-tap zoom
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
        
        // Add interaction listener for first interaction
        const startInteraction = (event) => {
            if (this.gameStarted) return;
            
            // Check if name is entered
            const nameInput = document.getElementById('nameInput');
            if (!nameInput.value.trim()) {
                nameInput.focus();
                return;
            }
            
            console.log('Interaction detected:', event.type);
            event.preventDefault();
            this.hasUserInteracted = true;
            this.gameStarted = true;
            
            // Hide loading screen
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                console.log('Hiding loading screen');
                loadingScreen.style.display = 'none';
            } else {
                console.error('Loading screen element not found!');
            }
            
            // Remove the listeners after first interaction
            document.removeEventListener('click', startInteraction);
            document.removeEventListener('touchstart', startInteraction);
            document.removeEventListener('keydown', startInteraction);
        };
        
        // Add click, touch, and keyboard listeners
        document.addEventListener('click', startInteraction);
        document.addEventListener('touchstart', startInteraction, { passive: false });
        document.addEventListener('keydown', startInteraction);
        
        // Setup keyboard controls
        if (!this.isMobile) {
            console.log('Setting up keyboard controls');
            
            // Prevent default arrow key behavior
            document.addEventListener('keydown', (e) => {
                if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    e.preventDefault();
                }
            });
            
            // Handle key presses
            document.addEventListener('keydown', (e) => {
                if (!this.gameStarted) return;
                
                // Chat handling
                if (e.key === 'Enter') {
                    if (!this.isChatting) {
                        // Start chatting
                        this.isChatting = true;
                        this.chatInput.style.display = 'block';
                        this.chatInput.focus();
                        // Disable movement while chatting
                        this.keys = {
                            'ArrowUp': false,
                            'ArrowDown': false,
                            'ArrowLeft': false,
                            'ArrowRight': false
                        };
                    } else {
                        // Send message
                        const message = this.chatInput.value.trim();
                        if (message) {
                            console.log('Sending chat message:', message);
                            this.socket.emit('chatMessage', {
                                message: message,
                                playerId: this.socket.id,
                                playerName: this.currentPlayer.playerName
                            });
                        }
                        this.chatInput.value = '';
                        this.chatInput.style.display = 'none';
                        this.isChatting = false;
                    }
                    e.preventDefault();
                    return;
                }
                
                // Escape key to cancel chat
                if (e.key === 'Escape' && this.isChatting) {
                    this.chatInput.value = '';
                    this.chatInput.style.display = 'none';
                    this.isChatting = false;
                    e.preventDefault();
                    return;
                }
                
                // Don't process other keys while chatting
                if (this.isChatting) return;
                
                if (this.keys.hasOwnProperty(e.key)) {
                    this.keys[e.key] = true;
                    console.log('Key pressed:', e.key, this.keys);
                }
                if (e.key === 'v' || e.key === 'V') {
                    this.cycleView();
                }
                if (e.key === 'm' || e.key === 'M') {
                    this.isMuted = !this.isMuted;
                    this.laserSound.muted = this.isMuted;
                    console.log('Laser sound muted:', this.isMuted);
                }
            });
            
            document.addEventListener('keyup', (e) => {
                if (!this.gameStarted || this.isChatting) return;
                if (this.keys.hasOwnProperty(e.key)) {
                    this.keys[e.key] = false;
                    console.log('Key released:', e.key, this.keys);
                }
            });
        }
        
        if (this.isMobile) {
            const viewButton = document.getElementById('viewButton');
            const muteButton = document.getElementById('muteButton');
            const chatButton = document.getElementById('chatButton');
            
            if (viewButton) {
                viewButton.addEventListener('click', () => this.cycleView());
                console.log('View button listener added');
            } else {
                console.error('View button not found!');
            }
            
            if (muteButton) {
                muteButton.addEventListener('click', () => {
                    this.isMuted = !this.isMuted;
                    this.laserSound.muted = this.isMuted;
                    muteButton.textContent = this.isMuted ? '🔊' : '🔇';
                    console.log('Laser sound muted:', this.isMuted);
                });
                console.log('Mute button listener added');
            } else {
                console.error('Mute button not found!');
            }

            if (chatButton) {
                chatButton.addEventListener('click', () => {
                    if (!this.isChatting) {
                        // Start chatting
                        this.isChatting = true;
                        this.chatInput.style.display = 'block';
                        this.chatInput.focus();
                        // Disable movement while chatting
                        this.keys = {
                            'ArrowUp': false,
                            'ArrowDown': false,
                            'ArrowLeft': false,
                            'ArrowRight': false
                        };
                    }
                });
                console.log('Chat button listener added');
            } else {
                console.error('Chat button not found!');
            }
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

    addChatMessage(playerId, message, playerName) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chatMessage';
        
        // Get player color
        const playerColor = PLAYER_COLORS[parseInt(playerId) % 10] || 0xFF0000;
        const colorHex = '#' + playerColor.toString(16).padStart(6, '0');
        
        // Format message with player name and color
        messageDiv.innerHTML = `<span style="color: ${colorHex}">${playerName}:</span> ${message}`;
        
        // Add to chat container
        this.chatMessages.appendChild(messageDiv);
        
        // Auto-scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        
        // Remove message after 20 seconds
        setTimeout(() => {
            messageDiv.classList.add('fade');
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 500);
        }, 20000);
    }
}

class Player {
    constructor(scene, id, socket, color) {
        console.log('Creating new player with ID:', id);
        this.scene = scene;
        this.id = id;
        this.socket = socket;
        this.mesh = new THREE.Group();
        
        // Get player name from input
        const nameInput = document.getElementById('nameInput');
        this.playerName = nameInput.value.trim() || 'Player' + id.slice(0, 4);
        
        // Create triangular prism for player
        const baseWidth = PLAYER_SIZE * 1.6;  // Width of triangle base (reduced by 20%)
        const height = SNOWMAN_SIZE * 1.2;    // Height of prism (reduced by 20%)
        const depth = PLAYER_SIZE * 1.6;      // Length of prism (reduced by 20%)

        // Create the triangular shape
        const shape = new THREE.Shape();
        shape.moveTo(-baseWidth/2, 0);      // Start at bottom left
        shape.lineTo(baseWidth/2, 0);       // Line to bottom right
        shape.lineTo(0, height);            // Line to top point
        shape.lineTo(-baseWidth/2, 0);      // Back to start

        // Create geometry from shape
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: depth,
            bevelEnabled: false
        });

        // Rotate geometry to point forward and rotate 90 degrees left
        geometry.rotateX(-Math.PI / 2);
        geometry.rotateY(Math.PI);  // Changed from Math.PI/2 to Math.PI to rotate 90 degrees left

        const material = new THREE.MeshBasicMaterial({ 
            color: color || PLAYER_COLORS[parseInt(id) % 10] || 0xFF0000 
        });
        
        this.prism = new THREE.Mesh(geometry, material);
        
        // Position prism so its center is at the player's position
        this.prism.position.z = PLAYER_SIZE; // Move forward by half its depth
        this.mesh.add(this.prism);
        
        // Make sure we don't add duplicate meshes
        if (this.mesh.parent) {
            console.log('Removing existing mesh from scene');
            this.scene.remove(this.mesh);
        }
        this.scene.add(this.mesh);
        
        // Movement properties
        this.direction = new THREE.Vector3(0, 0, 1); // Current facing direction
        this.velocity = new THREE.Vector3(0, 0, 0); // Current velocity
        this.speed = 0; // Current speed
        
        // Movement constants - JOHNHOUSE CONFIGURATION
        this.maxSpeed = 0.24;
        this.turnSpeed = 0.1;
        this.acceleration = 0.16; // Aggressive acceleration
        this.deceleration = 0.08; // Gentler deceleration for slight glide
        this.momentum = 0.985; // Increased from 0.98 to 0.985 for slightly more glide
        
        this.isDead = false;
        this.isInvulnerable = false;
        this.invulnerabilityStartTime = 0;
        this.originalColors = {
            prism: color || PLAYER_COLORS[parseInt(id) % 10] || 0xFF0000
        };
        
        // Add survival time tracking
        this.currentSurvivalTime = 0;
        this.bestSurvivalTime = 0;
        this.lastDeathTime = Date.now();
        
        // Create survival time display
        this.createSurvivalDisplay();
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
        this.survivalSprite.position.y = 3.5; // Raised higher to make room for name
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
        
        // Set text style for outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 8;
        ctx.lineJoin = 'round';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        
        // Format times
        const formatTime = (ms) => {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        };
        
        // Draw player name
        ctx.font = 'bold 36px Arial';
        ctx.strokeText(this.playerName, canvas.width/2, 40);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(this.playerName, canvas.width/2, 40);
        
        // Draw current time with outline
        ctx.font = 'bold 48px Arial';
        const currentTime = formatTime(this.currentSurvivalTime);
        ctx.strokeText(currentTime, canvas.width/2, 100);
        ctx.fillStyle = '#FFFF00'; // Bright yellow
        ctx.fillText(currentTime, canvas.width/2, 100);
        
        // Draw best time with outline
        const bestTime = `Best: ${formatTime(this.bestSurvivalTime)}`;
        ctx.strokeText(bestTime, canvas.width/2, 180);
        ctx.fillStyle = '#FFFF00'; // Bright yellow
        ctx.fillText(bestTime, canvas.width/2, 180);
        
        // Update texture
        this.survivalSprite.material.map.needsUpdate = true;
    }
    
    move(steering, throttle) {
        if (this.isDead) return;
        
        // Direct turning without hooking
        if (steering !== 0) {
            const rotationMatrix = new THREE.Matrix4().makeRotationY(-steering * this.turnSpeed);
            this.direction.applyMatrix4(rotationMatrix);
            this.direction.normalize();
            
            // Update prism rotation to match direction
            this.prism.rotation.y = Math.atan2(this.direction.x, this.direction.z);
        }
        
        // Handle speed with very aggressive acceleration
        if (throttle !== 0) {
            if (throttle > 0) {
                // Forward movement - very quick acceleration
                this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
            } else {
                // Backward movement - very quick deceleration
                this.speed = Math.max(this.speed - this.acceleration, -this.maxSpeed);
            }
        } else {
            // Quick deceleration when no throttle
            if (Math.abs(this.speed) > this.deceleration) {
                this.speed -= Math.sign(this.speed) * this.deceleration;
            } else {
                this.speed = 0;
            }
        }
        
        // Apply momentum only to forward movement
        if (this.speed > 0) {
            this.speed *= this.momentum;
        }
        
        // Calculate velocity based on direction and speed
        this.velocity.copy(this.direction).multiplyScalar(this.speed);
        
        // Update position based on velocity
        this.mesh.position.x += this.velocity.x;
        this.mesh.position.z += this.velocity.z;
        
        // Keep player within arena bounds with bounce effect
        if (Math.abs(this.mesh.position.x) > ARENA_SIZE/2 - PLAYER_SIZE) {
            this.mesh.position.x = Math.sign(this.mesh.position.x) * (ARENA_SIZE/2 - PLAYER_SIZE);
            this.velocity.x *= -0.5;
            this.speed *= 0.5;
        }
        if (Math.abs(this.mesh.position.z) > ARENA_SIZE/2 - PLAYER_SIZE) {
            this.mesh.position.z = Math.sign(this.mesh.position.z) * (ARENA_SIZE/2 - PLAYER_SIZE);
            this.velocity.z *= -0.5;
            this.speed *= 0.5;
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
            if (timeSinceStart >= 2000) { // 2 seconds of invulnerability
                this.isInvulnerable = false;
                this.prism.material.color.set(this.originalColors.prism);
            } else {
                // Flash between original color and white
                const flashRate = 100; // Flash every 100ms
                const shouldFlash = Math.floor(timeSinceStart / flashRate) % 2 === 0;
                const color = shouldFlash ? 0xFFFFFF : this.originalColors.prism;
                this.prism.material.color.set(color);
            }
        }
    }

    startInvulnerability() {
        console.log('Starting invulnerability for player:', this.id);
        this.isInvulnerable = true;
        this.invulnerabilityStartTime = Date.now();
        this.originalColors = {
            prism: this.prism.material.color.getHex()
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
            this.prism.material.color.set(0x808080);
            
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
                this.prism.material.color.set(this.originalColors.prism);
                this.startInvulnerability(); // Start invulnerability period
                
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
        const topY = SNOWMAN_SIZE * 1.5; // Y position of top dodecahedron
        
        // Position nose in middle of top dodecahedron
        nose.position.set(0, topY, topSize * 0.8);
        nose.rotation.x = -Math.PI / 2;
        
        // Position eyes in middle of top dodecahedron
        leftEye.position.set(-0.2, topY, topSize * 0.6);
        rightEye.position.set(0.2, topY, topSize * 0.6);
        
        this.mesh.add(leftEye, rightEye, nose);
        
        // Raise the entire snowman so bottom touches floor
        const bottomSize = SNOWMAN_SIZE; // Size of bottom dodecahedron
        this.mesh.position.y = bottomSize; // Offset by the radius of bottom dodecahedron
        
        this.scene.add(this.mesh);
        
        this.lastFireTime = 0;
        this.nextFireTime = this.getNextFireTime();
        
        // Add velocity for movement - reduced by 30% from previous speed
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 7.875, // Reduced from 11.25 to 7.875 (30% reduction)
            0,
            (Math.random() - 0.5) * 7.875  // Reduced from 11.25 to 7.875 (30% reduction)
        );
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
        flash.position.y = 2.5; // Position flash at wall midpoint
        this.scene.add(flash);
        
        // Remove flash after 100ms
        setTimeout(() => this.scene.remove(flash), 100);
        
        // Create laser
        const laser = new Laser(this.scene, this.mesh.position.clone());
        laser.mesh.position.y = 2.5; // Position laser at wall midpoint
        
        // Add explosion effect for fastest lasers (when velocity magnitude is high)
        if (laser.velocity.length() > 40) { // If laser speed is above 40
            // Create explosion particles
            const particleCount = 8;
            const particles = [];
            
            for (let i = 0; i < particleCount; i++) {
                const particleGeometry = new THREE.SphereGeometry(0.2);
                const particleMaterial = new THREE.MeshBasicMaterial({ 
                    color: 0xFF69B4,
                    transparent: true,
                    opacity: 0.8
                });
                const particle = new THREE.Mesh(particleGeometry, particleMaterial);
                
                // Position at snowman's midsection
                const midY = SNOWMAN_SIZE * 1.5; // Middle dodecahedron position
                particle.position.set(
                    this.mesh.position.x,
                    this.mesh.position.y + midY,
                    this.mesh.position.z
                );
                
                // Random direction for particles
                const angle = (i / particleCount) * Math.PI * 2;
                const radius = 0.5;
                particle.velocity = new THREE.Vector3(
                    Math.cos(angle) * radius,
                    Math.random() * 0.5,
                    Math.sin(angle) * radius
                );
                
                this.scene.add(particle);
                particles.push(particle);
            }
            
            // Animate particles
            const startTime = Date.now();
            const animateParticles = () => {
                const elapsed = Date.now() - startTime;
                if (elapsed > 500) { // Remove after 500ms
                    particles.forEach(p => this.scene.remove(p));
                    return;
                }
                
                const progress = elapsed / 500;
                particles.forEach(particle => {
                    particle.position.add(particle.velocity);
                    particle.scale.multiplyScalar(0.95);
                    particle.material.opacity = 0.8 * (1 - progress);
                });
                
                requestAnimationFrame(animateParticles);
            };
            
            animateParticles();
        }
        
        this.game.lasers.push(laser);
        
        // Play laser sound
        this.game.laserSound.currentTime = 0;
        this.game.laserSound.play().catch(error => {
            console.log('Laser sound play failed:', error);
        });
    }
    
    update() {
        const currentTime = Date.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = currentTime;
        
        // Update position based on velocity
        this.mesh.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Keep within bounds
        if (Math.abs(this.mesh.position.x) > ARENA_SIZE/2 - SNOWMAN_SIZE) {
            this.mesh.position.x = Math.sign(this.mesh.position.x) * (ARENA_SIZE/2 - SNOWMAN_SIZE);
            this.velocity.x *= -1;
        }
        if (Math.abs(this.mesh.position.z) > ARENA_SIZE/2 - SNOWMAN_SIZE) {
            this.mesh.position.z = Math.sign(this.mesh.position.z) * (ARENA_SIZE/2 - SNOWMAN_SIZE);
            this.velocity.z *= -1;
        }
        
        // Fire laser if it's time
        if (Date.now() > this.nextFireTime) {
            this.fireLaser();
            this.lastFireTime = Date.now();
            this.nextFireTime = this.getNextFireTime();
        }
    }
    
    updateFromServer(position, velocity) {
        this.mesh.position.copy(position);
        this.velocity.copy(velocity);
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
        this.mesh.position.y = 2.5; // Position laser at wall midpoint
        this.scene.add(this.mesh);
        this.birthTime = Date.now();
        this.isDead = false;
        
        // Add velocity for movement - tripled from previous speed
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 43.2, // Tripled from 14.4 to 43.2
            0,
            (Math.random() - 0.5) * 43.2  // Tripled from 14.4 to 43.2
        );
        
        // Add interpolation properties
        this.targetPosition = new THREE.Vector3().copy(position);
        this.targetVelocity = new THREE.Vector3().copy(this.velocity);
        this.lastUpdateTime = Date.now();
        this.interpolationDelay = 50; // 50ms interpolation delay for faster response
        this.positionHistory = [];
        this.maxHistoryLength = 5; // Shorter history for lasers since they're temporary
    }
    
    update() {
        const currentTime = Date.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = currentTime;
        
        // Update position based on velocity
        this.mesh.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Bounce off walls with proper reflection
        if (Math.abs(this.mesh.position.x) > ARENA_SIZE/2 - this.size) {
            this.mesh.position.x = Math.sign(this.mesh.position.x) * (ARENA_SIZE/2 - this.size);
            this.velocity.x *= -1;
            this.targetVelocity.x *= -1;
        }
        if (Math.abs(this.mesh.position.z) > ARENA_SIZE/2 - this.size) {
            this.mesh.position.z = Math.sign(this.mesh.position.z) * (ARENA_SIZE/2 - this.size);
            this.velocity.z *= -1;
            this.targetVelocity.z *= -1;
        }
        
        // Shrink laser
        const age = currentTime - this.birthTime;
        if (age > LASER_DURATION) {
            this.isDead = true;
            this.scene.remove(this.mesh);
            return;
        }
        
        this.size = LASER_INITIAL_SIZE * (1 - age / LASER_DURATION);
        this.mesh.scale.set(this.size, this.size, this.size);
    }
    
    updateFromServer(position, velocity) {
        // Store current position in history
        this.positionHistory.push({
            position: this.mesh.position.clone(),
            time: Date.now()
        });
        
        // Keep history at reasonable size
        if (this.positionHistory.length > this.maxHistoryLength) {
            this.positionHistory.shift();
        }
        
        // Update target position and velocity
        this.targetPosition.copy(position);
        this.targetVelocity.copy(velocity);
        
        // Smoothly interpolate to target position
        const currentTime = Date.now();
        const targetTime = currentTime - this.interpolationDelay;
        
        // Find the two positions to interpolate between
        let olderPos = null;
        let newerPos = null;
        
        for (let i = this.positionHistory.length - 1; i >= 0; i--) {
            if (this.positionHistory[i].time <= targetTime) {
                olderPos = this.positionHistory[i];
                if (i < this.positionHistory.length - 1) {
                    newerPos = this.positionHistory[i + 1];
                }
                break;
            }
        }
        
        // If we have both positions, interpolate
        if (olderPos && newerPos) {
            const alpha = (targetTime - olderPos.time) / (newerPos.time - olderPos.time);
            this.mesh.position.lerpVectors(olderPos.position, newerPos.position, alpha);
        } else {
            // If we don't have enough history, just use the target position
            this.mesh.position.copy(this.targetPosition);
        }
    }
}

// Initialize game when window loads
window.addEventListener('load', () => {
    console.log('WINDOW LOAD EVENT FIRED');
    try {
        console.log('Checking DOM elements...');
        const gameCanvas = document.getElementById('gameCanvas');
        const loadingScreen = document.getElementById('loadingScreen');
        const mobileControls = document.getElementById('mobileControls');
        const mobileButtons = document.getElementById('mobileButtons');
        const leftJoystick = document.getElementById('leftJoystick');
        const rightJoystick = document.getElementById('rightJoystick');
        
        console.log('DOM elements found:', {
            gameCanvas: !!gameCanvas,
            loadingScreen: !!loadingScreen,
            mobileControls: !!mobileControls,
            mobileButtons: !!mobileButtons,
            leftJoystick: !!leftJoystick,
            rightJoystick: !!rightJoystick
        });

        if (!gameCanvas) {
            throw new Error('Game canvas not found!');
        }

        console.log('Initializing game...');
        const game = new Game();
        console.log('Game initialized successfully');
    } catch (error) {
        console.error('CRITICAL ERROR DURING GAME INITIALIZATION:', error);
        // Show error message to user
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `Error loading game: ${error.message}. Please refresh the page.`;
            loadingScreen.style.display = 'block';
        }
        // Try to show error in page
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'fixed';
        errorDiv.style.top = '50%';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translate(-50%, -50%)';
        errorDiv.style.backgroundColor = 'red';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '20px';
        errorDiv.style.zIndex = '9999';
        errorDiv.textContent = `Game Error: ${error.message}`;
        document.body.appendChild(errorDiv);
    }
}); 