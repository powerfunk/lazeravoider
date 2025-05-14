console.log('START OF GAME.JS');
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import * as nipplejs from './lib/nipplejs.min.js';

// Constants
const ARENA_SIZE = 20;
const SNOWMAN_COLORS = [0x800080, 0x0000FF, 0x00FF00]; // Purple, Blue, Green
const LASER_COLOR = 0xFF69B4; // Pink
const SNOWMAN_SIZE = 1;
const PLAYER_SIZE = 0.5;
const LASER_INITIAL_SIZE = 2;
const LASER_DURATION = 3000; // 3 seconds
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
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        
        this.players = new Map();
        this.snowmen = [];
        this.lasers = [];
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.currentView = 'top'; // 'top', 'isometric', 'first-person'
        this.isMuted = false;
        this.currentSong = Math.floor(Math.random() * 24) + 1; // Random number 1-24
        this.songs = Array.from({length: 24}, (_, i) => 
            `https://www.bachcentral.com/WTCBkI/Fugue${i + 1}.mid`
        );
        
        this.audio = new Audio(this.songs[this.currentSong - 1]);
        this.laserSound = new Audio('laser.mp3');
        
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
        } else {
            this.setupKeyboardControls();
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
        
        // Show mobile controls
        document.getElementById('mobileControls').style.display = 'block';
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
        });
        
        this.socket.on('currentPlayers', (playersData) => {
            playersData.forEach(([id, data]) => {
                if (id !== this.socket.id) {  // Don't create duplicate for self
                    const player = new Player(this.scene, id);
                    player.updatePosition(data.position);
                    this.players.set(id, player);
                }
            });
        });
        
        this.socket.on('playerJoined', (playerData) => {
            if (this.players.size < 10) {
                const player = new Player(this.scene, playerData.id);
                this.players.set(playerData.id, player);
            }
        });
        
        this.socket.on('playerLeft', (playerId) => {
            const player = this.players.get(playerId);
            if (player) {
                player.remove();
                this.players.delete(playerId);
            }
        });
        
        this.socket.on('playerMoved', (data) => {
            const player = this.players.get(data.id);
            if (player) {
                player.updatePosition(data.position);
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
                    this.camera.position.copy(this.currentPlayer.mesh.position);
                    this.camera.position.y += 1;
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
        this.currentSong = Math.floor(Math.random() * 24) + 1;
        this.audio.src = this.songs[this.currentSong - 1];
        if (!this.isMuted) {
            this.audio.play();
        }
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.audio.muted = this.isMuted;
        this.laserSound.muted = this.isMuted;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update gamepad state
        if (this.gamepad) {
            this.gamepad = navigator.getGamepads()[this.gamepadIndex];
            if (this.gamepad && this.currentPlayer) {
                // Left stick for movement
                const moveX = this.gamepad.axes[0];
                const moveZ = this.gamepad.axes[1];
                if (Math.abs(moveX) > 0.1 || Math.abs(moveZ) > 0.1) {
                    this.currentPlayer.move(moveX, moveZ);
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
        
        // Update snowmen
        this.snowmen.forEach(snowman => snowman.update());
        
        // Update lasers
        this.lasers = this.lasers.filter(laser => {
            laser.update();
            return !laser.isDead;
        });
        
        // Update players
        this.players.forEach(player => {
            if (player === this.currentPlayer) {
                // Handle keyboard input for current player
                if (!this.isMobile && !this.gamepad) {
                    const moveX = (this.keys['ArrowRight'] ? 1 : 0) - (this.keys['ArrowLeft'] ? 1 : 0);
                    const moveZ = (this.keys['ArrowDown'] ? 1 : 0) - (this.keys['ArrowUp'] ? 1 : 0);
                    player.move(moveX, moveZ);
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
}

class Player {
    constructor(scene, id) {
        this.scene = scene;
        this.id = id;
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
        this.maxSpeed = 0.2;
        this.acceleration = 0.01;
        this.friction = 0.98;
        this.speed = 0.1;
        this.isDead = false;
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
        
        // Apply acceleration in the input direction
        this.velocity.x += x * this.acceleration;
        this.velocity.z += z * this.acceleration;
        
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
        
        // Update direction based on movement
        if (Math.abs(x) > 0.1 || Math.abs(z) > 0.1) {
            this.direction.set(x, 0, z).normalize();
            // Rotate the top cube to face the direction of movement
            this.topCube.rotation.y = Math.atan2(x, z);
        }
    }
    
    updatePosition(position) {
        this.mesh.position.copy(position);
    }
    
    checkLaserHit(laser) {
        return this.mesh.position.distanceTo(laser.mesh.position) < PLAYER_SIZE + laser.size;
    }
    
    die() {
        if (!this.isDead) {
            this.isDead = true;
            this.mesh.material.color.set(0xFF0000);
            // Emit death event to server
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
        
        // Initialize movement
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.05,
            0,
            (Math.random() - 0.5) * 0.05
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
    }
    
    update() {
        const age = Date.now() - this.birthTime;
        if (age > LASER_DURATION) {
            this.isDead = true;
            this.scene.remove(this.mesh);
            return;
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