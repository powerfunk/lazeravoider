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
const ARENA_SIZE = 177;
const SNOWMAN_COLORS = [0x800080, 0x0000FF, 0x00FF00]; // Purple, Blue, Green
const LASER_COLOR = 0xFF69B4; // Pink
const SNOWMAN_SIZE = 1;
const PLAYER_SIZE = 0.5;
const LASER_INITIAL_SIZE = 1.0;
const LASER_DURATION = 2500;
const PLAYER_SPEED = {
    normal: 0.03,
    vehicle: 0.06
};
const PLAYER_TURN_SPEED = 0.1;
const PLAYER_MOMENTUM = 0.95; // Higher = more momentum
const SNOWMAN_FIRE_INTERVAL = { min: 1500, max: 2500 }; // 1.5-2.5 seconds
const SNOWMAN_FACE_PLAYER_CHANCE = 0.2; // 20% chance
const VEHICLE_LASER_COOLDOWN = 2000; // 2 seconds cooldown
const VEHICLE_LASER_DURATION = 1000; // 1 second active time
const SNOWMAN_SPEED = 0.04; // Quadrupled from 0.01 to 0.04
const SNOWMAN_DIRECTION_CHANGE_INTERVAL = 3000; // Change direction every 3 seconds
const PLAYER_HEALTH = 100;
const SNOWMAN_HEALTH = 100;
const SNOWMAN_RESPAWN_FLASH_INTERVAL = 100; // Flash every 100ms
const SNOWMAN_RESPAWN_INVULNERABLE_TIME = 2000; // 2 seconds invulnerable
const LASER_COOLDOWN = 10000; // 10 seconds cooldown

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
        
        // Create snowmen
        SNOWMAN_COLORS.forEach(color => {
            const snowman = new Snowman(this.scene, color, this);
            this.snowmen.push(snowman);
        });
        
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.currentView = 'normal'; // 'normal' or 'vehicle'
        this.isMuted = false;
        this.currentSong = Math.floor(Math.random() * 25); // Random number 0-24
        this.songs = [
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
        
        this.audio = new Audio(this.songs[this.currentSong]);
        this.audio.autoplay = false;
        this.audio.loop = false; // Don't loop the current song
        this.audio.addEventListener('ended', () => {
            this.currentSong = (this.currentSong + 1) % this.songs.length;
            this.audio.src = this.songs[this.currentSong];
            if (!this.isMuted && this.hasUserInteracted) {
                this.audio.play().catch(error => {
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
        
        this.playerMomentum = new THREE.Vector3(0, 0, 0);
        
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
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(3, 3);
        const floorGeometry = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
        const floorMaterial = new THREE.MeshBasicMaterial({ 
            map: floorTexture
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        
        // Walls
        const wallTexture = new THREE.TextureLoader().load('wall.jpg');
        wallTexture.wrapS = THREE.RepeatWrapping;
        wallTexture.wrapT = THREE.RepeatWrapping;
        wallTexture.repeat.set(3, 1);
        const wallMaterial = new THREE.MeshBasicMaterial({ 
            map: wallTexture
        });
        
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
        
        // Set initial camera position
        this.updateCameraView();
    }
    
    setupControls() {
        if (this.isMobile) {
            // Check if mobile control elements exist before setting up
            const leftJoystick = document.getElementById('leftJoystick');
            const rightJoystick = document.getElementById('rightJoystick');
        const mobileControls = document.getElementById('mobileControls');
        const mobileButtons = document.getElementById('mobileButtons');
            
            if (leftJoystick && rightJoystick && mobileControls && mobileButtons) {
                this.setupMobileControls();
                // Show mobile controls only on mobile
                mobileControls.style.display = 'block';
                mobileButtons.style.display = 'block';
            } else {
                console.warn('Mobile control elements not found, falling back to keyboard controls');
                this.setupKeyboardControls();
            }
        } else {
            this.setupKeyboardControls();
            // Hide mobile controls on desktop
            const mobileControls = document.getElementById('mobileControls');
            const mobileButtons = document.getElementById('mobileButtons');
            if (mobileControls) mobileControls.style.display = 'none';
            if (mobileButtons) mobileButtons.style.display = 'none';
        }
    }
    
    setupMobileControls() {
        // Left joystick for acceleration/braking in vehicle mode, movement in normal mode
        const leftOptions = {
            zone: document.getElementById('leftJoystick'),
            mode: 'static',
            position: { left: '25%', bottom: '25%' },
            color: 'white',
            size: 120
        };
        
        this.leftJoystick = nipplejs.create(leftOptions);
        this.leftJoystick.on('move', (evt, data) => {
            if (this.currentPlayer && !this.currentPlayer.isDead) {
                const moveSpeed = this.currentView === 'vehicle' ? PLAYER_SPEED.vehicle : PLAYER_SPEED.normal;
                
                if (this.currentView === 'normal') {
                    // Absolute controls in normal mode
                    this.currentPlayer.move(data.vector.x * moveSpeed, data.vector.y * moveSpeed);
            } else {
                    // In vehicle mode, left stick controls acceleration/braking
                    const magnitude = Math.min(1, Math.sqrt(data.vector.x * data.vector.x + data.vector.y * data.vector.y));
                    const isBraking = data.vector.y > 0; // Forward on stick is braking
                    
                    if (isBraking) {
                        // Apply braking force (reverse momentum)
                        this.playerMomentum.x *= 0.9;
                        this.playerMomentum.z *= 0.9;
            } else {
                        // Apply acceleration in current direction
                        this.playerMomentum.x = this.currentPlayer.direction.x * moveSpeed * magnitude;
                        this.playerMomentum.z = this.currentPlayer.direction.z * moveSpeed * magnitude;
                    }
                }
            }
        });
        
        // Right joystick for steering in vehicle mode, camera in normal mode
        const rightOptions = {
            zone: document.getElementById('rightJoystick'),
            mode: 'static',
            position: { right: '25%', bottom: '25%' },
            color: 'white',
            size: 120
        };
        
        this.rightJoystick = nipplejs.create(rightOptions);
        this.rightJoystick.on('move', (evt, data) => {
                    if (this.currentPlayer && !this.currentPlayer.isDead) {
                if (this.currentView === 'vehicle') {
                    // In vehicle mode, right stick controls steering
                    const turnSpeed = PLAYER_TURN_SPEED * Math.min(1, Math.sqrt(data.vector.x * data.vector.x + data.vector.y * data.vector.y));
                    this.currentPlayer.mesh.rotation.y -= data.vector.x * turnSpeed;
                    this.currentPlayer.direction.x = Math.sin(this.currentPlayer.mesh.rotation.y);
                    this.currentPlayer.direction.z = Math.cos(this.currentPlayer.mesh.rotation.y);
                }
            }
        });
        
        // Fire button
        const fireButton = document.getElementById('fireButton');
        if (fireButton) {
            fireButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                if (this.currentPlayer && !this.currentPlayer.isDead) {
                    this.currentPlayer.fireLaser();
                }
            });
        }
        
        // View toggle button
        const viewButton = document.getElementById('viewButton');
        if (viewButton) {
            viewButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                this.cycleView();
            });
        }
    }
    
    setupKeyboardControls() {
        this.keys = {};
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }
    
    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        // Add click/tap listener for first interaction
        const startInteraction = () => {
            if (!this.hasUserInteracted) {
                this.hasUserInteracted = true;
                // Start music if not muted
                if (!this.isMuted) {
                    this.audio.play().catch(error => {
                        console.log('Audio play failed:', error);
                    });
                }
                // Remove the listener after first interaction
                document.removeEventListener('click', startInteraction);
                document.removeEventListener('touchstart', startInteraction);
            }
        };
        
        document.addEventListener('click', startInteraction);
        document.addEventListener('touchstart', startInteraction);
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'v' || e.key === 'V') {
                this.cycleView();
            } else if (e.key === 's' || e.key === 'S') {
                this.changeSong();
            } else if (e.key === 'm' || e.key === 'M') {
                this.toggleMute();
            }
        });
        
        if (this.isMobile) {
            document.getElementById('viewButton').addEventListener('click', () => this.cycleView());
            document.getElementById('muteButton').addEventListener('click', () => this.toggleMute());
        }
    }
    
    setupSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            
            // Get player name from input
            const nameInput = document.getElementById('nameInput');
            const playerName = nameInput ? nameInput.value.trim() : 'Player';
            
            // Clean up any existing player for this ID
            if (this.currentPlayer) {
                this.currentPlayer.remove();
                this.players.delete(this.socket.id);
            }
            
            // Create current player
            this.currentPlayer = new Player(this.scene, this.socket.id);
            this.currentPlayer.name = playerName;
            this.currentPlayer.updateNameTag();
            this.players.set(this.socket.id, this.currentPlayer);
            
            // Emit player name to server
            this.socket.emit('playerName', playerName);
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
                if (id !== this.socket.id) {
                    let player = this.players.get(id);
                    if (!player) {
                        console.log('Creating new player:', id);
                        player = new Player(this.scene, id);
                        this.players.set(id, player);
                    }
                    player.updatePosition({
                        position: data.position,
                        direction: data.direction,
                        rotation: data.rotation,
                        name: data.name,
                        kills: data.kills,
                        deaths: data.deaths
                    });
                }
            });
        });

        this.socket.on('playerFired', (data) => {
            const player = this.players.get(data.id);
            if (player && !player.isDead) {
                const laser = new Laser(this.scene, data.position, data.direction, data.isVehicleMode);
                this.lasers.push(laser);
                
                // If it's a vehicle mode laser, set up its duration
                if (data.isVehicleMode) {
                    setTimeout(() => {
                        this.lasers = this.lasers.filter(l => {
                            if (l === laser) {
                                l.scene.remove(l.mesh);
                                return false;
                            }
                            return true;
                        });
                    }, VEHICLE_LASER_DURATION);
                }
            }
        });

        this.socket.on('playerKilled', (data) => {
            const killedPlayer = this.players.get(data.killedId);
            const killerPlayer = this.players.get(data.killerId);
            
            if (killedPlayer) {
                killedPlayer.die();
            }
            
            if (killerPlayer) {
                killerPlayer.kills++;
                killerPlayer.updateNameTag();
            }
        });

        this.socket.on('snowmanKilled', (data) => {
            const killerPlayer = this.players.get(data.killerId);
            if (killerPlayer) {
                killerPlayer.kills++;
                killerPlayer.updateNameTag();
            }
        });
    }
    
    setupGamepad() {
        window.addEventListener("gamepadconnected", (e) => {
            console.log("Gamepad connected:", e.gamepad);
            this.gamepadIndex = e.gamepad.index;
            this.gamepad = navigator.getGamepads()[this.gamepadIndex];
            
            // Add gamepad button handler for respawn
            const gamepadRespawnHandler = () => {
                if (this.currentPlayer && this.currentPlayer.isDead) {
                    const respawnEvent = new Event('keydown');
                    document.dispatchEvent(respawnEvent);
                }
            };
            
            // Check gamepad buttons in animation loop
            this.checkGamepadRespawn = gamepadRespawnHandler;
        });
        
        window.addEventListener("gamepaddisconnected", (e) => {
            console.log("Gamepad disconnected:", e.gamepad);
            if (e.gamepad.index === this.gamepadIndex) {
                this.gamepad = null;
                this.gamepadIndex = null;
                this.checkGamepadRespawn = null;
            }
        });
    }
    
    updateCameraView() {
        if (this.currentView === 'normal') {
            // Isometric-like view but less rotated, adjusted for larger arena
            this.camera.position.set(0, 45, 45); // Increased height and distance
                this.camera.lookAt(0, 0, 0);
        } else {
            // First-person vehicle view
                if (this.currentPlayer) {
                this.camera.position.copy(this.currentPlayer.mesh.position);
                this.camera.position.y += 1;
                
                // Calculate look target with upward tilt
                const lookTarget = new THREE.Vector3(
                        this.currentPlayer.mesh.position.x + this.currentPlayer.direction.x,
                    this.currentPlayer.mesh.position.y + 0.5, // Look up by 0.5 units
                        this.currentPlayer.mesh.position.z + this.currentPlayer.direction.z
                    );
                this.camera.lookAt(lookTarget);
                }
        }
    }
    
    cycleView() {
        this.currentView = this.currentView === 'normal' ? 'vehicle' : 'normal';
        
        if (this.currentPlayer) {
            if (this.currentView === 'vehicle') {
                // Change to dodecahedron with gradient faces
                this.currentPlayer.mesh.geometry.dispose();
                this.currentPlayer.mesh.geometry = new THREE.DodecahedronGeometry(PLAYER_SIZE);
                
                // Create array of materials for each face
                const materials = [];
                const baseColor = new THREE.Color(this.currentPlayer.color);
                
                // Create 12 slightly different shades
                for (let i = 0; i < 12; i++) {
                    const shade = baseColor.clone();
                    // Vary the brightness by ±15%
                    const brightness = 1 + (Math.random() * 0.3 - 0.15);
                    shade.r *= brightness;
                    shade.g *= brightness;
                    shade.b *= brightness;
                    materials.push(new THREE.MeshBasicMaterial({ color: shade }));
                }
                
                // Apply materials to the dodecahedron
                this.currentPlayer.mesh.material = materials;
            } else {
                // Change back to cube
                this.currentPlayer.mesh.geometry.dispose();
                this.currentPlayer.mesh.geometry = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
                this.currentPlayer.mesh.material = new THREE.MeshBasicMaterial({ color: this.currentPlayer.color });
            }
        }
        
        this.updateCameraView();
    }
    
    changeSong() {
        this.currentSong = (this.currentSong + 1) % this.songs.length;
        this.audio.src = this.songs[this.currentSong];
        if (!this.isMuted && this.hasUserInteracted) {
            this.audio.play().catch(error => {
                console.log('Audio play failed:', error);
                                    });
                                }
                            }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.audio.muted = this.isMuted;
        this.laserSound.muted = this.isMuted;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Check for gamepad respawn
        if (this.checkGamepadRespawn && this.gamepad) {
            const gamepad = navigator.getGamepads()[this.gamepadIndex];
            if (gamepad) {
                // Check if any button is pressed
                if (gamepad.buttons.some(button => button.pressed)) {
                    this.checkGamepadRespawn();
                }
            }
        }
        
        // Update snowmen
        this.snowmen.forEach(snowman => snowman.update());
        
        // Update lasers
        this.lasers = this.lasers.filter(laser => !laser.update());
        
        // Update player movement with momentum
        if (this.currentPlayer && !this.currentPlayer.isDead) {
            // Update laser cooldown
            this.currentPlayer.updateLaserCooldown();
            
            const moveSpeed = this.currentView === 'vehicle' ? PLAYER_SPEED.vehicle : PLAYER_SPEED.normal;
            let moveX = 0;
            let moveZ = 0;
            
            // Handle keyboard controls
            if (this.currentView === 'normal') {
                // Absolute controls
                if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) moveX -= moveSpeed;
                if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) moveX += moveSpeed;
                if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) moveZ -= moveSpeed;
                if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) moveZ += moveSpeed;
                
                // Handle firing in normal mode
                if (this.keys[' ']) {
                    this.currentPlayer.fireLaser();
                }
            } else {
                // Relative controls with momentum
                if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) {
                    this.currentPlayer.mesh.rotation.y += PLAYER_TURN_SPEED;
                    this.currentPlayer.direction.x = Math.sin(this.currentPlayer.mesh.rotation.y);
                    this.currentPlayer.direction.z = Math.cos(this.currentPlayer.mesh.rotation.y);
                }
                if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) {
                    this.currentPlayer.mesh.rotation.y -= PLAYER_TURN_SPEED;
                    this.currentPlayer.direction.x = Math.sin(this.currentPlayer.mesh.rotation.y);
                    this.currentPlayer.direction.z = Math.cos(this.currentPlayer.mesh.rotation.y);
                }
                if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) {
                    moveX = this.currentPlayer.direction.x * moveSpeed;
                    moveZ = this.currentPlayer.direction.z * moveSpeed;
                }
                if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) {
                    // Braking
                    this.playerMomentum.x *= 0.9;
                    this.playerMomentum.z *= 0.9;
                }
                
                // Handle continuous firing in vehicle mode
                if (this.keys[' ']) {
                    this.currentPlayer.fireLaser();
                } else {
                    this.currentPlayer.stopFiring();
                }
            }
            
            // Handle gamepad controls
            if (this.gamepad) {
                const gamepad = navigator.getGamepads()[this.gamepadIndex];
                if (gamepad) {
                    // Left stick for acceleration/braking in vehicle mode, movement in normal mode
                    const leftStickX = gamepad.axes[0];
                    const leftStickY = gamepad.axes[1];
                    
                    if (this.currentView === 'normal') {
                        // Absolute controls in normal mode
                        moveX += leftStickX * moveSpeed;
                        moveZ += leftStickY * moveSpeed;
                    } else {
                        // In vehicle mode, left stick controls acceleration/braking
                        const magnitude = Math.min(1, Math.sqrt(leftStickX * leftStickX + leftStickY * leftStickY));
                        const isBraking = leftStickY > 0; // Forward on stick is braking
                        
                        if (isBraking) {
                            // Apply braking force
                            this.playerMomentum.x *= 0.9;
                            this.playerMomentum.z *= 0.9;
                        } else {
                            // Apply acceleration in current direction
                            this.playerMomentum.x = this.currentPlayer.direction.x * moveSpeed * magnitude;
                            this.playerMomentum.z = this.currentPlayer.direction.z * moveSpeed * magnitude;
                        }
                    }
                    
                    // Right stick for steering in vehicle mode
                    if (this.currentView === 'vehicle') {
                        const rightStickX = gamepad.axes[2];
                        const rightStickY = gamepad.axes[3];
                        if (Math.abs(rightStickX) > 0.1) {
                            const turnSpeed = PLAYER_TURN_SPEED * Math.abs(rightStickX);
                            this.currentPlayer.mesh.rotation.y -= rightStickX * turnSpeed;
                            this.currentPlayer.direction.x = Math.sin(this.currentPlayer.mesh.rotation.y);
                            this.currentPlayer.direction.z = Math.cos(this.currentPlayer.mesh.rotation.y);
                        }
                    }
                    
                    // Fire button (A button)
                    if (gamepad.buttons[0].pressed) {
                        if (this.currentView === 'vehicle') {
                            this.currentPlayer.fireLaser();
                    } else {
                            this.currentPlayer.fireLaser();
                        }
                    } else if (this.currentView === 'vehicle') {
                        this.currentPlayer.stopFiring();
                    }
                    
                    // View toggle (Y button)
                    if (gamepad.buttons[3].pressed && !this.gamepadButtonsPressed) {
                    this.cycleView();
                        this.gamepadButtonsPressed = true;
                    } else if (!gamepad.buttons[3].pressed) {
                        this.gamepadButtonsPressed = false;
                    }
                }
            }
            
            // Apply momentum
            this.playerMomentum.x = this.playerMomentum.x * PLAYER_MOMENTUM + moveX;
            this.playerMomentum.z = this.playerMomentum.z * PLAYER_MOMENTUM + moveZ;
            
            if (moveX !== 0 || moveZ !== 0) {
                this.currentPlayer.move(this.playerMomentum.x, this.playerMomentum.z);
            }
        }
        
        // Update camera view
        this.updateCameraView();
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
    
    updateStats() {
        // Update player stats display
        if (this.currentPlayer) {
            const stats = document.getElementById('stats');
            if (stats) {
                stats.textContent = `Kills: ${this.currentPlayer.kills} | Deaths: ${this.currentPlayer.deaths}`;
            }
        }
    }
    
    startNewRound() {
        // Reset player state
        if (this.currentPlayer) {
            this.currentPlayer.isDead = false;
            this.currentPlayer.baseCube.material.color.set(this.currentPlayer.color);
            this.currentPlayer.topCube.material.color.set(this.currentPlayer.color);
        }
        
        // Hide countdown screen
        document.getElementById('countdownScreen').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        
        // Start round timer
        this.startTime = Date.now();
        this.updateStats();
    }
}

class Player {
    constructor(scene, id) {
        this.scene = scene;
        this.id = id;
        this.isDead = false;
        this.kills = 0;
        this.deaths = 0;
        this.color = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
        this.direction = new THREE.Vector3(0, 0, -1);
        this.name = ''; // Will be set when player joins
        this.health = PLAYER_HEALTH;
        
        // Create player mesh
        const geometry = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE);
        const material = new THREE.MeshBasicMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(0, PLAYER_SIZE/2, 0);
        this.scene.add(this.mesh);
        
        // Create name tag and stats
        this.createNameTag();
        
        // Create base cube
        const baseGeometry = new THREE.BoxGeometry(PLAYER_SIZE * 1.5, PLAYER_SIZE * 0.5, PLAYER_SIZE * 1.5);
        const baseMaterial = new THREE.MeshBasicMaterial({ color: this.color });
        this.baseCube = new THREE.Mesh(baseGeometry, baseMaterial);
        this.baseCube.position.set(0, -PLAYER_SIZE/2, 0);
        this.mesh.add(this.baseCube);
        
        // Create top cube
        const topGeometry = new THREE.BoxGeometry(PLAYER_SIZE * 0.75, PLAYER_SIZE * 0.75, PLAYER_SIZE * 0.75);
        const topMaterial = new THREE.MeshBasicMaterial({ color: this.color });
        this.topCube = new THREE.Mesh(topGeometry, topMaterial);
        this.topCube.position.set(0, PLAYER_SIZE/2, 0);
        this.mesh.add(this.topCube);
        
        // Create smiley face
        this.createSmileyFace();
        
        this.lastLaserTime = 0;
        this.isLaserOnCooldown = true; // Start on cooldown
        this.laserCooldownIndicator = null;
        this.laserCooldownText = null;
        this.createLaserCooldownIndicator();
        this.createHealthBar();
    }
    
    createNameTag() {
        // Create canvas for name tag
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Create sprite from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            depthTest: false // Always render on top
        });
        
        this.nameTag = new THREE.Sprite(material);
        this.nameTag.scale.set(2, 0.5, 1);
        this.nameTag.position.y = PLAYER_SIZE * 2; // Position above player
        this.mesh.add(this.nameTag);
        
        // Store canvas and context for updates
        this.nameTagCanvas = canvas;
        this.nameTagContext = context;
        this.nameTagTexture = texture;
    }

    updateNameTag() {
        const ctx = this.nameTagContext;
        const canvas = this.nameTagCanvas;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Set text style
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw name
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(this.name, canvas.width/2, 20);
        ctx.fillText(this.name, canvas.width/2, 20);
        
        // Draw stats
        ctx.font = '20px Arial';
        const stats = `K: ${this.kills} D: ${this.deaths}`;
        ctx.strokeText(stats, canvas.width/2, 44);
        ctx.fillText(stats, canvas.width/2, 44);
        
        // Update texture
        this.nameTagTexture.needsUpdate = true;
    }
    
    createSmileyFace() {
        // Create face group
        const faceGroup = new THREE.Group();
        
        // Create eyes
        const eyeGeometry = new THREE.SphereGeometry(PLAYER_SIZE * 0.1, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-PLAYER_SIZE * 0.2, PLAYER_SIZE * 0.1, PLAYER_SIZE * 0.51);
        faceGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(PLAYER_SIZE * 0.2, PLAYER_SIZE * 0.1, PLAYER_SIZE * 0.51);
        faceGroup.add(rightEye);
        
        // Create smile
        const smileGeometry = new THREE.TorusGeometry(PLAYER_SIZE * 0.2, PLAYER_SIZE * 0.05, 8, 8, Math.PI);
        const smileMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const smile = new THREE.Mesh(smileGeometry, smileMaterial);
        smile.rotation.x = Math.PI / 2;
        smile.position.set(0, -PLAYER_SIZE * 0.1, PLAYER_SIZE * 0.51);
        faceGroup.add(smile);
        
        this.mesh.add(faceGroup);
    }
    
    createLaserCooldownIndicator() {
        // Create ring indicator
        const geometry = new THREE.RingGeometry(PLAYER_SIZE * 1.2, PLAYER_SIZE * 1.4, 32);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xFF69B4,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        this.laserCooldownIndicator = new THREE.Mesh(geometry, material);
        this.laserCooldownIndicator.rotation.x = Math.PI / 2;
        this.laserCooldownIndicator.visible = true; // Always visible
        this.mesh.add(this.laserCooldownIndicator);

        // Create text sprite for countdown
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;

        const texture = new THREE.CanvasTexture(canvas);
        const material2 = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            depthTest: false
        });

        this.laserCooldownText = new THREE.Sprite(material2);
        this.laserCooldownText.scale.set(1, 0.5, 1);
        this.laserCooldownText.position.y = PLAYER_SIZE * 2.2;
        this.mesh.add(this.laserCooldownText);

        // Store canvas and context for updates
        this.laserCooldownCanvas = canvas;
        this.laserCooldownContext = context;
        this.laserCooldownTexture = texture;
    }
    
    updateLaserCooldown() {
        const now = Date.now();
        const timeSinceLastLaser = now - this.lastLaserTime;
        
        if (this.isLaserOnCooldown) {
            if (timeSinceLastLaser >= LASER_COOLDOWN) {
                this.isLaserOnCooldown = false;
                this.laserCooldownIndicator.material.color.set(0x00FF00); // Green when ready
                this.updateCooldownText("READY");
            } else {
                // Update cooldown indicator
                const cooldownProgress = timeSinceLastLaser / LASER_COOLDOWN;
                this.laserCooldownIndicator.material.color.set(0xFF69B4); // Pink during cooldown
                this.laserCooldownIndicator.material.opacity = 0.5 * (1 - cooldownProgress);
                
                // Update countdown text
                const remainingTime = Math.ceil((LASER_COOLDOWN - timeSinceLastLaser) / 1000);
                this.updateCooldownText(remainingTime.toString());
            }
        }
    }
    
    updateCooldownText(text) {
        const ctx = this.laserCooldownContext;
        const canvas = this.laserCooldownCanvas;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Set text style
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw text with outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(text, canvas.width/2, canvas.height/2);
        
        // Draw text
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, canvas.width/2, canvas.height/2);
        
        // Update texture
        this.laserCooldownTexture.needsUpdate = true;
    }
    
    createHealthBar() {
        // Create canvas for health bar
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 8;
        
        // Create sprite from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            depthTest: false
        });
        
        this.healthBar = new THREE.Sprite(material);
        this.healthBar.scale.set(1, 0.125, 1);
        this.healthBar.position.y = PLAYER_SIZE * 2.5; // Position above name tag
        this.mesh.add(this.healthBar);
        
        // Store canvas and context for updates
        this.healthBarCanvas = canvas;
        this.healthBarContext = context;
        this.healthBarTexture = texture;
        
        this.updateHealthBar();
    }

    updateHealthBar() {
        const ctx = this.healthBarContext;
        const canvas = this.healthBarCanvas;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw background
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw health
        const healthWidth = (this.health / PLAYER_HEALTH) * canvas.width;
        ctx.fillStyle = this.health > 50 ? '#00FF00' : this.health > 25 ? '#FFFF00' : '#FF0000';
        ctx.fillRect(0, 0, healthWidth, canvas.height);
        
        // Update texture
        this.healthBarTexture.needsUpdate = true;
    }

    takeDamage(amount) {
        if (this.isDead) return;
        
        this.health = Math.max(0, this.health - amount);
        this.updateHealthBar();
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    move(x, z) {
        if (this.isDead) return;
        
        // Update position
        this.mesh.position.x += x;
        this.mesh.position.z += z;
        
        // Keep player within arena bounds
        const halfSize = ARENA_SIZE / 2 - PLAYER_SIZE;
        this.mesh.position.x = Math.max(-halfSize, Math.min(halfSize, this.mesh.position.x));
        this.mesh.position.z = Math.max(-halfSize, Math.min(halfSize, this.mesh.position.z));
        
        // Update direction based on movement
        if (x !== 0 || z !== 0) {
            this.direction.x = x;
            this.direction.z = z;
            this.direction.normalize();
            
            // Rotate player to face movement direction
            const angle = Math.atan2(x, z);
            this.mesh.rotation.y = angle;
        }
        
        // Emit movement event with more data
        if (window.game && window.game.socket) {
            window.game.socket.emit('playerMove', {
                position: {
                    x: this.mesh.position.x,
                    y: this.mesh.position.y,
                    z: this.mesh.position.z
                },
                direction: {
                    x: this.direction.x,
                    y: this.direction.y,
                    z: this.direction.z
                },
                rotation: this.mesh.rotation.y
            });
        }
    }
    
    updatePosition(data) {
        this.mesh.position.set(data.position.x, data.position.y, data.position.z);
        if (data.direction) {
            this.direction.set(data.direction.x, data.direction.y, data.direction.z);
        }
        if (data.rotation !== undefined) {
            this.mesh.rotation.y = data.rotation;
        }
        if (data.name) {
            this.name = data.name;
            this.updateNameTag();
        }
        if (data.kills !== undefined) {
            this.kills = data.kills;
            this.updateNameTag();
        }
        if (data.deaths !== undefined) {
            this.deaths = data.deaths;
            this.updateNameTag();
        }
    }
    
    checkLaserHit(laser) {
        if (this.isDead) return false;
        
        const distance = this.mesh.position.distanceTo(laser.mesh.position);
        return distance < PLAYER_SIZE;
    }
    
    die() {
        this.isDead = true;
        this.deaths++;
        this.health = 0;
        this.updateHealthBar();
        this.baseCube.material.color.set(0x808080);
        this.topCube.material.color.set(0x808080);
        this.updateNameTag();
        
        // Show respawn screen
        document.getElementById('countdownScreen').style.display = 'block';
        document.getElementById('countdown').textContent = 'Press any key, tap screen, or press any gamepad button to respawn';
        document.getElementById('controls').style.display = 'none';
        
        // Add respawn event listener
        const respawnHandler = (event) => {
            // Remove the event listener
            document.removeEventListener('keydown', respawnHandler);
            document.removeEventListener('click', respawnHandler);
            document.removeEventListener('touchstart', respawnHandler);
            
            // Reset player state
            this.isDead = false;
            this.health = PLAYER_HEALTH;
            this.updateHealthBar();
            this.baseCube.material.color.set(this.color);
            this.topCube.material.color.set(this.color);
            
            // Hide respawn screen
            document.getElementById('countdownScreen').style.display = 'none';
            document.getElementById('controls').style.display = 'block';
            
            // Emit respawn event to server
            if (window.game && window.game.socket) {
                window.game.socket.emit('playerRespawn');
            }
        };
        
        // Add event listeners for respawn
        document.addEventListener('keydown', respawnHandler);
        document.addEventListener('click', respawnHandler);
        document.addEventListener('touchstart', respawnHandler);
        
        // Update stats
        if (window.game) {
            window.game.updateStats();
        }
    }
    
    remove() {
        this.scene.remove(this.mesh);
    }
    
    fireLaser() {
        if (this.isDead || this.isLaserOnCooldown) return;
        
        const now = Date.now();
        const isVehicleMode = window.game.currentView === 'vehicle';
        
        // Start cooldown
        this.lastLaserTime = now;
        this.isLaserOnCooldown = true;
        this.laserCooldownIndicator.material.color.set(0xFF69B4); // Pink during cooldown
        
        if (isVehicleMode) {
            // Remove any existing vehicle mode lasers
            window.game.lasers = window.game.lasers.filter(laser => {
                if (laser.isVehicleMode) {
                    laser.scene.remove(laser.mesh);
        return false;
    }
                return true;
            });
            
            const laser = new Laser(this.scene, this.mesh.position.clone(), this.direction, true);
            laser.ownerId = this.id; // Set the owner of the laser
            window.game.lasers.push(laser);
            
            // Set timer to remove laser after duration
            setTimeout(() => {
                if (window.game) {
                    window.game.lasers = window.game.lasers.filter(l => {
                        if (l === laser) {
                            l.scene.remove(l.mesh);
                            return false;
                        }
                        return true;
                    });
                }
            }, VEHICLE_LASER_DURATION);
            } else {
            const laser = new Laser(this.scene, this.mesh.position.clone(), this.direction, false);
            laser.ownerId = this.id; // Set the owner of the laser
            window.game.lasers.push(laser);
        }
        
        // Play laser sound
        if (window.game.laserSound) {
            window.game.laserSound.currentTime = 0;
            window.game.laserSound.play().catch(error => {
                console.log('Laser sound play failed:', error);
            });
        }
        
        // Emit fire event to server with more data
        if (window.game && window.game.socket) {
            window.game.socket.emit('playerFire', {
                position: {
                    x: this.mesh.position.x,
                    y: this.mesh.position.y,
                    z: this.mesh.position.z
                },
                direction: {
                    x: this.direction.x,
                    y: this.direction.y,
                    z: this.direction.z
                },
                rotation: this.mesh.rotation.y,
                isVehicleMode: isVehicleMode
            });
        }
    }
    
    stopFiring() {
        // Remove any vehicle mode lasers
        if (window.game) {
            window.game.lasers = window.game.lasers.filter(laser => {
                if (laser.isVehicleMode) {
                    laser.scene.remove(laser.mesh);
                    return false;
                }
                return true;
            });
        }
    }
}

class Snowman {
    constructor(scene, color, game) {
        this.scene = scene;
        this.game = game;
        this.color = color;
        this.isDead = false;
        this.isInvulnerable = false;
        this.nextFireTime = this.getNextFireTime();
        this.nextDirectionChange = Date.now() + SNOWMAN_DIRECTION_CHANGE_INTERVAL;
        this.direction = new THREE.Vector3(
            Math.random() * 2 - 1,
            0,
            Math.random() * 2 - 1
        ).normalize();
        
        // Create snowman mesh
        const geometry = new THREE.BoxGeometry(SNOWMAN_SIZE, SNOWMAN_SIZE, SNOWMAN_SIZE);
        const material = new THREE.MeshBasicMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(0, SNOWMAN_SIZE/2 + 1, 0);
        this.scene.add(this.mesh);
        
        // Create base cube
        const baseGeometry = new THREE.BoxGeometry(SNOWMAN_SIZE * 1.5, SNOWMAN_SIZE * 0.5, SNOWMAN_SIZE * 1.5);
        const baseMaterial = new THREE.MeshBasicMaterial({ color: this.color });
        this.baseCube = new THREE.Mesh(baseGeometry, baseMaterial);
        this.baseCube.position.set(0, -SNOWMAN_SIZE/2, 0);
        this.mesh.add(this.baseCube);
        
        // Create top cube
        const topGeometry = new THREE.BoxGeometry(SNOWMAN_SIZE * 0.75, SNOWMAN_SIZE * 0.75, SNOWMAN_SIZE * 0.75);
        const topMaterial = new THREE.MeshBasicMaterial({ color: this.color });
        this.topCube = new THREE.Mesh(topGeometry, topMaterial);
        this.topCube.position.set(0, SNOWMAN_SIZE/2, 0);
        this.mesh.add(this.topCube);
        
        // Create face
        this.createFace();
        
        // Set random position
        this.respawn();
    }
    
    createFace() {
        // Create face group
        const faceGroup = new THREE.Group();
        
        // Create eyes
        const eyeGeometry = new THREE.SphereGeometry(SNOWMAN_SIZE * 0.1, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-SNOWMAN_SIZE * 0.2, SNOWMAN_SIZE * 0.1, SNOWMAN_SIZE * 0.51);
        faceGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(SNOWMAN_SIZE * 0.2, SNOWMAN_SIZE * 0.1, SNOWMAN_SIZE * 0.51);
        faceGroup.add(rightEye);
        
        // Create carrot nose
        const noseGeometry = new THREE.ConeGeometry(SNOWMAN_SIZE * 0.1, SNOWMAN_SIZE * 0.3, 8);
        const noseMaterial = new THREE.MeshBasicMaterial({ color: 0xFFA500 });
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, SNOWMAN_SIZE * 0.51);
        faceGroup.add(nose);
        
        this.mesh.add(faceGroup);
    }
    
    getNextFireTime() {
        return Date.now() + Math.random() * (SNOWMAN_FIRE_INTERVAL.max - SNOWMAN_FIRE_INTERVAL.min) + SNOWMAN_FIRE_INTERVAL.min;
    }
    
    update() {
        if (this.isDead || this.isInvulnerable) return;
        
        const now = Date.now();
        
        // Check if it's time to change direction
        if (now >= this.nextDirectionChange) {
            // Randomly change direction
            this.direction.set(
                Math.random() * 2 - 1,
                0,
                Math.random() * 2 - 1
            ).normalize();
            
            // Update rotation to face new direction
            this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);
            
            this.nextDirectionChange = now + SNOWMAN_DIRECTION_CHANGE_INTERVAL;
        }
        
        // Move snowman
        const newX = this.mesh.position.x + this.direction.x * SNOWMAN_SPEED;
        const newZ = this.mesh.position.z + this.direction.z * SNOWMAN_SPEED;
        
        // Check for wall collisions and bounce
        const halfArena = ARENA_SIZE / 2 - SNOWMAN_SIZE;
        if (Math.abs(newX) > halfArena) {
            this.direction.x *= -1;
            this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);
        }
        if (Math.abs(newZ) > halfArena) {
            this.direction.z *= -1;
            this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);
        }
        
        // Update position
        this.mesh.position.x += this.direction.x * SNOWMAN_SPEED;
        this.mesh.position.z += this.direction.z * SNOWMAN_SPEED;
        
        // Check if it's time to fire
        if (now >= this.nextFireTime) {
            this.fireLaser();
            this.nextFireTime = this.getNextFireTime();
        }
        
        // Randomly face a player (reduced chance)
        if (Math.random() < SNOWMAN_FACE_PLAYER_CHANCE * 0.5) {
            const players = Array.from(this.game.players.values());
            if (players.length > 0) {
                const targetPlayer = players[Math.floor(Math.random() * players.length)];
                if (!targetPlayer.isDead) {
                    const direction = new THREE.Vector3()
                        .subVectors(targetPlayer.mesh.position, this.mesh.position)
                        .normalize();
                    this.mesh.rotation.y = Math.atan2(direction.x, direction.z);
                    this.direction.copy(direction);
                }
            }
        }
    }
    
    fireLaser() {
        if (this.isDead || this.isInvulnerable) return;
        
        // Use current direction for laser
        const laser = new Laser(this.scene, this.mesh.position.clone(), this.direction.clone());
        this.game.lasers.push(laser);
        
        // Play laser sound
        if (this.game.laserSound) {
        this.game.laserSound.currentTime = 0;
        this.game.laserSound.play().catch(error => {
            console.log('Laser sound play failed:', error);
        });
        }
    }
    
    respawn() {
        // Set random position within arena bounds
        const halfSize = ARENA_SIZE / 2 - SNOWMAN_SIZE;
        this.mesh.position.x = Math.random() * ARENA_SIZE - halfSize;
        this.mesh.position.z = Math.random() * ARENA_SIZE - halfSize;
        this.mesh.position.y = SNOWMAN_SIZE/2 + 1;
        
        // Reset state
        this.isDead = false;
        
        // Change back to cube with original color
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.BoxGeometry(SNOWMAN_SIZE, SNOWMAN_SIZE, SNOWMAN_SIZE);
        this.mesh.material = new THREE.MeshBasicMaterial({ color: this.color });
        
        // Recreate base and top cubes
        this.baseCube = new THREE.Mesh(
            new THREE.BoxGeometry(SNOWMAN_SIZE * 1.5, SNOWMAN_SIZE * 0.5, SNOWMAN_SIZE * 1.5),
            new THREE.MeshBasicMaterial({ color: this.color })
        );
        this.baseCube.position.set(0, -SNOWMAN_SIZE/2, 0);
        this.mesh.add(this.baseCube);
        
        this.topCube = new THREE.Mesh(
            new THREE.BoxGeometry(SNOWMAN_SIZE * 0.75, SNOWMAN_SIZE * 0.75, SNOWMAN_SIZE * 0.75),
            new THREE.MeshBasicMaterial({ color: this.color })
        );
        this.topCube.position.set(0, SNOWMAN_SIZE/2, 0);
        this.mesh.add(this.topCube);
        
        // Recreate face
        this.createFace();
        
        // Make invulnerable and start flashing
        this.isInvulnerable = true;
        let flashCount = 0;
        const maxFlashes = SNOWMAN_RESPAWN_INVULNERABLE_TIME / SNOWMAN_RESPAWN_FLASH_INTERVAL;
        
        const flashInterval = setInterval(() => {
            if (flashCount >= maxFlashes) {
                clearInterval(flashInterval);
                this.isInvulnerable = false;
                this.baseCube.material.color.set(this.color);
                this.topCube.material.color.set(this.color);
                return;
            }
            
            // Flash between original color and white
            const flashColor = flashCount % 2 === 0 ? 0xFFFFFF : this.color;
            this.baseCube.material.color.set(flashColor);
            this.topCube.material.color.set(flashColor);
            flashCount++;
        }, SNOWMAN_RESPAWN_FLASH_INTERVAL);
        
        // Set new random direction
        this.direction.set(
            Math.random() * 2 - 1,
            0,
            Math.random() * 2 - 1
        ).normalize();
        this.mesh.rotation.y = Math.atan2(this.direction.x, this.direction.z);
    }

    takeDamage() {
        if (this.isDead || this.isInvulnerable) return;
        this.die();
    }

    die() {
        this.isDead = true;
        
        // Change to dodecahedron with gradient faces
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.DodecahedronGeometry(SNOWMAN_SIZE);
        
        // Create array of materials for each face
        const materials = [];
        const baseColor = new THREE.Color(this.color);
        
        // Create 12 slightly different shades
        for (let i = 0; i < 12; i++) {
            const shade = baseColor.clone();
            // Vary the brightness by ±15%
            const brightness = 1 + (Math.random() * 0.3 - 0.15);
            shade.r *= brightness;
            shade.g *= brightness;
            shade.b *= brightness;
            materials.push(new THREE.MeshBasicMaterial({ color: shade }));
        }
        
        // Apply materials to the dodecahedron
        this.mesh.material = materials;
        
        // Start respawn process
        setTimeout(() => this.respawn(), 2000);
    }
}

class Laser {
    constructor(scene, position, direction = new THREE.Vector3(0, 0, -1), isVehicleMode = false) {
        this.scene = scene;
        this.createdAt = Date.now();
        this.direction = direction.normalize();
        this.speed = 0.2;
        this.LASER_DURATION = 2500;
        this.INITIAL_SIZE = 1.0;
        this.isVehicleMode = isVehicleMode;
        this.EXPLOSION_RADIUS = 3; // 3 unit radius for vehicle mode explosions
        
        // Create laser mesh
        const geometry = this.isVehicleMode ? 
            new THREE.SphereGeometry(0.2, 16, 16) : // Sphere for vehicle mode grenade
            new THREE.BoxGeometry(this.INITIAL_SIZE, this.INITIAL_SIZE, this.INITIAL_SIZE);
            
        const material = new THREE.MeshBasicMaterial({ 
            color: LASER_COLOR,
            transparent: true,
            opacity: 0.8
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.position.y = 0.5; // Raise lasers slightly above ground
        
        this.scene.add(this.mesh);
        
        // Create explosion effect for vehicle mode
        if (this.isVehicleMode) {
            this.explosionGeometry = new THREE.SphereGeometry(0.1, 16, 16);
            this.explosionMaterial = new THREE.MeshBasicMaterial({
                color: LASER_COLOR,
                transparent: true,
                opacity: 0.8
            });
            this.explosionMesh = new THREE.Mesh(this.explosionGeometry, this.explosionMaterial);
            this.explosionMesh.visible = false;
            this.scene.add(this.explosionMesh);
        }
    }
    
    update() {
        if (this.isVehicleMode) {
            // Move grenade forward
            this.mesh.position.x += this.direction.x * this.speed;
            this.mesh.position.z += this.direction.z * this.speed;
            
            // Check for wall collisions
            const halfArena = ARENA_SIZE / 2;
            if (Math.abs(this.mesh.position.x) > halfArena || Math.abs(this.mesh.position.z) > halfArena) {
                this.explode();
                return true;
            }
            
            // Check for collisions with players and snowmen
            if (window.game) {
                // Check player collisions
                for (const player of window.game.players.values()) {
                    // Skip if this is the player's own laser
                    if (this.ownerId === player.id) continue;
                    
                    if (player.checkLaserHit(this)) {
                        this.explode();
                        return true;
                    }
                }
                
                // Check snowman collisions
                for (const snowman of window.game.snowmen) {
                    if (snowman.checkLaserHit(this)) {
                        this.explode();
                        return true;
                    }
                }
            }
            
            return false;
        }
        
        const age = Date.now() - this.createdAt;
        
        if (age > this.LASER_DURATION) {
            this.scene.remove(this.mesh);
            return true;
        }
        
        // Calculate new position
        const newX = this.mesh.position.x + this.direction.x * this.speed;
        const newZ = this.mesh.position.z + this.direction.z * this.speed;
        
        // Check for wall collisions
        const halfArena = ARENA_SIZE / 2;
        const halfSize = this.INITIAL_SIZE / 2;
        
        // Bounce off walls
        if (Math.abs(newX) + halfSize > halfArena) {
            this.direction.x *= -1;
        }
        if (Math.abs(newZ) + halfSize > halfArena) {
            this.direction.z *= -1;
        }
        
        // Update position
        this.mesh.position.x += this.direction.x * this.speed;
        this.mesh.position.z += this.direction.z * this.speed;
        
        // Check for collisions with players and snowmen
        if (window.game) {
            // Check player collisions
            for (const player of window.game.players.values()) {
                // Skip if this is the player's own laser
                if (this.ownerId === player.id) continue;
                
                if (player.checkLaserHit(this)) {
                    player.takeDamage();
                    this.scene.remove(this.mesh);
                    return true;
                }
            }
            
            // Check snowman collisions
            for (const snowman of window.game.snowmen) {
                if (snowman.checkLaserHit(this)) {
                    snowman.takeDamage();
                    this.scene.remove(this.mesh);
                    return true;
                }
            }
        }
        
        // Calculate size based on age
        const progress = age / this.LASER_DURATION;
        const currentSize = this.INITIAL_SIZE * (1 - progress);
        this.mesh.scale.set(currentSize, currentSize, currentSize);
        
        return false;
    }
    
    explode() {
        if (!this.isVehicleMode) return;
        
        // Create explosion effect
        this.explosionMesh.position.copy(this.mesh.position);
        this.explosionMesh.visible = true;
        
        // Animate explosion
        let scale = 0.1;
        const maxScale = this.EXPLOSION_RADIUS;
        const duration = 500; // 500ms explosion animation
        const startTime = Date.now();
        
        const animateExplosion = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            scale = maxScale * progress;
            this.explosionMesh.scale.set(scale, scale, scale);
            this.explosionMesh.material.opacity = 0.8 * (1 - progress);
            
            if (progress < 1) {
                requestAnimationFrame(animateExplosion);
            } else {
                this.scene.remove(this.explosionMesh);
            }
        };
        
        animateExplosion();
        
        // Check for players and snowmen in explosion radius
        if (window.game) {
            // Check player collisions
            for (const player of window.game.players.values()) {
                // Skip if this is the player's own laser
                if (this.ownerId === player.id) continue;
                
                const distance = player.mesh.position.distanceTo(this.mesh.position);
                if (distance <= this.EXPLOSION_RADIUS) {
                    player.takeDamage();
                }
            }
            
            // Check snowman collisions
            for (const snowman of window.game.snowmen) {
                const distance = snowman.mesh.position.distanceTo(this.mesh.position);
                if (distance <= this.EXPLOSION_RADIUS) {
                    snowman.takeDamage();
                }
            }
        }
        
        // Remove grenade mesh
        this.scene.remove(this.mesh);
    }
}

// Initialize game after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM CONTENT LOADED EVENT FIRED');
        console.log('Checking DOM elements...');
    
    // Verify all required DOM elements exist
    const requiredElements = {
        gameCanvas: document.getElementById('gameCanvas'),
        loadingScreen: document.getElementById('loadingScreen'),
        countdownScreen: document.getElementById('countdownScreen'),
        nameInput: document.getElementById('nameInput'),
        chatContainer: document.getElementById('chatContainer'),
        chatMessages: document.getElementById('chatMessages'),
        chatInput: document.getElementById('chatInput'),
        mobileControls: document.getElementById('mobileControls'),
        mobileButtons: document.getElementById('mobileButtons'),
        fireButton: document.getElementById('fireButton')
    };
    
    console.log('DOM elements found:', requiredElements);
    
    // Check if all required elements exist
    const missingElements = Object.entries(requiredElements)
        .filter(([key, element]) => !element)
        .map(([key]) => key);
        
    if (missingElements.length > 0) {
        console.error('Missing required DOM elements:', missingElements);
        // Show error on loading screen
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <h1>Error Loading Game</h1>
                <p>Missing required elements: ${missingElements.join(', ')}</p>
                <p>Please refresh the page</p>
            `;
        }
        return;
    }

    // Add click/touch handler for starting the game
    const startGame = (event) => {
        const nameInput = document.getElementById('nameInput');
        if (!nameInput.value.trim()) {
            nameInput.focus();
            return;
        }
        
        // Only start if clicking outside the input
        if (event.target === nameInput || event.target.closest('#nameInput')) {
            return;
        }
        
        // Remove event listeners
        document.removeEventListener('keydown', startGame);
        document.removeEventListener('click', startGame);
        document.removeEventListener('touchstart', startGame);
        
        // Hide loading screen
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        console.log('Starting game...');
        window.game = new Game();
    };
    
    // Add both click and touch event listeners
    document.addEventListener('click', startGame);
    document.addEventListener('touchstart', startGame, { passive: false });
    document.addEventListener('keydown', startGame);
    
    // Focus the name input when the page loads
    const nameInput = document.getElementById('nameInput');
    if (nameInput) {
        nameInput.focus();
    }
    
    console.log('Event listeners added for game start');
}); 