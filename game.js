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
const LASER_DURATION = 2500; // Increased from 2000 to 2500 (25% increase)
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
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue background
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        this.players = new Map();
        this.snowmen = [];
        this.lasers = [];
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.currentView = 'top'; // 'top', 'isometric', 'first-person'
        this.isMuted = false;
        this.currentSong = Math.floor(Math.random() * 24); // Random number 0-23
        this.songs = Array.from({length: 24}, (_, i) => 
            `https://www.bachcentral.com/WTCBkI/Fugue${i + 1}.mid`
        );
        
        // Initialize audio with proper settings
        this.audio = new Audio();
        this.audio.autoplay = false;
        this.audio.src = this.songs[this.currentSong];
        this.audio.loop = false; // Don't loop individual songs
        this.audio.load(); // Preload the audio
        
        // Add event listener for when a song ends
        this.audio.addEventListener('ended', () => {
            console.log('Song ended, playing next song');
            this.currentSong = (this.currentSong + 1) % 24;
            this.audio.src = this.songs[this.currentSong];
            this.audio.load();
            if (!this.isMuted && this.hasUserInteracted) {
                this.audio.play().then(() => {
                    console.log('Next song started successfully');
                }).catch(error => {
                    console.log('Audio play failed:', error);
                });
            }
        });
        
        this.laserSound = new Audio('laser.mp3');
        this.laserSound.autoplay = false;
        
        // Add user interaction flag
        this.hasUserInteracted = false;
        
        this.gamepad = null;
        this.gamepadIndex = null;
        this.leftJoystick = null;
        this.rightJoystick = null;
        
        this.setupScene();
        this.setupControls();
        this.setupEventListeners();
        this.setupSocket();
        this.setupGamepad();
        
        this.animate();
        window.game = this; // Make game instance accessible globally
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
        if (this.isMobile) {
            this.setupMobileControls();
            // Show mobile controls
            document.getElementById('mobileControls').style.display = 'block';
            document.getElementById('mobileButtons').style.display = 'block';
            // Make sure joysticks are visible
            document.getElementById('leftJoystick').style.display = 'block';
            document.getElementById('rightJoystick').style.display = 'block';
        } else {
            this.setupKeyboardControls();
            // Hide mobile controls on desktop
            document.getElementById('mobileControls').style.display = 'none';
            document.getElementById('mobileButtons').style.display = 'none';
        }
    }
    
    setupMobileControls() {
        // Left joystick for movement
        const leftOptions = {
            zone: document.getElementById('leftJoystick'),
            mode: 'static',
            position: { left: '25%', bottom: '25%' },
            color: 'white',
            size: 120
        };
        
        this.leftJoystick = nipplejs.create(leftOptions);
        this.leftJoystick.on('move', (evt, data) => {
            if (this.currentPlayer) {
                this.currentPlayer.move(data.vector.x, data.vector.y);
            }
        });
        
        // Right joystick for camera control
        const rightOptions = {
            zone: document.getElementById('rightJoystick'),
            mode: 'static',
            position: { right: '25%', bottom: '25%' },
            color: 'white',
            size: 120
        };
        
        this.rightJoystick = nipplejs.create(rightOptions);
        this.rightJoystick.on('move', (evt, data) => {
            if (this.currentView === 'first-person' && this.currentPlayer) {
                // Rotate camera based on joystick position
                const angle = Math.atan2(data.vector.y, data.vector.x);
                this.currentPlayer.direction.x = Math.cos(angle);
                this.currentPlayer.direction.z = Math.sin(angle);
            }
        });
    }
    
    setupKeyboardControls() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'v' || e.key === 'V') {
                this.cycleView();
            } else if (e.key === 's' || e.key === 'S') {
                this.changeSong();
            } else if (e.key === 'm' || e.key === 'M') {
                this.toggleMute();
            }
        });
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
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
            this.isRoundInProgress = state.isRoundInProgress;
            
            // If joining during an active round, go to spectator mode
            if (this.isRoundInProgress && this.players.size > 1) {
                document.getElementById('countdownScreen').style.display = 'block';
                document.getElementById('countdown').textContent = 'Spectator Mode';
                document.getElementById('controls').style.display = 'none';
                if (this.currentPlayer) {
                    this.currentPlayer.isDead = true;
                    this.currentPlayer.baseCube.material.color.set(0x808080);
                    this.currentPlayer.topCube.material.color.set(0x808080);
                }
            } else {
                // If it's a new round or we're the only player, start normally
                document.getElementById('countdownScreen').style.display = 'none';
                document.getElementById('controls').style.display = 'block';
                if (this.currentPlayer) {
                    this.currentPlayer.isDead = false;
                    this.currentPlayer.baseCube.material.color.set(PLAYER_COLORS[parseInt(this.currentPlayer.id) % 10] || 0xFFFFFF);
                    this.currentPlayer.topCube.material.color.set(PLAYER_COLORS[parseInt(this.currentPlayer.id) % 10] || 0xFFFFFF);
                }
            }
            
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
        
        this.socket.on('roundStart', () => {
            console.log('Round starting');
            // Clear any spectator mode or round end messages
            document.getElementById('countdownScreen').style.display = 'none';
            document.getElementById('controls').style.display = 'block';
            
            // Reset all players and start invulnerability
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
            
            // Start music if not muted and user has interacted
            if (!this.isMuted && this.hasUserInteracted) {
                this.audio.play().catch(error => {
                    console.log('Audio play failed:', error);
                });
            }
        });
        
        this.socket.on('roundEnd', () => {
            console.log('Round ended - all players are dead');
            // Show round end message
            document.getElementById('countdownScreen').style.display = 'block';
            document.getElementById('countdown').textContent = 'Round Over!';
            document.getElementById('controls').style.display = 'none';
            
            // Start countdown to next round
            let count = 3;
            const countdownElement = document.getElementById('countdown');
            const countdownInterval = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownElement.textContent = count;
                } else {
                    clearInterval(countdownInterval);
                }
            }, 1000);
        });
        
        // Add snowman position sync
        this.socket.on('snowmanUpdate', (snowmanData) => {
            snowmanData.forEach((data, index) => {
                if (this.snowmen[index]) {
                    // Directly set position from server data
                    this.snowmen[index].mesh.position.set(
                        data.position.x,
                        data.position.y,
                        data.position.z
                    );
                    // Store velocity for visual updates only
                    this.snowmen[index].velocity.set(
                        data.velocity.x,
                        data.velocity.y,
                        data.velocity.z
                    );
                }
            });
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
                    // Position camera 10 units back and 3 units up from player
                    const offset = new THREE.Vector3(
                        -this.currentPlayer.direction.x * 10,
                        3,
                        -this.currentPlayer.direction.z * 10
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
    
    changeSong() {
        console.log('Changing song');
        this.currentSong = (this.currentSong + 1) % 24;
        this.audio.src = this.songs[this.currentSong];
        this.audio.load(); // Preload the new song
        if (!this.isMuted && this.hasUserInteracted) {
            this.audio.play().then(() => {
                console.log('New song started successfully');
            }).catch(error => {
                console.log('Audio play failed:', error);
            });
        }
    }
    
    toggleMute() {
        console.log('Toggling mute');
        this.isMuted = !this.isMuted;
        this.audio.muted = this.isMuted;
        this.laserSound.muted = this.isMuted;
        
        // If unmuting and we have user interaction, try to play
        if (!this.isMuted && this.hasUserInteracted) {
            this.audio.play().then(() => {
                console.log('Music resumed after unmuting');
            }).catch(error => {
                console.log('Audio play failed:', error);
            });
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update gamepad state
        if (this.gamepad) {
            this.gamepad = navigator.getGamepads()[this.gamepadIndex];
            if (this.gamepad && this.currentPlayer && !this.currentPlayer.isDead && this.isRoundInProgress) {
                // Left stick for movement
                const moveX = this.gamepad.axes[0];
                const moveZ = this.gamepad.axes[1];
                if (Math.abs(moveX) > 0.1 || Math.abs(moveZ) > 0.1) {
                    this.currentPlayer.move(moveX, moveZ);
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
                if (this.gamepad.buttons[1].pressed) { // B button
                    this.changeSong();
                }
                if (this.gamepad.buttons[2].pressed) { // X button
                    this.toggleMute();
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
            // Update player state (including invulnerability)
            player.update();
            
            if (player === this.currentPlayer && !player.isDead && this.isRoundInProgress) {
                // Handle keyboard input for current player
                if (!this.isMobile && !this.gamepad) {
                    const moveX = (this.keys['ArrowRight'] ? 1 : 0) - (this.keys['ArrowLeft'] ? 1 : 0);
                    const moveZ = (this.keys['ArrowDown'] ? 1 : 0) - (this.keys['ArrowUp'] ? 1 : 0);
                    if (moveX !== 0 || moveZ !== 0) {
                        player.move(moveX, moveZ);
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
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Add click/tap listener for first interaction
        const startInteraction = (event) => {
            event.preventDefault(); // Prevent default touch behavior
            if (!this.hasUserInteracted) {
                console.log('User interaction detected');
                this.hasUserInteracted = true;
                // Hide loading screen
                document.getElementById('loadingScreen').style.display = 'none';
                
                // Start music if not muted
                if (!this.isMuted) {
                    console.log('Attempting to play music');
                    this.audio.play().then(() => {
                        console.log('Music started successfully');
                    }).catch(error => {
                        console.log('Audio play failed:', error);
                    });
                }
                
                // Now handle the game state
                if (this.isRoundInProgress && this.players.size > 1) {
                    // Only go to spectator mode if round is in progress AND there are other players
                    document.getElementById('countdownScreen').style.display = 'block';
                    document.getElementById('countdown').textContent = 'Spectator Mode';
                    document.getElementById('controls').style.display = 'none';
                } else {
                    // Start new round
                    this.startNewRound();
                }
                
                // Remove the listeners after first interaction
                document.removeEventListener('click', startInteraction);
                document.removeEventListener('touchstart', startInteraction);
            }
        };
        
        // Add both click and touchstart listeners
        document.addEventListener('click', startInteraction);
        document.addEventListener('touchstart', startInteraction, { passive: false });
        
        // Setup keyboard controls
        this.keys = {};
        document.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'v' || e.key === 'V') {
                this.cycleView();
            } else if (e.key === 's' || e.key === 'S') {
                this.changeSong();
            } else if (e.key === 'm' || e.key === 'M') {
                this.toggleMute();
            }
        });
        document.addEventListener('keyup', (e) => this.keys[e.key] = false);
        
        if (this.isMobile) {
            document.getElementById('viewButton').addEventListener('click', () => this.cycleView());
            document.getElementById('muteButton').addEventListener('click', () => this.toggleMute());
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
        this.direction = new THREE.Vector3(0, 0, 1);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = 0.005; // Reduced for more gradual acceleration
        this.maxSpeed = 0.15; // Reduced for better control
        this.driftFactor = 0.95; // Higher means more drift
        this.friction = 0.98; // Reduced for more momentum
        this.turnSpeed = 0.1; // Speed at which the player can turn
        this.isDead = false;
        this.isInvulnerable = false;
        this.invulnerabilityStartTime = 0;
        this.originalColors = {
            base: PLAYER_COLORS[parseInt(id) % 10] || 0xFFFFFF,
            top: PLAYER_COLORS[parseInt(id) % 10] || 0xFFFFFF
        };
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
    
    move(x, z) {
        if (this.isDead) return;
        
        // Calculate target direction based on input
        const targetDirection = new THREE.Vector3(x, 0, z).normalize();
        
        // Gradually rotate current direction towards target direction
        if (x !== 0 || z !== 0) {
            this.direction.lerp(targetDirection, this.turnSpeed);
            this.direction.normalize();
            
            // Apply acceleration in the direction we're facing
            this.velocity.x += this.direction.x * this.acceleration;
            this.velocity.z += this.direction.z * this.acceleration;
            
            // Rotate the top cube to face the direction of movement
            this.topCube.rotation.y = Math.atan2(this.direction.x, this.direction.z);
        }
        
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
        
        // Limit maximum speed
        const currentSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
        if (currentSpeed > this.maxSpeed) {
            const scale = this.maxSpeed / currentSpeed;
            this.velocity.x *= scale;
            this.velocity.z *= scale;
        }
        
        // Update position based on velocity
        this.mesh.position.x += this.velocity.x;
        this.mesh.position.z += this.velocity.z;
        
        // Keep player within arena bounds with bounce effect
        if (Math.abs(this.mesh.position.x) > ARENA_SIZE/2 - PLAYER_SIZE) {
            this.mesh.position.x = Math.sign(this.mesh.position.x) * (ARENA_SIZE/2 - PLAYER_SIZE);
            this.velocity.x *= -0.5;
        }
        if (Math.abs(this.mesh.position.z) > ARENA_SIZE/2 - PLAYER_SIZE) {
            this.mesh.position.z = Math.sign(this.mesh.position.z) * (ARENA_SIZE/2 - PLAYER_SIZE);
            this.velocity.z *= -0.5;
        }
    }
    
    updatePosition(position) {
        this.mesh.position.copy(position);
    }
    
    update() {
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
        this.isInvulnerable = true;
        this.invulnerabilityStartTime = Date.now();
    }

    checkLaserHit(laser) {
        if (this.isInvulnerable) return false;
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
                
                // Show spectator mode for this player
                document.getElementById('countdownScreen').style.display = 'block';
                document.getElementById('countdown').textContent = 'Spectator Mode';
                document.getElementById('controls').style.display = 'none';
            }
        }
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
        
        // Add eyes and nose
        const eyeGeometry = new THREE.SphereGeometry(0.1);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const noseGeometry = new THREE.ConeGeometry(0.1, 0.2);
        const noseMaterial = new THREE.MeshBasicMaterial({ color: 0xFFA500 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        
        leftEye.position.set(-0.2, SNOWMAN_SIZE * 1.5, SNOWMAN_SIZE * 0.8);
        rightEye.position.set(0.2, SNOWMAN_SIZE * 1.5, SNOWMAN_SIZE * 0.8);
        nose.position.set(0, SNOWMAN_SIZE * 1.4, SNOWMAN_SIZE * 0.8);
        nose.rotation.x = -Math.PI / 2;
        
        this.mesh.add(leftEye, rightEye, nose);
        
        this.scene.add(this.mesh);
        
        // Initialize movement with doubled speed
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.1, // Doubled from 0.05 to 0.1
            0,
            (Math.random() - 0.5) * 0.1  // Doubled from 0.05 to 0.1
        );
        
        this.lastFireTime = 0;
        this.nextFireTime = this.getNextFireTime();
    }
    
    getNextFireTime() {
        return Date.now() + Math.random() * (SNOWMAN_FIRE_INTERVAL.max - SNOWMAN_FIRE_INTERVAL.min) + SNOWMAN_FIRE_INTERVAL.min;
    }
    
    update() {
        // Move snowman
        this.mesh.position.add(this.velocity);
        
        // Bounce off walls
        if (Math.abs(this.mesh.position.x) > ARENA_SIZE/2 - SNOWMAN_SIZE) {
            this.velocity.x *= -1;
        }
        if (Math.abs(this.mesh.position.z) > ARENA_SIZE/2 - SNOWMAN_SIZE) {
            this.velocity.z *= -1;
        }
        
        // Fire laser
        if (Date.now() > this.nextFireTime) {
            this.fireLaser();
            this.lastFireTime = Date.now();
            this.nextFireTime = this.getNextFireTime();
        }
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
        if (!this.game.isMuted) {
            this.game.laserSound.currentTime = 0;
            this.game.laserSound.play();
        }
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
        
        // Add velocity for movement
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.3, // Random x direction
            0,
            (Math.random() - 0.5) * 0.3  // Random z direction
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
    const game = new Game();
}); 