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
const ARENA_SIZE = 29;
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
        this.lastLaserCleanup = Date.now();
        this.activeLaserIds = new Set(); // Track active laser IDs from server
        this.lastLaserUpdate = Date.now(); // Track last server laser update
        
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
        
        this.currentView = 'isometric';  // Changed from 'top' to 'isometric'
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
            isConnected = true;
            document.getElementById('connectionStatus').textContent = 'Connected';
            document.getElementById('connectionStatus').style.color = '#4CAF50';
            
            // Request initial game state
            socket.emit('requestGameState');
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
                                    <li>Arrow keys to move</li>
                                    <li>V to change view</li>
                                    <li>M to mute sound</li>
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
            console.log('Received laser creation from server:', data);
            createLaser(data.id, data.position, data.velocity);
            
            // Play laser sound
            this.laserSound.currentTime = 0;
            this.laserSound.play().catch(error => {
                console.log('Laser sound play failed:', error);
            });
        });
        
        this.socket.on('laserUpdate', (lasersData) => {
            const currentTime = Date.now();
            this.lastLaserUpdate = currentTime;
            
            // Create a set of current laser IDs from the server
            const serverLaserIds = new Set(lasersData.map(([id]) => id));
            
            // Update activeLaserIds
            this.activeLaserIds = serverLaserIds;
            
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
                    laser.id = id;
                    this.lasers.set(id, laser);
                }
                laser.lastServerUpdate = currentTime;
                laser.updateFromServer(data.position, data.velocity);
            });
        });

        // Add periodic laser validation to animation loop
        setInterval(() => this.validateLasers(), 500); // Check every 500ms instead of 1000ms
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
                // Rotate 45 degrees to the left (around Y axis)
                const isoDistance = 20; // Increased from 15 to 20
                const isoHeight = 20;   // Increased from 15 to 20
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
                        -this.currentPlayer.direction.x * 2, // Changed from 1 to 2 units back
                        4,
                        -this.currentPlayer.direction.z * 2  // Changed from 1 to 2 units back
                    );
                    this.camera.position.copy(this.currentPlayer.mesh.position).add(offset);
                    
                    // Look in the direction the player is facing, but at the same height as the camera
                    const lookAtPoint = new THREE.Vector3(
                        this.currentPlayer.mesh.position.x + this.currentPlayer.direction.x,
                        this.camera.position.y, // Look at same height as camera
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
                                
                                if (this.keys['ArrowLeft']) steering -= 1;
                                if (this.keys['ArrowRight']) steering += 1;
                                if (this.keys['ArrowUp']) throttle += 1;
                                if (this.keys['ArrowDown']) throttle -= 1;
                                
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
                            laser.mesh.material.forEach(mat => {
                                if (mat) {
                                    mat.dispose();
                                    mat = null;
                                }
                            });
                        } else {
                            laser.mesh.material.dispose();
                            laser.mesh.material = null;
                        }
                    }
                    if (laser.mesh.geometry) {
                        laser.mesh.geometry.dispose();
                        laser.mesh.geometry = null;
                    }
                    laser.mesh = null;
                }
                laser.isDead = true;
            }
        }
        
        // Second pass: clear the lasers Map and active IDs
        this.lasers.clear();
        this.activeLaserIds.clear();
        
        // Force a garbage collection hint
        if (window.gc) {
            window.gc();
        }
        
        console.log(`Laser cleanup complete. Removed ${initialCount} lasers`);
    }

    // Add periodic laser validation
    validateLasers() {
        const currentTime = Date.now();
        let removedCount = 0;
        
        // Check for lasers that haven't received server updates
        for (const [id, laser] of this.lasers.entries()) {
            if (!laser) {
                console.log('Removing null laser:', id);
                this.lasers.delete(id);
                removedCount++;
                continue;
            }
            
            // If laser is too old or hasn't received server updates
            if (currentTime - laser.birthTime > LASER_DURATION * 1.5 || // 1.5x normal duration
                currentTime - laser.lastServerUpdate > 1000) { // No server update in 1 second
                console.log('Removing stale laser:', id, {
                    age: currentTime - laser.birthTime,
                    lastUpdate: currentTime - laser.lastServerUpdate
                });
                laser.die();
                this.lasers.delete(id);
                removedCount++;
            }
        }
        
        // Remove lasers that aren't in activeLaserIds
        for (const [id, laser] of this.lasers.entries()) {
            if (!this.activeLaserIds.has(id)) {
                console.log('Removing inactive laser:', id);
                laser.die();
                this.lasers.delete(id);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            console.log(`Removed ${removedCount} lasers during validation`);
        }
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
        
        // Create survival time display
        this.createSurvivalDisplay();

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
            if (!laser || !laser.mesh) continue;
            
            // Get positions
            const playerPos = this.mesh.position;
            const laserPos = laser.mesh.position;
            
            // Calculate distance on XZ plane
            const dx = playerPos.x - laserPos.x;
            const dz = playerPos.z - laserPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Hit if within combined radii
            const hitDistance = SNOWMAN_SIZE + LASER_RADIUS;
            if (distance < hitDistance) {
                console.log(`HIT DETECTED! Player ${this.id} hit by laser ${id}`);
                console.log(`Player pos: (${playerPos.x.toFixed(2)}, ${playerPos.z.toFixed(2)})`);
                console.log(`Laser pos: (${laserPos.x.toFixed(2)}, ${laserPos.z.toFixed(2)})`);
                console.log(`Distance: ${distance.toFixed(2)}, Hit distance: ${hitDistance.toFixed(2)}`);
                return true;
            }
        }
        return false;
    }
    
    die() {
        if (!this.isDead && !this.isInvulnerable) {
            console.log('Player died:', this.id);
            this.isDead = true;
            
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
                            <li>Arrow keys to move</li>
                            <li>V to change view</li>
                            <li>M to mute sound</li>
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
        
        // Get the correct player color
        const playerColor = PLAYER_COLORS[parseInt(this.id) % 10] || 0xFF0000;
        
        // Reset movement state
        this.speed = 0;
        this.velocity.set(0, 0, 0);
        this.direction.set(0, 0, 1);
        
        // Update prism rotation to match direction
        this.prism.rotation.y = Math.atan2(this.direction.x, this.direction.z);
        
        // Reset color to original
        if (Array.isArray(this.prism.material)) {
            this.prism.material[0].color.set(playerColor);
            this.prism.material[1].color.set(playerColor * 0.8);
            this.prism.material[2].color.set(Math.min(playerColor * 1.2, 0xFFFFFF));
        } else {
            this.prism.material.color.set(playerColor);
        }
        
        // Reset keyboard state if this is the current player
        if (this.game && this.id === this.game.socket.id) {
            this.game.keys = {
                'ArrowUp': false,
                'ArrowDown': false,
                'ArrowLeft': false,
                'ArrowRight': false
            };
        }
    }
}

class Snowman {
    constructor(scene, color, game) {
        this.scene = scene;
        this.game = game;
        this.mesh = new THREE.Group();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.lastUpdateTime = Date.now();
        this.positionHistory = [];
        this.maxHistoryLength = 10;
        this.interpolationDelay = 100; // 100ms interpolation delay
        this.color = color; // Store the color
        
        // Create snowman body parts
        const bodyGeometry = new THREE.SphereGeometry(1, 32, 32);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: this.color });
        
        // Bottom sphere (largest)
        const bottom = new THREE.Mesh(bodyGeometry, bodyMaterial);
        bottom.scale.set(1, 1, 1);
        bottom.position.y = 1;
        this.mesh.add(bottom);
        
        // Middle sphere
        const middle = new THREE.Mesh(bodyGeometry, bodyMaterial);
        middle.scale.set(0.8, 0.8, 0.8);
        middle.position.y = 2.2;
        this.mesh.add(middle);
        
        // Head sphere
        const head = new THREE.Mesh(bodyGeometry, bodyMaterial);
        head.scale.set(0.6, 0.6, 0.6);
        head.position.y = 3.2;
        this.mesh.add(head);
        
        // Add to scene
        this.scene.add(this.mesh);
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
    }
    
    updateFromServer(position, velocity) {
        const currentTime = Date.now();
        
        // Store the server position and velocity
        this.targetPosition = position;
        this.targetVelocity = velocity;
        
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
        this.mesh.position.y = 2.4;
        this.scene.add(this.mesh);
        this.birthTime = Date.now();
        this.lastServerUpdate = Date.now();
        this.isDead = false;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.lastPosition = new THREE.Vector3().copy(position);
        this.stationaryTime = 0;
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
            if (this.mesh) {
                if (this.mesh.parent) {
                    this.scene.remove(this.mesh);
                }
                if (this.mesh.material) {
                    if (Array.isArray(this.mesh.material)) {
                        this.mesh.material.forEach(mat => {
                            if (mat) {
                                mat.dispose();
                                mat = null;
                            }
                        });
                    } else {
                        this.mesh.material.dispose();
                        this.mesh.material = null;
                    }
                }
                if (this.mesh.geometry) {
                    this.mesh.geometry.dispose();
                    this.mesh.geometry = null;
                }
                this.mesh = null;
            }
        }
    }
    
    updateFromServer(position, velocity) {
        if (this.isDead) return;
        
        // Update position and velocity
        this.mesh.position.copy(position);
        this.mesh.position.y = 2.4; // Ensure height is maintained at 2.4 units
        this.velocity.copy(velocity);
        this.lastServerUpdate = Date.now(); // Update server update timestamp
        
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
        
        // Reset keyboard state
        window.game.keys = {
            'ArrowUp': false,
            'ArrowDown': false,
            'ArrowLeft': false,
            'ArrowRight': false
        };
        
        // Always show respawn screen when tabbing back in
        const countdownScreen = document.getElementById('countdownScreen');
        const countdownElement = document.getElementById('countdown');
        if (countdownScreen && countdownElement) {
            countdownScreen.style.display = 'flex';
            countdownElement.innerHTML = `
                <div>The snowmen are tryin' to blast you. Be the best Lazer Avoider!</div>
                <div id="countdown">Hit any key to respawn</div>
                <div id="controls">
                    <ul>
                        <li>Arrow keys to move</li>
                        <li>V to change view</li>
                        <li>M to mute sound</li>
                        <li>Enter to chat</li>
                    </ul>
                </div>
            `;
        }
    } else if (document.hidden && window.game) {
        // When tab is hidden, kill player and cleanup
        if (window.game.currentPlayer) {
            window.game.currentPlayer.isDead = true;
            if (Array.isArray(window.game.currentPlayer.prism.material)) {
                window.game.currentPlayer.prism.material.forEach(mat => {
                    mat.color.set(0x808080);
                });
            } else {
                window.game.currentPlayer.prism.material.color.set(0x808080);
            }
            window.game.currentPlayer.currentSurvivalTime = 0;
            window.game.currentPlayer.lastDeathTime = Date.now();
            window.game.socket.emit('playerDied');
        }
        // Force cleanup all lasers
        window.game.cleanupLasers();
    }
}); 