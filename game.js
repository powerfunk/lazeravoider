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
        
        // Music URLs array - all 176 songs
        this.musicUrls = Array.from({length: 176}, (_, i) => `music${i}.mp3`);
        
        // Multiplayer setup
        this.socket = io();
        this.otherPlayers = new Map();
        this.otherPlayerMeshes = new Map();
        
        // Set up socket event handlers
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
        });

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
    }

    addOtherPlayer(id, player) {
        console.log('Adding other player:', id, player);
        const otherKart = new Kart(player.position.x, player.position.z, false);
        otherKart.color = player.color;
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
        
        // Send our position and rotation
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
            }
        });
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
                    // Format time as minutes:seconds.tenths
                    const minutes = Math.floor(this.kart.survivalTime / 60);
                    const seconds = (this.kart.survivalTime % 60).toFixed(1);
                    this.survivalTimeDisplay.textContent = `Survival Time: ${minutes}:${seconds.padStart(4, '0')}`;
                }
            }
        }
        
        // Update multiplayer state
        this.updateMultiplayerState();
        
        // Rest of animate function...
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
            // Get a random song from our array of 176 songs
            const randomIndex = Math.floor(Math.random() * this.musicUrls.length);
            const songUrl = this.musicUrls[randomIndex];
            console.log('Loading song:', songUrl, '(index:', randomIndex, 'of', this.musicUrls.length, ')');
            
            // Set the new source
            this.backgroundMusic.src = songUrl;
            
            // Play the music
            const playPromise = this.backgroundMusic.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Music started playing successfully');
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

    createUI() {
        // Create UI container
        this.uiContainer = document.createElement('div');
        this.uiContainer.style.position = 'absolute';
        this.uiContainer.style.top = '0';
        this.uiContainer.style.left = '0';
        this.uiContainer.style.width = '100%';
        this.uiContainer.style.pointerEvents = 'none';
        document.body.appendChild(this.uiContainer);

        // Create control tutorial
        this.controlTutorial = document.createElement('div');
        this.controlTutorial.style.position = 'absolute';
        this.controlTutorial.style.bottom = '20px';
        this.controlTutorial.style.left = '20px';
        this.controlTutorial.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.controlTutorial.style.padding = '10px';
        this.controlTutorial.style.borderRadius = '5px';
        this.controlTutorial.style.color = 'white';
        this.controlTutorial.style.fontFamily = 'Arial, sans-serif';
        this.controlTutorial.innerHTML = `
            <div style="font-size: 20px; font-weight: bold; color: #ff9900;">M - Mute/Unmute</div>
            <div>Arrow Keys - Move</div>
            <div>V - Change View</div>
            <div>P - Change Song</div>
        `;
        this.uiContainer.appendChild(this.controlTutorial);

        // Create survival time display
        this.survivalTimeDisplay = document.createElement('div');
        this.survivalTimeDisplay.style.position = 'absolute';
        this.survivalTimeDisplay.style.top = '20px';
        this.survivalTimeDisplay.style.left = '50%';
        this.survivalTimeDisplay.style.transform = 'translateX(-50%)';
        this.survivalTimeDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.survivalTimeDisplay.style.padding = '10px';
        this.survivalTimeDisplay.style.borderRadius = '5px';
        this.survivalTimeDisplay.style.color = 'white';
        this.survivalTimeDisplay.style.fontFamily = 'Arial, sans-serif';
        this.survivalTimeDisplay.style.fontSize = '20px';
        this.survivalTimeDisplay.textContent = 'Survival Time: 0:00.0';
        this.uiContainer.appendChild(this.survivalTimeDisplay);

        // Create achievement notification
        this.achievementNotification = document.createElement('div');
        this.achievementNotification.style.position = 'absolute';
        this.achievementNotification.style.top = '50%';
        this.achievementNotification.style.left = '50%';
        this.achievementNotification.style.transform = 'translate(-50%, -50%)';
        this.achievementNotification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.achievementNotification.style.padding = '20px';
        this.achievementNotification.style.borderRadius = '10px';
        this.achievementNotification.style.color = 'white';
        this.achievementNotification.style.fontFamily = 'Arial, sans-serif';
        this.achievementNotification.style.fontSize = '24px';
        this.achievementNotification.style.display = 'none';
        this.achievementNotification.style.transition = 'opacity 0.5s';
        this.achievementNotification.style.opacity = '0';
        this.uiContainer.appendChild(this.achievementNotification);

        // Create code input overlay
        this.codeInputOverlay = document.createElement('div');
        this.codeInputOverlay.style.position = 'absolute';
        this.codeInputOverlay.style.top = '0';
        this.codeInputOverlay.style.left = '0';
        this.codeInputOverlay.style.width = '100%';
        this.codeInputOverlay.style.height = '100%';
        this.codeInputOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.codeInputOverlay.style.display = 'none';
        this.codeInputOverlay.style.justifyContent = 'center';
        this.codeInputOverlay.style.alignItems = 'center';
        this.codeInputOverlay.innerHTML = `
            <div style="background-color: white; padding: 20px; border-radius: 10px;">
                <h2>Enter Achievement Code</h2>
                <input type="text" id="codeInput" style="padding: 5px; margin: 10px 0;">
                <div>Press Enter to submit or Escape to cancel</div>
            </div>
        `;
        document.body.appendChild(this.codeInputOverlay);
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