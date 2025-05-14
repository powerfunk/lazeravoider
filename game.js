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
        this.currentSong = 0;
        this.songs = [
            'http://powerfunk.org/new/01-Untitled.mp3',
            'http://powerfunk.org/new/Blan.mp3',
            'http://powerfunk.org/new/CheesyLoop.m4a',
            'http://powerfunk.org/new/Plastic_Bag.mp3',
            'http://powerfunk.org/new/International.mp3',
            'http://powerfunk.org/new/Even.mp3',
            'http://powerfunk.org/homestyle/02-Bustin\'_Out.mp3',
            'http://powerfunk.org/homestyle/03-Juiced.mp3',
            'http://powerfunk.org/homestyle/09-Disjointed.mp3',
            'http://powerfunk.org/highfructose/05-Nissan.mp3',
            'http://powerfunk.org/highfructose/08-Missed_Opportunity.mp3',
            'http://powerfunk.org/highfructose/02-Drobstyle.mp3',
            'http://powerfunk.org/new/been_different.mp3'
        ];
        
        this.audio = new Audio(this.songs[0]);
        this.laserSound = new Audio('laser.mp3');
        
        this.setupScene();
        this.setupControls();
        this.setupEventListeners();
        this.setupSocket();
        
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
            this.snowmen.push(new Snowman(this.scene, SNOWMAN_COLORS[i]));
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
        const options = {
            zone: document.getElementById('mobileControls'),
            mode: 'static',
            position: { left: '50%', bottom: '50%' },
            color: 'white'
        };
        
        this.leftJoystick = nipplejs.create(options);
        this.leftJoystick.on('move', (evt, data) => {
            if (this.currentPlayer) {
                this.currentPlayer.move(data.vector.x, data.vector.y);
            }
        });
        
        document.getElementById('mobileButtons').style.display = 'block';
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
        this.currentSong = (this.currentSong + 1) % this.songs.length;
        this.audio.src = this.songs[this.currentSong];
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
                if (!this.isMobile) {
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
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(PLAYER_SIZE),
            new THREE.MeshBasicMaterial({ color: 0xFFFFFF })
        );
        this.scene.add(this.mesh);
        this.direction = new THREE.Vector3(0, 0, 1);
        this.speed = 0.1;
        this.isDead = false;
    }
    
    move(x, z) {
        if (this.isDead) return;
        
        this.mesh.position.x += x * this.speed;
        this.mesh.position.z += z * this.speed;
        
        // Keep player within arena bounds
        this.mesh.position.x = Math.max(-ARENA_SIZE/2 + PLAYER_SIZE, Math.min(ARENA_SIZE/2 - PLAYER_SIZE, this.mesh.position.x));
        this.mesh.position.z = Math.max(-ARENA_SIZE/2 + PLAYER_SIZE, Math.min(ARENA_SIZE/2 - PLAYER_SIZE, this.mesh.position.z));
        
        if (x !== 0 || z !== 0) {
            this.direction.set(x, 0, z).normalize();
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
    constructor(scene, color) {
        this.scene = scene;
        this.color = color;
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
        game.lasers.push(laser);
        
        // Play laser sound
        if (!game.isMuted) {
            game.laserSound.currentTime = 0;
            game.laserSound.play();
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