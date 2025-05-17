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
const ARENA_SIZE = 200;
const SNOWMAN_COLORS = [0x800080, 0x0000FF, 0x00FF00]; // Purple, Blue, Green
const LASER_COLOR = 0xFF69B4; // Pink
const SNOWMAN_SIZE = 1;
const PLAYER_SIZE = 0.5;
const LASER_INITIAL_SIZE = 1.0; // Increased from 0.84 to 1.0 for better hit detection
const LASER_DURATION = 2500; // 2.5 seconds
const LASER_SHRINK_RATE = 0.1;
const SNOWMAN_FIRE_INTERVAL = { min: 1500, max: 2500 }; // 1.5-2.5 seconds
const SNOWMAN_FACE_PLAYER_CHANCE = 0.2; // 20% chance
const LASER_RADIUS = 0.5; // Added for hit detection
const PLAYER_LASER_COLOR = 0xFFFF00; // Yellow
const PLAYER_LASER_SPEED = 15.64; // Same as slow snowman laser
const MAX_HEALTH = 3;

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

// Laser speed constants
const LASER_SPEEDS = {
    SLOW: 14,
    MEDIUM: 21,
    FAST: 30
};

class Game {
    constructor() {
        console.log('Game constructor started');
        
        // Initialize core components first
        this.scene = new THREE.Scene();
        
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
        
        // Use wider FOV for mobile devices
        const fov = this.isMobile ? 90 : 75; // 90 degrees for mobile, 75 for desktop
        this.camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000);
        
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
        this.lasers = new Map();
        this.lastLaserCleanup = Date.now(); // Add timestamp for periodic cleanup
        
        // Chat properties
        this.chatInput = document.getElementById('chatInput');
        this.chatMessages = document.getElementById('chatMessages');
        this.isChatting = false;
        
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
        
        this.currentView = 'first-person';  // Changed from 'isometric' to 'first-person'
        this.hasUserInteracted = false;
        this.gameStarted = false;
        this.isMuted = false;
        
        // Initialize laser sound with preload and reduced volume
        this.laserSound = new Audio('laser.mp3');
        this.laserSound.preload = 'auto';
        this.laserSound.volume = 0.25; // Reduced from 0.5 to 0.25 (25% volume)
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
        
        // Add timestamp tracking for consistent timing
        this.lastUpdateTime = Date.now();
        this.accumulatedTime = 0;
        this.timeStep = 1000 / 60; // 60 FPS in milliseconds
        
        // Initialize music system
        this.playlist = [
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
            'https://www.openmusicarchive.org/audio/Drunkards%20Special%20by%20Coley%20Jones.mp3'
        ];
        this.currentSongIndex = 0;
        this.musicPlayer = new Audio();
        this.musicPlayer.volume = 0.75; // Increased from 0.5 to 0.75 (75% volume)
        this.isMusicPlaying = false;
        
        // Load boing sound
        this.boingSound = new Audio('boing.mp3');
        this.boingSound.volume = 0.5;
        
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
        const chatButton = document.getElementById('chatButton');
        
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
                viewButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('View button clicked');
                    this.cycleView();
                });
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
                muteButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleMute();
                });
                muteButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleMute();
                });
                console.log('Mute button listener added');
            } else {
                console.error('Mute button not found!');
            }

            // Setup chat button
            if (chatButton) {
                chatButton.style.display = 'block';
                chatButton.style.pointerEvents = 'auto';
                chatButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Chat button clicked');
                    this.toggleChat();
                });
                chatButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Chat button touched');
                    this.toggleChat();
                });
                console.log('Chat button listener added');
            } else {
                console.error('Chat button not found!');
            }
            
            // Setup directional buttons with continuous movement
            if (upButton && downButton && leftButton && rightButton) {
                // Track active touches and movement state
                let activeTouches = new Set();
                let movementState = { steering: 0, throttle: 0 };
                
                const updateMovement = () => {
                    if (this.currentPlayer && !this.currentPlayer.isDead) {
                        this.currentPlayer.move(movementState.steering, movementState.throttle);
                    }
                };
                
                // Start movement update loop
                setInterval(updateMovement, 16); // ~60fps
                
                // Up button - forward movement
                upButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    activeTouches.add('up');
                    movementState.throttle = 1;
                });
                
                upButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    activeTouches.delete('up');
                    if (!activeTouches.has('down')) {
                        movementState.throttle = 0;
                    }
                });
                
                // Down button - backward movement
                downButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    activeTouches.add('down');
                    movementState.throttle = -1;
                });
                
                downButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    activeTouches.delete('down');
                    if (!activeTouches.has('up')) {
                        movementState.throttle = 0;
                    }
                });
                
                // Left button - left turn
                leftButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    activeTouches.add('left');
                    movementState.steering = -1;
                });
                
                leftButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    activeTouches.delete('left');
                    if (!activeTouches.has('right')) {
                        movementState.steering = 0;
                    }
                });
                
                // Right button - right turn
                rightButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    activeTouches.add('right');
                    movementState.steering = 1;
                });
                
                rightButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    activeTouches.delete('right');
                    if (!activeTouches.has('left')) {
                        movementState.steering = 0;
                    }
                });
                
                // Handle touch cancel
                const handleTouchCancel = (e) => {
                    e.preventDefault();
                    activeTouches.clear();
                    movementState.steering = 0;
                    movementState.throttle = 0;
                };
                
                [upButton, downButton, leftButton, rightButton].forEach(button => {
                    button.addEventListener('touchcancel', handleTouchCancel);
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
            'ArrowRight': false,
            'w': false,
            's': false,
            'a': false,
            'd': false
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
            
            // Clean up lasers on connection
            this.cleanupLasers();
            
            // Don't create player until user interaction
            if (!this.hasUserInteracted) {
                return;
            }
            
            // Clean up any existing players for this ID
            if (this.currentPlayer) {
                console.log('Cleaning up existing player:', this.socket.id);
                this.currentPlayer.remove();
                this.players.delete(this.socket.id);
            }
            
            // Get player name from input
            const nameInput = document.getElementById('nameInput');
            const playerName = nameInput.value.trim() || 'Player' + this.socket.id.slice(0, 4);
            
            // Create current player with socket reference and proper color
            const playerColor = PLAYER_COLORS[parseInt(this.socket.id) % 10] || 0xFF0000;
            this.currentPlayer = new Player(this.scene, this.socket.id, this.socket, playerColor, playerName);
            this.players.set(this.socket.id, this.currentPlayer);
            
            // Send player name to server AFTER creating the player
            this.socket.emit('updatePlayerName', { playerName: playerName });
            
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
                        player = new Player(this.scene, id, this.socket, playerColor, data.playerName);
                        this.players.set(id, player);
                    }
                    // Always update position and state
                    player.updatePosition(data.position);
                    player.isDead = data.isDead;
                    if (player.isDead) {
                        player.prism.material.color.set(0x808080);
                        // Reset survival time if dead
                        player.currentSurvivalTime = 0;
                        player.lastDeathTime = Date.now();
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
                const player = new Player(this.scene, playerData.id, this.socket, playerColor, playerData.playerName);
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
            console.log('Player died event received:', data);
            if (data.id === this.socket.id) {
                // This is us - update our state
                if (this.currentPlayer) {
                    console.log('Current player died, updating state');
                    this.currentPlayer.isDead = true;
                    // Update all materials to grey
                    if (Array.isArray(this.currentPlayer.prism.material)) {
                        this.currentPlayer.prism.material.forEach(mat => {
                            mat.color.set(0x808080);
                        });
                    } else {
                        this.currentPlayer.prism.material.color.set(0x808080);
                    }
                    // Reset survival time
                    this.currentPlayer.currentSurvivalTime = 0;
                    this.currentPlayer.lastDeathTime = Date.now();
                    
                    // Clean up lasers
                    this.cleanupLasers();
                    
                    // Show respawn screen with controls and description
                    const countdownScreen = document.getElementById('countdownScreen');
                    const countdownElement = document.getElementById('countdown');
                    if (countdownScreen && countdownElement) {
                        countdownScreen.style.display = 'flex';
                        countdownElement.innerHTML = `
                            <div>The snowmen are tryin' to blast you. Be the best Lazer Avoider!</div>
                            <div id="countdown">Hit any key to respawn</div>
                            <div id="controls">
                                <ul>
                                    <li>Arrow keys or WASD to move</li>
                                    <li>V to change view</li>
                                    <li>M to mute sound</li>
                                    <li>P to change song</li>
                                    <li>Enter to chat</li>
                                </ul>
                            </div>
                        `;
                    }
                }
            } else {
                // Other player died
                const player = this.players.get(data.id);
                if (player) {
                    console.log('Other player died:', data.id);
                    player.isDead = true;
                    if (Array.isArray(player.prism.material)) {
                        player.prism.material.forEach(mat => {
                            mat.color.set(0x808080);
                        });
                    } else {
                        player.prism.material.color.set(0x808080);
                    }
                }
            }
        });

        this.socket.on('playerRespawn', (data) => {
            console.log('Player respawn event received:', data);
            // Clean up lasers on respawn
            this.cleanupLasers();
            
            const player = this.players.get(data.id);
            if (player) {
                console.log('Respawning player:', data.id);
                // Reset all player state
                player.isDead = false;
                player.lastDeathTime = Date.now();
                player.currentSurvivalTime = 0;
                player.mesh.position.copy(data.position);
                player.velocity.set(0, 0, 0);
                player.speed = 0;
                player.direction.set(0, 0, 1);
                
                // Reset color and start invulnerability
                const playerColor = PLAYER_COLORS[parseInt(data.id) % 10] || 0xFF0000;
                if (Array.isArray(player.prism.material)) {
                    player.prism.material[0].color.set(playerColor);
                    player.prism.material[1].color.set(playerColor * 0.8);
                    player.prism.material[2].color.set(Math.min(playerColor * 1.2, 0xFFFFFF));
                } else {
                    player.prism.material.color.set(playerColor);
                }
                
                // Start invulnerability period
                player.startInvulnerability();

                // Reset keyboard state if this is the current player
                if (data.id === this.socket.id) {
                    console.log('Resetting keyboard state for current player');
                    this.keys = {
                        'ArrowUp': false,
                        'ArrowDown': false,
                        'ArrowLeft': false,
                        'ArrowRight': false
                    };
                    
                    // Hide respawn screen
                    const countdownScreen = document.getElementById('countdownScreen');
                    if (countdownScreen) {
                        countdownScreen.style.display = 'none';
                    }
                }
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

        // Handle chat messages
        this.socket.on('chatMessage', (data) => {
            this.addChatMessage(data.playerId, data.message, data.playerName);
        });

        // Handle player name updates
        this.socket.on('playerNameUpdated', (data) => {
            console.log('Player name updated:', data);
            const player = this.players.get(data.id);
            if (player) {
                player.playerName = data.playerName;
                // Update the survival display to show the new name
                player.updateSurvivalDisplay();
            }
        });

        // Handle laser updates from server
        this.socket.on('laserCreated', (data) => {
            const laser = new Laser(this.scene, data.position);
            laser.velocity.copy(data.velocity);
            this.lasers.set(data.id, laser);
        });
        
        this.socket.on('laserUpdate', (lasersData) => {
            const currentTime = Date.now();
            
            // Create a set of current laser IDs from the server
            const serverLaserIds = new Set(lasersData.map(([id]) => id));
            
            // Remove any lasers that are no longer in the server's list
            for (const [id, laser] of this.lasers.entries()) {
                if (!serverLaserIds.has(id)) {
                    console.log('Removing laser not in server list:', id);
                    laser.die();
                    this.lasers.delete(id);
                }
            }
            
            // Update existing lasers and create new ones
            lasersData.forEach(([id, data]) => {
                let laser = this.lasers.get(id);
                if (!laser) {
                    laser = new Laser(this.scene, data.position);
                    this.lasers.set(id, laser);
                }
                laser.updateFromServer(data.position, data.velocity);
            });
        });
        
        this.socket.on('playerFiredLaser', (data) => {
            const laser = new Laser(this.scene, data.position, PLAYER_LASER_COLOR);
            laser.velocity.copy(data.velocity);
            this.lasers.set(Date.now().toString(), laser);
        });
        
        this.socket.on('snowmanDied', (data) => {
            // Find and remove the snowman
            const snowmanIndex = this.snowmen.findIndex(s => 
                s.mesh.position.distanceTo(new THREE.Vector3(data.position.x, data.position.y, data.position.z)) < 1
            );
            
            if (snowmanIndex !== -1) {
                const snowman = this.snowmen[snowmanIndex];
                this.scene.remove(snowman.mesh);
                this.snowmen.splice(snowmanIndex, 1);
                
                // Award kill to the player who fired the laser
                if (this.currentPlayer && data.killerId === this.socket.id) {
                    this.currentPlayer.kills++;
                    this.currentPlayer.updateStatsDisplay();
                }
            }
        });
        
        // Handle player collisions
        this.socket.on('playerCollision', (data) => {
            // Play boing sound
            this.boingSound.currentTime = 0;
            this.boingSound.play();
            
            // Update player positions and velocities
            if (this.players.has(data.player1.id)) {
                const player1 = this.players.get(data.player1.id);
                player1.position.copy(data.player1.position);
                player1.velocity.copy(data.player1.velocity);
            }
            
            if (this.players.has(data.player2.id)) {
                const player2 = this.players.get(data.player2.id);
                player2.position.copy(data.player2.position);
                player2.velocity.copy(data.player2.velocity);
            }
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
                this.camera.position.set(0, 25, 0); // Increased from 20 to 25
                this.camera.lookAt(0, 0, 0);
                break;
            case 'isometric':
                // Rotate 45 degrees to the left (around Y axis)
                const isoDistance = 25; // Increased from 20 to 25
                const isoHeight = 25;   // Increased from 20 to 25
                this.camera.position.set(
                    isoDistance * Math.cos(Math.PI/4),  // cos(45°) = 0.707
                    isoHeight,
                    isoDistance * Math.sin(Math.PI/4)   // sin(45°) = 0.707
                );
                this.camera.lookAt(0, 0, 0);
                break;
            case 'first-person':
                if (this.currentPlayer) {
                    // Position camera 2 units back and 4 units up from player
                    const offset = new THREE.Vector3(
                        -this.currentPlayer.direction.x * 2,
                        4,
                        -this.currentPlayer.direction.z * 2
                    );
                    this.camera.position.copy(this.currentPlayer.mesh.position).add(offset);
                    
                    // Look in the direction the player is facing, but at the same height as the camera
                    const lookAtPoint = new THREE.Vector3(
                        this.currentPlayer.mesh.position.x + this.currentPlayer.direction.x,
                        this.camera.position.y,
                        this.currentPlayer.mesh.position.z + this.currentPlayer.direction.z
                    );
                    this.camera.lookAt(lookAtPoint);
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
        try {
            requestAnimationFrame(() => this.animate());
            
            // Calculate delta time since last update
            const currentTime = Date.now();
            const deltaTime = currentTime - this.lastUpdateTime;
            this.lastUpdateTime = currentTime;
            
            // Accumulate time and update in fixed time steps
            this.accumulatedTime += deltaTime;
            
            // Update in fixed time steps to ensure consistent physics
            while (this.accumulatedTime >= this.timeStep) {
                // Update snowmen with client-side movement
                this.snowmen.forEach(snowman => {
                    snowman.update();
                });
                
                // More aggressive laser cleanup
                for (const [id, laser] of this.lasers.entries()) {
                    if (!laser || !laser.mesh || laser.isDead || currentTime - laser.birthTime > LASER_DURATION) {
                        console.log('Removing laser during update:', id);
                        if (laser && laser.mesh) {
                            laser.die();
                        }
                        this.lasers.delete(id);
                        continue;
                    }
                    laser.update();
                }
                
                // Update players
                this.players.forEach(player => {
                    if (!player) return;
                    try {
                        player.update();
                        if (player === this.currentPlayer && !player.isDead) {
                            // Handle gamepad input
                            if (this.gamepad) {
                                this.gamepad = navigator.getGamepads()[this.gamepadIndex];
                                if (this.gamepad) {
                                    const moveX = this.gamepad.axes[0];
                                    const moveZ = this.gamepad.axes[1];
                                    
                                    // Apply deadzone
                                    const deadzone = 0.1;
                                    const steering = Math.abs(moveX) > deadzone ? moveX : 0;
                                    const throttle = Math.abs(moveZ) > deadzone ? -moveZ : 0;
                                    
                                    if (steering !== 0 || throttle !== 0) {
                                        player.move(steering, throttle);
                                        this.socket.emit('playerMove', {
                                            position: player.mesh.position,
                                            velocity: player.velocity
                                        });
                                    }
                                }
                            }
                            // Handle keyboard input
                            else if (!this.isMobile) {
                                let steering = 0;
                                let throttle = 0;
                                
                                if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) steering -= 1;
                                if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) steering += 1;
                                if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) throttle += 1;
                                if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) throttle -= 1;
                                
                                if (steering !== 0 || throttle !== 0) {
                                    player.move(steering, throttle);
                                    this.socket.emit('playerMove', {
                                        position: player.mesh.position,
                                        velocity: player.velocity
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error updating player:', error);
                    }
                });
                
                // Periodic laser cleanup check (every 5 seconds)
                if (currentTime - this.lastLaserCleanup > 5000) {
                    console.log('Running periodic laser cleanup');
                    for (const [id, laser] of this.lasers.entries()) {
                        if (currentTime - laser.birthTime > LASER_DURATION * 1.5) {
                            console.log('Force removing old laser:', id, { age: currentTime - laser.birthTime });
                            if (laser.mesh) {
                                laser.die();
                            }
                            this.lasers.delete(id);
                        }
                    }
                    this.lastLaserCleanup = currentTime;
                }
                
                this.accumulatedTime -= this.timeStep;
            }
            
            // Only render if the tab is visible
            if (!document.hidden) {
                if (this.currentView === 'first-person') {
                    this.updateCameraView();
                }
                this.renderer.render(this.scene, this.camera);
            }
        } catch (error) {
            console.error('Error in animation loop:', error);
            // Try to recover by cleaning up and restarting
            this.cleanupLasers();
            requestAnimationFrame(() => this.animate());
        }
    }
    
    updateStats() {
        // Remove the survival time display from top left since it's now above players
        requestAnimationFrame(() => this.updateStats());
    }
    
    startNewRound() {
        // Show countdown screen
        const countdownScreen = document.getElementById('countdownScreen');
        const countdownElement = document.getElementById('countdown');
        if (countdownScreen && countdownElement) {
            countdownScreen.style.display = 'flex';
            countdownElement.innerHTML = `
                <div>The snowmen are tryin' to blast you. Be the best Lazer Avoider!</div>
                <div id="countdown">Hit any key to respawn</div>
                <div id="controls">
                    <ul>
                        <li>Arrow keys or WASD to move</li>
                        <li>V to change view</li>
                        <li>M to mute sound</li>
                        <li>P to change song</li>
                        <li>Enter to chat</li>
                    </ul>
                </div>
            `;
        }
        
        // Start countdown
        let count = 3;
        const countdownInterval = setInterval(() => {
            count--;
            if (countdownElement) {
                countdownElement.textContent = count;
            }
            if (count <= 0) {
                clearInterval(countdownInterval);
                if (countdownScreen) {
                    countdownScreen.style.display = 'none';
                }
                
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
        
        // Add interaction listener for first interaction
        const startInteraction = (event) => {
            if (this.gameStarted) return;
            
            const nameInput = document.getElementById('nameInput');
            if (!nameInput.value.trim()) {
                nameInput.focus();
                return;
            }
            
            // Only start if clicking outside the input
            if (event.target === nameInput || event.target.closest('#nameInput')) {
                return;
            }
            
            this.hasUserInteracted = true;
            this.gameStarted = true;
            
            // Hide loading screen
            const loadingScreen = document.getElementById('loadingScreen');
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
            
            // Start music
            this.startMusic();
            
            // If socket is already connected, create player now
            if (this.socket && this.socket.connected) {
                const playerName = nameInput.value.trim() || 'Player' + this.socket.id.slice(0, 4);
                const playerColor = PLAYER_COLORS[parseInt(this.socket.id) % 10] || 0xFF0000;
                this.currentPlayer = new Player(this.scene, this.socket.id, this.socket, playerColor, playerName);
                this.players.set(this.socket.id, this.currentPlayer);
                
                // Send player name to server
                this.socket.emit('updatePlayerName', { playerName: playerName });
                
                this.socket.emit('requestCurrentPlayers');
            }
        };
        
        // Listen for both clicks and touches for starting the game
        document.addEventListener('click', startInteraction);
        document.addEventListener('touchstart', (e) => {
            // Allow input elements to work normally
            if (e.target.tagName === 'INPUT' || 
                e.target.tagName === 'TEXTAREA' || 
                e.target.closest('#nameInput') || 
                e.target.closest('#chatInput')) {
                return;
            }
            startInteraction(e);
        }, { passive: false });
        
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
                
                // Check for respawn screen
                const countdownScreen = document.getElementById('countdownScreen');
                if (countdownScreen && countdownScreen.style.display === 'flex') {
                    // Any key press will trigger respawn
                    this.socket.emit('playerRespawn');
                    countdownScreen.style.display = 'none';
                    return;
                }
                
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
                                playerId: this.socket.id
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
                    this.toggleMute();
                }
                if (e.key === 'n' || e.key === 'N') {
                    this.nextSong();
                }
                if (e.key === 'p' || e.key === 'P') {
                    this.nextSong();
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

        // Add touch handler for respawn screen (works on both mobile and desktop)
        document.addEventListener('touchstart', (e) => {
            if (!this.gameStarted) return;
            
            // Check for respawn screen
            const countdownScreen = document.getElementById('countdownScreen');
            if (countdownScreen && countdownScreen.style.display === 'flex') {
                // Any touch will trigger respawn
                this.socket.emit('playerRespawn');
                countdownScreen.style.display = 'none';
                e.preventDefault();
            }
        }, { passive: false });
        
        console.log('Event listeners setup complete');
        
        // Add visibility change detection
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.players.has(this.socket.id)) {
                // Player tabbed out - kill them
                const player = this.players.get(this.socket.id);
                if (player && !player.isDead) {
                    player.die();
                    // Show respawn message
                    const respawnMessage = document.createElement('div');
                    respawnMessage.id = 'respawnMessage';
                    respawnMessage.style.position = 'fixed';
                    respawnMessage.style.top = '50%';
                    respawnMessage.style.left = '50%';
                    respawnMessage.style.transform = 'translate(-50%, -50%)';
                    respawnMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
                    respawnMessage.style.color = 'white';
                    respawnMessage.style.padding = '20px';
                    respawnMessage.style.borderRadius = '10px';
                    respawnMessage.style.textAlign = 'center';
                    respawnMessage.style.zIndex = '1000';
                    respawnMessage.innerHTML = `
                        <h2>You tabbed out!</h2>
                        <p>Click or press any key to respawn</p>
                    `;
                    document.body.appendChild(respawnMessage);
                }
            } else if (!document.hidden && this.players.has(this.socket.id)) {
                // Player returned - remove respawn message if it exists
                const respawnMessage = document.getElementById('respawnMessage');
                if (respawnMessage) {
                    respawnMessage.remove();
                }
            }
        });

        // Add click/key press handler for respawn
        const handleRespawn = (event) => {
            const respawnMessage = document.getElementById('respawnMessage');
            if (respawnMessage) {
                respawnMessage.remove();
                this.startNewRound();
            }
        };

        document.addEventListener('click', handleRespawn);
        document.addEventListener('keydown', handleRespawn);
        
        // Add mouse click handler for firing
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.currentPlayer && !this.currentPlayer.isDead) { // Left click
                this.currentPlayer.fireLaser();
            }
        });
        
        // Add space key handler for firing
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.currentPlayer && !this.currentPlayer.isDead) {
                this.currentPlayer.fireLaser();
            }
        });
        
        // Add gamepad trigger handler
        if (this.gamepad) {
            const checkGamepad = () => {
                if (this.gamepad) {
                    if (this.gamepad.buttons[7].pressed && this.currentPlayer && !this.currentPlayer.isDead) { // RT
                        this.currentPlayer.fireLaser();
                    }
                }
                requestAnimationFrame(checkGamepad);
            };
            checkGamepad();
        }
        
        // Add mobile fire button
        if (this.isMobile) {
            const fireButton = document.createElement('button');
            fireButton.id = 'fireButton';
            fireButton.textContent = 'FIRE';
            fireButton.style.position = 'absolute';
            fireButton.style.right = '20px';
            fireButton.style.bottom = '20px';
            fireButton.style.padding = '20px';
            fireButton.style.fontSize = '24px';
            fireButton.style.backgroundColor = '#FF0000';
            fireButton.style.color = 'white';
            fireButton.style.border = 'none';
            fireButton.style.borderRadius = '10px';
            fireButton.style.zIndex = '1000';
            
            fireButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.currentPlayer && !this.currentPlayer.isDead) {
                    this.currentPlayer.fireLaser();
                }
            });
            
            document.body.appendChild(fireButton);
        }
        
        // Handle player collisions
        this.socket.on('playerCollision', (data) => {
            // Play boing sound
            this.boingSound.currentTime = 0;
            this.boingSound.play();
            
            // Update player positions and velocities
            if (this.players.has(data.player1.id)) {
                const player1 = this.players.get(data.player1.id);
                player1.position.copy(data.player1.position);
                player1.velocity.copy(data.player1.velocity);
            }
            
            if (this.players.has(data.player2.id)) {
                const player2 = this.players.get(data.player2.id);
                player2.position.copy(data.player2.position);
                player2.velocity.copy(data.player2.velocity);
            }
        });
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
        console.log('Adding chat message:', { playerId, message, playerName });
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

    // Add toggleChat method
    toggleChat() {
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
                    playerId: this.socket.id
                });
            }
            this.chatInput.value = '';
            this.chatInput.style.display = 'none';
            this.isChatting = false;
        }
    }

    // Enhance the cleanup method to be more thorough
    cleanupLasers() {
        console.log('Starting thorough laser cleanup');
        const initialCount = this.lasers.size;
        
        // First pass: remove all lasers from the scene and force cleanup
        for (const [id, laser] of this.lasers.entries()) {
            if (laser) {
                console.log('Cleaning up laser:', id);
                if (laser.mesh) {
                    if (laser.mesh.parent) {
                        laser.mesh.parent.remove(laser.mesh);
                    }
                    if (laser.mesh.material) {
                        if (Array.isArray(laser.mesh.material)) {
                            laser.mesh.material.forEach(mat => mat.dispose());
                        } else {
                            laser.mesh.material.dispose();
                        }
                    }
                    if (laser.mesh.geometry) {
                        laser.mesh.geometry.dispose();
                    }
                }
                laser.isDead = true;
            }
        }
        
        // Second pass: clear the lasers Map
        this.lasers.clear();
        
        // Force a garbage collection hint
        if (window.gc) {
            window.gc();
        }
        
        console.log(`Laser cleanup complete. Removed ${initialCount} lasers`);
    }

    // Add music control methods
    startMusic() {
        if (!this.isMusicPlaying) {
            this.loadAndPlayCurrentSong();
            this.isMusicPlaying = true;
        }
    }

    loadAndPlayCurrentSong() {
        const songUrl = this.playlist[this.currentSongIndex];
        this.musicPlayer.src = songUrl;
        this.musicPlayer.play().catch(error => {
            console.log('Error playing music:', error);
        });

        // Set up event listener for when song ends
        this.musicPlayer.onended = () => {
            this.currentSongIndex = (this.currentSongIndex + 1) % this.playlist.length;
            this.loadAndPlayCurrentSong();
        };
    }

    nextSong() {
        this.currentSongIndex = (this.currentSongIndex + 1) % this.playlist.length;
        this.loadAndPlayCurrentSong();
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.laserSound.muted = this.isMuted;
        this.musicPlayer.muted = this.isMuted;
        
        // Update mute button text
        const muteButton = document.getElementById('muteButton');
        if (muteButton) {
            muteButton.textContent = this.isMuted ? '🔊' : '🔇';
        }
    }
}

class Player {
    constructor(scene, id, socket, color, playerName) {
        console.log('Creating new player with ID:', id);
        this.scene = scene;
        this.id = id;
        this.socket = socket;
        this.game = window.game; // Store reference to game instance
        this.mesh = new THREE.Group();
        
        // Use provided player name or generate one
        this.playerName = playerName || 'Player' + id.slice(0, 4);
        
        // Create triangular prism for player
        const baseWidth = PLAYER_SIZE * 1.6;  // Width of triangle base (reduced by 20%)
        const height = SNOWMAN_SIZE * 1.7;    // Height of prism (increased to 1.7)
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

        // Create three materials with different shades
        const mainColor = color || PLAYER_COLORS[parseInt(id) % 10] || 0xFF0000;
        const darkerColor = mainColor * 0.8;  // 20% darker
        const lighterColor = Math.min(mainColor * 1.2, 0xFFFFFF);  // 20% lighter, but don't exceed white
        
        const materials = [
            new THREE.MeshBasicMaterial({ color: mainColor }),    // Front
            new THREE.MeshBasicMaterial({ color: darkerColor }),  // Left
            new THREE.MeshBasicMaterial({ color: lighterColor })  // Right
        ];
        
        this.prism = new THREE.Mesh(geometry, materials);
        
        // Position prism so its center is at the player's position
        this.prism.position.z = PLAYER_SIZE; // Move forward by half its depth
        this.prism.scale.y = 2; // Double the height
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
        
        // Set initial prism rotation to match direction
        this.prism.rotation.y = Math.atan2(this.direction.x, this.direction.z);
        
        // Movement constants - JOHNHOUSE CONFIGURATION
        this.maxSpeed = 0.24;
        this.turnSpeed = 0.1;
        this.acceleration = 0.16; // Aggressive acceleration
        this.deceleration = 0.08; // Gentler deceleration for slight glide
        this.momentum = 0.985; // Increased from 0.98 to 0.985 for slightly more glide
        
        // Initialize player state
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
        
        // Add health and stats
        this.health = MAX_HEALTH;
        this.kills = 0;
        this.deaths = 0;
        
        // Create health bar
        this.createHealthBar();
        
        // Create stats display
        this.createStatsDisplay();
        
        // Remove survival display
        if (this.survivalSprite) {
            this.mesh.remove(this.survivalSprite);
            this.survivalSprite = null;
        }
        
        // Start with invulnerability
        this.startInvulnerability();
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
        this.survivalSprite.position.y = 2; // Lowered from 3.5 to 2 units
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
        if (this.isDead) {
            console.log('Cannot move - player is dead');
            return;
        }
        
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

        // Only send movement updates if we're actually moving
        if (this.socket && this.id === this.socket.id && (Math.abs(this.velocity.x) > 0.01 || Math.abs(this.velocity.z) > 0.01)) {
            this.socket.emit('playerMove', {
                position: this.mesh.position,
                velocity: this.velocity
            });
        }
    }
    
    updatePosition(position) {
        this.mesh.position.copy(position);
    }
    
    update() {
        try {
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
                    if (Array.isArray(this.prism.material)) {
                        this.prism.material[0].color.set(this.originalColors.prism);
                        this.prism.material[1].color.set(this.originalColors.prism * 0.8);
                        this.prism.material[2].color.set(Math.min(this.originalColors.prism * 1.2, 0xFFFFFF));
                    } else {
                        this.prism.material.color.set(this.originalColors.prism);
                    }
                } else {
                    // Flash between original color and white, but only every 100ms
                    const flashRate = 100; // Flash every 100ms
                    const shouldFlash = Math.floor(timeSinceStart / flashRate) % 2 === 0;
                    const color = shouldFlash ? 0xFFFFFF : this.originalColors.prism;
                    
                    if (Array.isArray(this.prism.material)) {
                        this.prism.material[0].color.set(color);
                        this.prism.material[1].color.set(color * 0.8);
                        this.prism.material[2].color.set(Math.min(color * 1.2, 0xFFFFFF));
                    } else {
                        this.prism.material.color.set(color);
                    }
                }
            }

            // Check for laser hits
            if (!this.isDead && !this.isInvulnerable) {
                if (this.checkLaserHit()) {
                    console.log('Player hit by laser:', this.id);
                    this.die();
                }
            }
        } catch (error) {
            console.error('Error in player update:', error);
        }
    }

    checkLaserHit() {
        if (this.isDead || this.isInvulnerable) return false;
        
        for (const [id, laser] of window.game.lasers) {
            if (!laser || !laser.mesh || laser.isDead || currentTime - laser.birthTime > LASER_DURATION) {
                console.log('Removing laser during update:', id);
                if (laser && laser.mesh) {
                    laser.die();
                }
                this.lasers.delete(id);
                continue;
            }
            laser.update();
        }
        return false;
    }
    
    die() {
        if (!this.isDead && !this.isInvulnerable) {
            console.log('Player died:', this.id);
            this.isDead = true;
            this.deaths++;
            this.updateStatsDisplay();
            
            // Update all materials to grey
            if (Array.isArray(this.prism.material)) {
                this.prism.material.forEach(mat => {
                    mat.color.set(0x808080);
                });
            } else {
                this.prism.material.color.set(0x808080);
            }
            
            // Reset survival time
            this.currentSurvivalTime = 0;
            this.lastDeathTime = Date.now();
            
            // Show respawn screen
            const countdownScreen = document.getElementById('countdownScreen');
            const countdownElement = document.getElementById('countdown');
            if (countdownScreen && countdownElement) {
                countdownScreen.style.display = 'flex';
                countdownElement.innerHTML = `
                    <div>The snowmen are tryin' to blast you. Be the best Lazer Avoider!</div>
                    <div id="countdown">Hit any key to respawn</div>
                    <div id="controls">
                        <ul>
                            <li>Arrow keys or WASD to move</li>
                            <li>V to change view</li>
                            <li>M to mute sound</li>
                            <li>P to change song</li>
                            <li>Enter to chat</li>
                        </ul>
                    </div>
                `;
            }
            
            // Only emit if this is the current player
            if (this.socket && this.id === this.socket.id) {
                this.socket.emit('playerDied');
            }
        }
    }
    
    remove() {
        this.scene.remove(this.mesh);
    }

    startInvulnerability() {
        console.log('Starting invulnerability for player:', this.id);
        this.isInvulnerable = true;
        this.invulnerabilityStartTime = Date.now();
        this.health = MAX_HEALTH;
        this.updateHealthBar();
        
        // Store original colors only once at the start
        if (!this.originalColors) {
            this.originalColors = {
                prism: this.prism.material.color.getHex()
            };
        }
        
        // Reset movement state
        this.speed = 0;
        this.velocity.set(0, 0, 0);
        this.direction.set(0, 0, 1);
        
        // Update prism rotation to match direction
        this.prism.rotation.y = Math.atan2(this.direction.x, this.direction.z);
        
        // Reset keyboard state if this is the current player
        if (this.game && this.id === this.game.socket.id) {
            this.game.keys = {
                'ArrowUp': false,
                'ArrowDown': false,
                'ArrowLeft': false,
                'ArrowRight': false,
                'w': false,
                's': false,
                'a': false,
                'd': false
            };
        }
    }
    
    createHealthBar() {
        const healthBarGeometry = new THREE.BoxGeometry(1, 0.1, 0.1);
        const healthBarMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
        this.healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
        this.healthBar.position.y = 2.5;
        this.mesh.add(this.healthBar);
        
        // Background bar
        const bgGeometry = new THREE.BoxGeometry(1, 0.1, 0.05);
        const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
        this.healthBarBg = new THREE.Mesh(bgGeometry, bgMaterial);
        this.healthBarBg.position.z = 0.06;
        this.healthBar.add(this.healthBarBg);
    }
    
    createStatsDisplay() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true
        });
        this.statsSprite = new THREE.Sprite(material);
        this.statsSprite.position.y = 3;
        this.statsSprite.scale.set(4, 1, 1);
        this.mesh.add(this.statsSprite);
        
        this.statsCanvas = canvas;
        this.statsContext = context;
    }
    
    updateStatsDisplay() {
        if (!this.statsContext) return;
        
        const ctx = this.statsContext;
        const canvas = this.statsCanvas;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Set text style
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        
        // Draw K/D stats
        const stats = `K: ${this.kills}  D: ${this.deaths}`;
        ctx.fillText(stats, canvas.width/2, 40);
        
        this.statsSprite.material.map.needsUpdate = true;
    }
    
    updateHealthBar() {
        const healthPercent = this.health / MAX_HEALTH;
        this.healthBar.scale.x = healthPercent;
        
        // Update color based on health
        let color;
        if (healthPercent > 0.66) color = 0x00FF00; // Green
        else if (healthPercent > 0.33) color = 0xFFFF00; // Yellow
        else color = 0xFF0000; // Red
        
        this.healthBar.material.color.set(color);
    }
    
    takeDamage() {
        if (this.isInvulnerable) return false;
        
        this.health--;
        this.updateHealthBar();
        
        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }
    
    fireLaser() {
        if (this.isDead) return;
        
        const velocity = new THREE.Vector3(
            this.direction.x * PLAYER_LASER_SPEED,
            0,
            this.direction.z * PLAYER_LASER_SPEED
        );
        
        // Notify server about the laser
        this.socket.emit('playerFiredLaser', {
            position: this.mesh.position,
            velocity: velocity
        });
        
        // Play laser sound
        this.game.laserSound.currentTime = 0;
        this.game.laserSound.play().catch(error => {
            console.log('Laser sound play failed:', error);
        });
    }
}

class Snowman {
    constructor(scene, color, game) {
        this.scene = scene;
        this.color = color;
        this.game = game;
        this.mesh = new THREE.Group();
        
        // Create three stacked dodecahedrons with adjusted sizes
        for (let i = 0; i < 3; i++) {
            let size;
            if (i === 0) { // Bottom
                size = SNOWMAN_SIZE;
            } else if (i === 1) { // Middle
                size = SNOWMAN_SIZE * 0.9; // 10% smaller
            } else { // Top
                size = SNOWMAN_SIZE * 0.75; // 25% smaller
            }
            const geometry = new THREE.DodecahedronGeometry(size);
            const material = new THREE.MeshBasicMaterial({ color: this.color });
            const part = new THREE.Mesh(geometry, material);
            part.position.y = i * size * 1.5;
            this.mesh.add(part);
        }
        
        // Add eyes and nose to the top dodecahedron
        const eyeGeometry = new THREE.DodecahedronGeometry(0.075);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Black eyes
        const noseGeometry = new THREE.ConeGeometry(0.15, 0.3);
        const noseMaterial = new THREE.MeshBasicMaterial({ color: 0xFFA500 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        
        // Position eyes and nose on the top dodecahedron
        const topSize = SNOWMAN_SIZE * 0.75; // Match the top dodecahedron size
        const topY = SNOWMAN_SIZE * 2.2;
        
        nose.position.set(0, topY - 0.2, topSize * 0.9);
        nose.rotation.x = Math.PI / 2;
        
        leftEye.position.set(-0.25, topY, topSize * 0.7);
        rightEye.position.set(0.25, topY, topSize * 0.7);
        
        this.mesh.add(leftEye, rightEye, nose);
        
        // Raise the entire snowman so bottom touches floor
        const bottomSize = SNOWMAN_SIZE;
        this.mesh.position.y = bottomSize;
        
        this.scene.add(this.mesh);
        
        this.lastFireTime = 0;
        this.nextFireTime = this.getNextFireTime();
        
        // Add velocity for movement
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 7.875,
            0,
            (Math.random() - 0.5) * 7.875
        );

        // Interpolation properties
        this.targetPosition = new THREE.Vector3();
        this.targetVelocity = new THREE.Vector3();
        this.lastUpdateTime = Date.now();
        this.interpolationDelay = 100; // 100ms interpolation delay
        this.positionHistory = [];
        this.maxHistoryLength = 10;
        
        // Add health
        this.health = MAX_HEALTH;
        
        // Create health bar
        this.createHealthBar();
    }
    
    getNextFireTime() {
        return Date.now() + Math.random() * (SNOWMAN_FIRE_INTERVAL.max - SNOWMAN_FIRE_INTERVAL.min) + SNOWMAN_FIRE_INTERVAL.min;
    }
    
    fireLaser() {
        // Flash snowman based on laser speed
        const speedType = Math.floor(Math.random() * 3); // 0=slow, 1=medium, 2=fast
        let flashColor;
        let velocity;
        switch(speedType) {
            case 0: // Slow
                flashColor = 0x808080; // Mid-gray
                velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 15.64, // Reduced by 8% from 17
                    0,
                    (Math.random() - 0.5) * 15.64  // Reduced by 8% from 17
                );
                break;
            case 1: // Medium
                flashColor = 0xB0B0B0; // Light gray
                velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 22.08, // Reduced by 8% from 24
                    0,
                    (Math.random() - 0.5) * 22.08  // Reduced by 8% from 24
                );
                break;
            case 2: // Fast
                flashColor = 0xFFFFFF; // White
                velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 34.04, // Reduced by 8% from 37
                    0,
                    (Math.random() - 0.5) * 34.04  // Reduced by 8% from 37
                );
                break;
        }
        
        // Normalize velocity to ensure consistent speed
        velocity.normalize();
        // Scale to desired speed
        switch(speedType) {
            case 0: velocity.multiplyScalar(15.64); break; // Slow (reduced by 8%)
            case 1: velocity.multiplyScalar(22.08); break; // Medium (reduced by 8%)
            case 2: velocity.multiplyScalar(34.04); break; // Fast (reduced by 8%)
        }
        
        // Flash snowman color
        this.mesh.children.forEach(part => {
            if (part.material) {
                const originalColor = part.material.color.getHex();
                part.material.color.set(flashColor);
                setTimeout(() => {
                    part.material.color.set(originalColor);
                }, 100);
            }
        });
        
        // Notify server about the laser
        this.game.socket.emit('snowmanFiredLaser', {
            position: this.mesh.position,
            velocity: velocity
        });
        
        // Play laser sound
        this.game.laserSound.currentTime = 0;
        this.game.laserSound.play().catch(error => {
            console.log('Laser sound play failed:', error);
        });
    }
    
    update() {
        const currentTime = Date.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = currentTime;

        // Client-side prediction
        this.mesh.position.x += this.velocity.x * deltaTime;
        this.mesh.position.z += this.velocity.z * deltaTime;
        
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
        
        // Check for player laser hits
        this.checkSnowmanHit();
    }
    
    updateFromServer(position, velocity) {
        const currentTime = Date.now();
        
        // Store the server position and velocity
        this.targetPosition.copy(position);
        this.targetVelocity.copy(velocity);
        
        // Add to position history with timestamp
        this.positionHistory.push({
            position: position.clone(),
            time: currentTime
        });
        
        // Keep history at reasonable size
        while (this.positionHistory.length > this.maxHistoryLength) {
            this.positionHistory.shift();
        }
        
        // Find the position to interpolate to (one interpolation delay ago)
        const targetTime = currentTime - this.interpolationDelay;
        let targetPosition = null;
        
        // Find the two positions to interpolate between
        for (let i = 0; i < this.positionHistory.length - 1; i++) {
            const current = this.positionHistory[i];
            const next = this.positionHistory[i + 1];
            
            if (current.time <= targetTime && next.time >= targetTime) {
                // Calculate interpolation factor
                const factor = (targetTime - current.time) / (next.time - current.time);
                
                // Interpolate position
                targetPosition = new THREE.Vector3().lerpVectors(
                    current.position,
                    next.position,
                    factor
                );
                break;
            }
        }
        
        // If we found a target position, use it
        if (targetPosition) {
            this.mesh.position.copy(targetPosition);
        } else {
            // If no interpolation possible, use the latest server position
            this.mesh.position.copy(position);
        }
        
        // Update velocity for client-side prediction
        this.velocity.copy(velocity);
    }
    
    createHealthBar() {
        const healthBarGeometry = new THREE.BoxGeometry(1, 0.1, 0.1);
        const healthBarMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
        this.healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
        this.healthBar.position.y = 3.5;
        this.mesh.add(this.healthBar);
        
        // Background bar
        const bgGeometry = new THREE.BoxGeometry(1, 0.1, 0.05);
        const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
        this.healthBarBg = new THREE.Mesh(bgGeometry, bgMaterial);
        this.healthBarBg.position.z = 0.06;
        this.healthBar.add(this.healthBarBg);
    }
    
    updateHealthBar() {
        const healthPercent = this.health / MAX_HEALTH;
        this.healthBar.scale.x = healthPercent;
        
        // Update color based on health
        let color;
        if (healthPercent > 0.66) color = 0x00FF00; // Green
        else if (healthPercent > 0.33) color = 0xFFFF00; // Yellow
        else color = 0xFF0000; // Red
        
        this.healthBar.material.color.set(color);
    }
    
    takeDamage() {
        this.health--;
        this.updateHealthBar();
        
        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }
    
    die() {
        // Remove from scene
        this.scene.remove(this.mesh);
        
        // Notify server
        this.game.socket.emit('snowmanDied', {
            position: this.mesh.position
        });
    }
    
    checkSnowmanHit() {
        for (const [id, laser] of window.game.lasers) {
            if (!laser || !laser.mesh || !laser.isPlayerLaser) continue; // Only check player lasers
            
            // Get positions
            const snowmanPos = this.mesh.position;
            const laserPos = laser.mesh.position;
            
            // Calculate distance on XZ plane
            const dx = snowmanPos.x - laserPos.x;
            const dz = snowmanPos.z - laserPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Hit if within combined radii
            const hitDistance = SNOWMAN_SIZE + LASER_RADIUS;
            if (distance < hitDistance) {
                console.log(`HIT DETECTED! Snowman hit by player laser ${id}`);
                if (this.takeDamage()) {
                    return true;
                }
                laser.die();
                return false;
            }
        }
        return false;
    }
}

class Laser {
    constructor(scene, position, color = LASER_COLOR) {
        this.scene = scene;
        this.size = LASER_INITIAL_SIZE;
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(this.size),
            new THREE.MeshBasicMaterial({ color: color })
        );
        this.mesh.position.copy(position);
        this.mesh.position.y = 2.4;
        this.scene.add(this.mesh);
        this.birthTime = Date.now();
        this.isDead = false;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.lastPosition = new THREE.Vector3().copy(position);
        this.stationaryTime = 0;
        this.isPlayerLaser = color === PLAYER_LASER_COLOR;
    }
    
    update() {
        if (this.isDead) return;
        
        const age = Date.now() - this.birthTime;
        
        // Simple duration check - die after 2.5 seconds
        if (age > LASER_DURATION) {
            this.die();
            return;
        }
        
        // Store current position before updating
        const oldPosition = new THREE.Vector3().copy(this.mesh.position);
        
        // Update position based on velocity (convert to per-frame movement)
        const deltaTime = 1/60; // Assuming 60 FPS
        this.mesh.position.x += this.velocity.x * deltaTime;
        this.mesh.position.z += this.velocity.z * deltaTime;
        
        // Check if laser is stationary
        const distanceMoved = oldPosition.distanceTo(this.mesh.position);
        if (distanceMoved < 0.001) { // If moved less than 0.001 units
            this.stationaryTime += deltaTime;
            if (this.stationaryTime > 0.5) { // If stationary for more than 0.5 seconds
                console.log('Laser removed due to being stationary:', {
                    position: this.mesh.position,
                    velocity: this.velocity,
                    age: age
                });
                this.die();
                return;
            }
        } else {
            this.stationaryTime = 0;
        }
        
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
        
        // Store last position for next frame
        this.lastPosition.copy(this.mesh.position);
    }
    
    die() {
        if (!this.isDead) {
            this.isDead = true;
            if (this.mesh && this.mesh.parent) {
                this.scene.remove(this.mesh);
            }
            if (this.mesh && this.mesh.material) {
                this.mesh.material.dispose();
            }
            if (this.mesh && this.mesh.geometry) {
                this.mesh.geometry.dispose();
            }
            this.mesh = null;
        }
    }
    
    updateFromServer(position, velocity) {
        if (this.isDead) return;
        
        // Update position and velocity
        this.mesh.position.copy(position);
        this.mesh.position.y = 2.4; // Ensure height is maintained at 2.4 units
        this.velocity.copy(velocity);
        
        // Reset stationary time when we get a server update
        this.stationaryTime = 0;
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

// Add visibility change handler
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.game) {
        // Reset timing when tab becomes visible
        window.game.lastUpdateTime = Date.now();
        window.game.accumulatedTime = 0;
        // Force cleanup all lasers
        window.game.cleanupLasers();
    } else if (document.hidden && window.game) {
        // When tab is hidden, kill player and cleanup
        if (window.game.currentPlayer && !window.game.currentPlayer.isDead) {
            window.game.currentPlayer.die(); // Use the proper die() method instead of manual state changes
        }
        // Force cleanup all lasers
        window.game.cleanupLasers();
    }
}); 