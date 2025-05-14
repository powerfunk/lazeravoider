import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

export class Game {
    constructor() {
        console.log('Game constructor started');
        try {
            // Add resource loading state
            this.resourcesLoaded = false;
            this.resourcesToLoad = 0;
            this.resourcesLoadedCount = 0;
            
            // Initialize Maps for multiplayer
            this.otherPlayers = new Map();
            this.otherPlayerMeshes = new Map();
            
            // Add performance monitoring
            this.lastFrameTime = 0;
            this.targetFrameRate = 60;
            this.frameTime = 1000 / this.targetFrameRate;
            
            // Add visibility state
            this.isVisible = true;
            
            console.log('Initializing Three.js');
            // Initialize Three.js first
            this.initializeThreeJS();
            
            console.log('Starting resource loading');
            // Start resource loading
            this.loadResources().then(() => {
                console.log('Resources loaded successfully');
                this.resourcesLoaded = true;
                this.initializeGame();
            }).catch(error => {
                console.error('Error loading resources:', error);
                this.showNotification('Error loading game resources. Please refresh.');
            });
            
            // Add laser-related properties
            this.lasers = new Map();
            this.lastLaserTime = 0;
            this.laserCooldown = 1000; // 1 second between shots
            
            // Add state tracking
            this.lastStateTimestamp = 0;
            this.lastUpdateTime = 0;
            this.updateInterval = 1000 / 60; // 60fps
            
            // Add connection state tracking
            this.connectionState = 'disconnected';
            this.rejoinAttempts = 0;
            this.maxRejoinAttempts = 3;
            
            // Add input state tracking
            this.inputState = {
                keyboard: {},
                gamepad: null,
                touch: {
                    leftJoystick: null,
                    rightJoystick: null
                }
            };
        } catch (error) {
            console.error('Error in Game constructor:', error);
            this.showNotification('Error initializing game. Please refresh.');
        }
    }
    
    initializeThreeJS() {
        console.log('Starting Three.js initialization');
        // Three.js setup
        this.scene = new THREE.Scene();
        console.log('Scene created');
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        console.log('Camera created');
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        console.log('Renderer created');
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x4FC3F7);
        document.body.appendChild(this.renderer.domElement);
        
        // Position camera
        this.camera.position.set(0, 10, 20);
        this.camera.lookAt(0, 0, 0);
        console.log('Camera positioned');
        
        console.log('Three.js initialization complete');
    }
    
    async loadResources() {
        console.log('Starting resource loading process');
        // Create loading screen
        this.createLoadingScreen();
        
        // Load laser sounds in parallel
        const laserSoundFiles = ['laser1.mp3', 'laser2.mp3', 'laser3.mp3'];
        this.laserSounds = [];
        this.resourcesToLoad = laserSoundFiles.length + 1; // +1 for title image
        this.resourcesLoadedCount = 0;
        
        try {
            console.log('Starting to load laser sounds...');
            // Load all sounds in parallel with timeout
            await Promise.all(laserSoundFiles.map(async (soundFile) => {
                try {
                    const sound = new Audio();
                    sound.src = soundFile;
                    sound.volume = 0.3;
                    this.laserSounds.push(sound);
                    
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            console.warn(`Timeout loading sound: ${soundFile}`);
                            resolve(); // Resolve anyway to continue loading
                        }, 5000); // 5 second timeout
                        
                        sound.addEventListener('canplaythrough', () => {
                            clearTimeout(timeout);
                            console.log(`Loaded sound: ${soundFile}`);
                            this.resourcesLoadedCount++;
                            this.updateLoadingProgress();
                            resolve();
                        });
                        
                        sound.addEventListener('error', (error) => {
                            clearTimeout(timeout);
                            console.error(`Error loading sound ${soundFile}:`, error);
                            resolve(); // Resolve anyway to continue loading
                        });
                    });
                } catch (error) {
                    console.error(`Error in sound loading for ${soundFile}:`, error);
                    this.resourcesLoadedCount++;
                    this.updateLoadingProgress();
                }
            }));
            
            console.log('Starting to load title image...');
            // Load random title image with timeout
            const titleNumber = Math.floor(Math.random() * 10);
            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        console.warn(`Timeout loading title image: title${titleNumber}.jpg`);
                        resolve(); // Resolve anyway to continue loading
                    }, 5000); // 5 second timeout
                    
                    const img = new Image();
                    img.onload = () => {
                        clearTimeout(timeout);
                        console.log(`Loaded title image: title${titleNumber}.jpg`);
                        this.titleImage = img;
                        this.resourcesLoadedCount++;
                        this.updateLoadingProgress();
                        resolve();
                    };
                    img.onerror = (error) => {
                        clearTimeout(timeout);
                        console.error(`Failed to load title image: title${titleNumber}.jpg`, error);
                        resolve(); // Resolve anyway to continue loading
                    };
                    img.src = `title${titleNumber}.jpg`;
                });
            } catch (error) {
                console.error('Error in title image loading:', error);
                this.resourcesLoadedCount++;
                this.updateLoadingProgress();
            }
            
            console.log('All resources loaded successfully');
            this.resourcesLoaded = true;
            this.initializeGame();
        } catch (error) {
            console.error('Error loading resources:', error);
            this.showNotification('Error loading game resources. Please refresh.');
            // Force continue anyway
            this.resourcesLoaded = true;
            this.initializeGame();
        }
    }
    
    createLoadingScreen() {
        console.log('Creating loading screen');
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
        
        const progressText = document.createElement('div');
        progressText.style.fontSize = '16px';
        progressText.style.marginBottom = '10px';
        progressText.textContent = '0%';
        this.progressText = progressText;
        
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
        this.loadingScreen.appendChild(progressText);
        this.loadingScreen.appendChild(progressBar);
        this.progressFill = progressFill;
        
        document.body.appendChild(this.loadingScreen);
        console.log('Loading screen created');
    }
    
    updateLoadingProgress() {
        const progress = (this.resourcesLoadedCount / this.resourcesToLoad) * 100;
        console.log(`Loading progress: ${progress.toFixed(1)}% (${this.resourcesLoadedCount}/${this.resourcesToLoad})`);
        this.progressFill.style.width = `${progress}%`;
        this.progressText.textContent = `${Math.round(progress)}%`;
        
        if (progress >= 100) {
            setTimeout(() => {
                this.loadingScreen.style.display = 'none';
            }, 500);
        }
    }
    
    createUI() {
        // Create notification element
        this.notification = document.getElementById('notification');
        if (!this.notification) {
            this.notification = document.createElement('div');
            this.notification.id = 'notification';
            this.notification.style.position = 'fixed';
            this.notification.style.top = '50%';
            this.notification.style.left = '50%';
            this.notification.style.transform = 'translate(-50%, -50%)';
            this.notification.style.color = 'white';
            this.notification.style.fontSize = '24px';
            this.notification.style.textAlign = 'center';
            this.notification.style.display = 'none';
            this.notification.style.zIndex = '100';
            this.notification.style.transition = 'opacity 0.5s';
            document.body.appendChild(this.notification);
        }

        // Create sound icon
        this.soundIcon = document.createElement('div');
        this.soundIcon.style.position = 'fixed';
        this.soundIcon.style.top = '20px';
        this.soundIcon.style.right = '20px';
        this.soundIcon.style.width = '40px';
        this.soundIcon.style.height = '40px';
        this.soundIcon.style.backgroundImage = 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0zIDl2Nmg0bDUgNVY0TDcgOUgzem0xMy41IDNjMC0xLjc3LTEuMDItMy4yOS0yLjUtNC4wM3Y4LjA1YzEuNDgtLjczIDIuNS0yLjI1IDIuNS00LjAyek0xNCAzLjIzdjIuMDZjMi44OS44NiA1IDMuNTQgNSA2Ljcxcy0yLjExIDUuODUtNSA2LjcxdjIuMDZjNC4wMS0uOTEgNy00LjQ5IDctOC43N3MtMi45OS03Ljg2LTctOC43N3oiLz48L3N2Zz4=")';
        this.soundIcon.style.backgroundSize = 'contain';
        this.soundIcon.style.backgroundRepeat = 'no-repeat';
        this.soundIcon.style.cursor = 'pointer';
        this.soundIcon.style.zIndex = '1000';
        this.soundIcon.title = 'M to Mute/Unmute';
        
        // Add mute slash
        this.muteSlash = document.createElement('div');
        this.muteSlash.style.position = 'absolute';
        this.muteSlash.style.top = '0';
        this.muteSlash.style.left = '0';
        this.muteSlash.style.width = '100%';
        this.muteSlash.style.height = '100%';
        this.muteSlash.style.backgroundImage = 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIgZD0iTTIgMmw0IDRjMCAwIDQgNCA4IDRzOC00IDgtNGw0IDRMMjIgMjJMMiAyIi8+PC9zdmc+")';
        this.muteSlash.style.backgroundSize = 'contain';
        this.muteSlash.style.backgroundRepeat = 'no-repeat';
        this.muteSlash.style.display = 'none';
        this.soundIcon.appendChild(this.muteSlash);
        
        // Add mute text
        const muteText = document.createElement('div');
        muteText.style.position = 'absolute';
        muteText.style.top = '45px';
        muteText.style.left = '50%';
        muteText.style.transform = 'translateX(-50%)';
        muteText.style.color = 'white';
        muteText.style.fontSize = '12px';
        muteText.style.whiteSpace = 'nowrap';
        muteText.textContent = 'M to Mute/Unmute';
        this.soundIcon.appendChild(muteText);
        
        document.body.appendChild(this.soundIcon);

        // Create countdown element
        this.countdownElement = document.getElementById('countdown');
        if (!this.countdownElement) {
            this.countdownElement = document.createElement('div');
            this.countdownElement.id = 'countdown';
            this.countdownElement.style.position = 'fixed';
            this.countdownElement.style.top = '50%';
            this.countdownElement.style.left = '50%';
            this.countdownElement.style.transform = 'translate(-50%, -50%)';
            this.countdownElement.style.color = 'white';
            this.countdownElement.style.fontSize = '48px';
            this.countdownElement.style.textAlign = 'center';
            this.countdownElement.style.display = 'none';
            this.countdownElement.style.zIndex = '100';
            document.body.appendChild(this.countdownElement);
        }

        // Create game over element
        this.gameOverElement = document.getElementById('gameOver');
        if (!this.gameOverElement) {
            this.gameOverElement = document.createElement('div');
            this.gameOverElement.id = 'gameOver';
            this.gameOverElement.style.position = 'fixed';
            this.gameOverElement.style.top = '50%';
            this.gameOverElement.style.left = '50%';
            this.gameOverElement.style.transform = 'translate(-50%, -50%)';
            this.gameOverElement.style.color = 'white';
            this.gameOverElement.style.fontSize = '48px';
            this.gameOverElement.style.textAlign = 'center';
            this.gameOverElement.style.display = 'none';
            this.gameOverElement.style.zIndex = '100';
            document.body.appendChild(this.gameOverElement);
        }
    }

    initializeGame() {
        // Initialize game state
        this.gameStatus = 'waiting';
        this.roundNumber = 0;
        this.eliminatedPlayers = new Set();
        
        // Set spectator mode by default for new players
        this.spectatorMode = true;
        this.spectatedPlayer = null;
        
        // Create environment and arena
        this.createEnvironment();
        this.createArena();
        
        // Create player kart
        this.kart = new Kart(0, 0, false);
        this.kart.rotation.y = Math.PI;
        
        // Create player mesh
        this.playerKartMesh = this.kart.createMesh();
        this.scene.add(this.playerKartMesh);
        
        // Create UI elements
        this.createUI();
        this.createSpectatorUI();
        this.createStartScreen();
        
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
            console.log('Waiting for resources to load...');
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
                console.log('Rendering frame');
                // Update game state
                this.updateGameState();
                
                // Render scene
                this.renderer.render(this.scene, this.camera);
            }
        }
        
        requestAnimationFrame(() => this.animate());
    }
    
    updateGameState() {
        const now = performance.now();
        if (now - this.lastUpdateTime < this.updateInterval) return;
        this.lastUpdateTime = now;

        // Only update if connected
        if (this.connectionState !== 'connected') return;

        // Update input state
        this.updateInputState();

        // Update game state
        if (this.kart && !this.spectatorMode) {
            this.updateMultiplayerState();
        }

        // Update camera
        this.updateCamera();
    }
    
    setupEventListeners() {
        // Add key event listeners
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
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

        // Add key press handler for non-mobile
        if (!this.isMobile) {
            document.addEventListener('keydown', () => {
                if (this.showStartScreen) {
                    this.showStartScreen = false;
                    this.startScreen.style.display = 'none';
                    this.gameStarted = true;
                    this.showNotification('Game started!');
                }
            });
        }
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
        
        // Reset input state
        this.inputState = {
            keyboard: {},
            gamepad: null,
            touch: {
                leftJoystick: null,
                rightJoystick: null
            }
        };
        
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
        // Connect to the current domain
        this.socket = io(window.location.origin, {
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.connectionState = 'connected';
            this.rejoinAttempts = 0;
            
            // Request current game state
            this.socket.emit('requestGameState');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.connectionState = 'disconnected';
            this.handleDisconnect();
        });

        // Add rejoin handling
        this.socket.on('rejoinResponse', (response) => {
            if (response.success) {
                this.connectionState = 'connected';
                this.rejoinAttempts = 0;
                this.showNotification('Rejoined game successfully');
            } else {
                this.showNotification('Failed to rejoin game');
            }
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
            this.handleLaserFired(data);
        });
        
        this.socket.on('laserRemoved', (data) => {
            this.handleLaserRemoved(data);
        });
        
        this.socket.on('playerHit', (data) => {
            this.handlePlayerHit(data);
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
        this.rejoinAttempts = 0;
        this.maxRejoinAttempts = 3;
        this.reconnectTimeout = null;

        // Initialize socket with reconnection handling
        this.initializeSocket();
    }

    initMobileControls() {
        // Create container for mobile controls
        const mobileControlsContainer = document.createElement('div');
        mobileControlsContainer.style.position = 'fixed';
        mobileControlsContainer.style.bottom = '0';
        mobileControlsContainer.style.left = '0';
        mobileControlsContainer.style.width = '100%';
        mobileControlsContainer.style.height = '40%';
        mobileControlsContainer.style.pointerEvents = 'none';
        mobileControlsContainer.style.zIndex = '1000';
        document.body.appendChild(mobileControlsContainer);

        // Create container for left joystick (movement)
        const leftJoystickContainer = document.createElement('div');
        leftJoystickContainer.style.position = 'absolute';
        leftJoystickContainer.style.bottom = '20px';
        leftJoystickContainer.style.left = '20px';
        leftJoystickContainer.style.width = '150px';
        leftJoystickContainer.style.height = '150px';
        leftJoystickContainer.style.pointerEvents = 'auto';
        mobileControlsContainer.appendChild(leftJoystickContainer);

        // Create container for right joystick (rotation)
        const rightJoystickContainer = document.createElement('div');
        rightJoystickContainer.style.position = 'absolute';
        rightJoystickContainer.style.bottom = '20px';
        rightJoystickContainer.style.right = '20px';
        rightJoystickContainer.style.width = '150px';
        rightJoystickContainer.style.height = '150px';
        rightJoystickContainer.style.pointerEvents = 'auto';
        mobileControlsContainer.appendChild(rightJoystickContainer);

        // Initialize left joystick (movement)
        this.leftJoystick = nipplejs.create({
            zone: leftJoystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120,
            dynamicPage: true,
            fadeTime: 250
        });

        // Initialize right joystick (rotation)
        this.rightJoystick = nipplejs.create({
            zone: rightJoystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120,
            dynamicPage: true,
            fadeTime: 250
        });

        // Add visual feedback for joysticks
        const addJoystickFeedback = (joystick) => {
            joystick.on('start', () => {
                joystick.ui.front.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            });
            joystick.on('end', () => {
                joystick.ui.front.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
            });
        };

        addJoystickFeedback(this.leftJoystick);
        addJoystickFeedback(this.rightJoystick);

        // Handle left joystick events (movement)
        this.leftJoystick.on('move', (evt, data) => {
            if (!this.gameStarted || this.countdownActive) return;
            
            const angle = data.angle.radian;
            const force = Math.min(data.force, 1);
            
            // Smoother movement control
            this.keys.ArrowUp = force > 0.1 && angle > -Math.PI/2 && angle < Math.PI/2;
            this.keys.ArrowDown = force > 0.1 && (angle > Math.PI/2 || angle < -Math.PI/2);
            
            // Add diagonal movement support
            if (force > 0.1) {
                this.keys.ArrowLeft = angle > Math.PI/4 && angle < Math.PI * 3/4;
                this.keys.ArrowRight = angle > -Math.PI * 3/4 && angle < -Math.PI/4;
            }
        });

        // Handle right joystick events (rotation)
        this.rightJoystick.on('move', (evt, data) => {
            if (!this.gameStarted || this.countdownActive) return;
            
            const angle = data.angle.radian;
            const force = Math.min(data.force, 1);
            
            // Smoother rotation control
            this.keys.ArrowLeft = force > 0.1 && angle > Math.PI/2 && angle < Math.PI * 1.5;
            this.keys.ArrowRight = force > 0.1 && (angle > -Math.PI/2 && angle < Math.PI/2);
        });

        // Reset keys when joysticks are released
        this.leftJoystick.on('end', () => {
            this.keys.ArrowUp = false;
            this.keys.ArrowDown = false;
            this.keys.ArrowLeft = false;
            this.keys.ArrowRight = false;
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
        mobileControls.style.pointerEvents = 'auto';
        mobileControls.innerHTML = `
            <div>Left Stick - Move</div>
            <div>Right Stick - Rotate</div>
        `;
        mobileControlsContainer.appendChild(mobileControls);

        // Prevent default touch behavior
        document.addEventListener('touchmove', (e) => {
            if (e.target === leftJoystickContainer || e.target === rightJoystickContainer) {
                e.preventDefault();
            }
        }, { passive: false });
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
            color: this.kart.color
        });
        
        // Handle laser firing
        const now = Date.now();
        if (this.keys[' '] && now - this.lastLaserTime >= this.laserCooldown) {
            this.socket.emit('laserFired', {
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
            this.lastLaserTime = now;
        }
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
        // Generate random texture numbers
        this.currentFloorTexture = Math.floor(Math.random() * 10);
        this.currentWallTexture = Math.floor(Math.random() * 10);
        
        // Load floor texture
        const floorTexture = new THREE.TextureLoader().load(`floor${this.currentFloorTexture}.jpg`);
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(4, 4); // Repeat texture 4 times in each direction
        
        // Create floor
        const floorGeometry = new THREE.PlaneGeometry(80, 80);
        const floorMaterial = new THREE.MeshStandardMaterial({
            map: floorTexture,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.1;
        this.scene.add(floor);

        // Load wall texture
        const wallTexture = new THREE.TextureLoader().load(`wall${this.currentWallTexture}.jpg`);
        wallTexture.wrapS = THREE.RepeatWrapping;
        wallTexture.wrapT = THREE.RepeatWrapping;
        wallTexture.repeat.set(2, 1); // Repeat texture 2 times horizontally
        
        // Create walls
        const wallGeometry = new THREE.BoxGeometry(80, 10, 1);
        const wallMaterial = new THREE.MeshStandardMaterial({
            map: wallTexture,
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
        
        console.log(`Created arena with floor${this.currentFloorTexture}.jpg and wall${this.currentWallTexture}.jpg`);
    }

    handleGameState(state) {
        // Prevent out-of-order updates
        if (state.timestamp < this.lastStateTimestamp) return;
        this.lastStateTimestamp = state.timestamp;

        this.gameStatus = state.gameStatus;
        this.roundNumber = state.roundNumber;
        this.eliminatedPlayers = new Set(state.eliminatedPlayers);

        // Update player list
        state.players.forEach(([id, player]) => {
            if (id !== this.socket.id) {
                this.addOtherPlayer(id, player);
            }
        });

        // If game is active, exit spectator mode
        if (state.gameStatus === 'active') {
            this.spectatorMode = false;
            this.spectatedPlayer = null;
        }

        // Update UI based on game state
        this.updateUI();
        this.updateSpectatorUI();
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
        this.rejoinAttempts++;
        if (this.rejoinAttempts <= this.maxRejoinAttempts) {
            this.showNotification(`Reconnection attempt ${this.rejoinAttempts}/${this.maxRejoinAttempts}`);
            this.reconnectTimeout = setTimeout(() => {
                this.socket.connect();
            }, 1000 * this.rejoinAttempts);
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
        
        if (activePlayers.length === 0) {
            this.spectatorMode = false;
            this.spectatedPlayer = null;
            this.showNotification('Game Over - All players eliminated');
            this.updateSpectatorUI();
            return;
        }

        if (activePlayers.length > 0) {
            const currentIndex = activePlayers.indexOf(this.spectatedPlayer);
            const nextIndex = (currentIndex + 1) % activePlayers.length;
            this.spectatedPlayer = activePlayers[nextIndex];
            this.showNotification(`Spectating player ${this.spectatedPlayer}`);
            this.updateSpectatorUI();
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
        if (this.notification) {
            this.notification.textContent = message;
            this.notification.style.display = 'block';
            this.notification.style.opacity = '1';
            
            setTimeout(() => {
                this.notification.style.opacity = '0';
                setTimeout(() => {
                    this.notification.style.display = 'none';
                }, 500);
            }, 3000);
        }
    }

    handleLaserFired(data) {
        const laser = this.createLaser(data.position, data.rotation, data.ownerId);
        this.lasers.set(data.id, {
            mesh: laser,
            startTime: Date.now(),
            ownerId: data.ownerId
        });
        
        // Play laser sound
        if (this.soundEnabled) {
            const laserSound = this.laserSounds[Math.floor(Math.random() * this.laserSounds.length)];
            laserSound.currentTime = 0;
            laserSound.play();
        }
    }
    
    handleLaserRemoved(data) {
        const laser = this.lasers.get(data.id);
        if (laser) {
            this.scene.remove(laser.mesh);
            this.lasers.delete(data.id);
        }
    }
    
    handlePlayerHit(data) {
        if (data.playerId === this.socket.id) {
            // We were hit
            this.socket.emit('playerEliminated', {
                survivalTime: this.kart.survivalTime
            });
            this.handleElimination();
        }
    }
    
    handleElimination() {
        if (this.kart) {
            this.kart.eliminated = true;
            this.spectatorMode = true;
            this.showNotification('You were eliminated!');
            this.updateSpectatorUI();
        }
    }

    createSpectatorUI() {
        // Create spectator mode container
        this.spectatorUI = document.createElement('div');
        this.spectatorUI.style.position = 'fixed';
        this.spectatorUI.style.top = '20px';
        this.spectatorUI.style.left = '50%';
        this.spectatorUI.style.transform = 'translateX(-50%)';
        this.spectatorUI.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.spectatorUI.style.color = 'white';
        this.spectatorUI.style.padding = '10px 20px';
        this.spectatorUI.style.borderRadius = '5px';
        this.spectatorUI.style.fontFamily = 'Arial, sans-serif';
        this.spectatorUI.style.fontSize = '18px';
        this.spectatorUI.style.zIndex = '1000';
        this.spectatorUI.style.display = 'none';
        this.spectatorUI.innerHTML = 'Spectator Mode';
        document.body.appendChild(this.spectatorUI);
    }

    updateSpectatorUI() {
        if (this.spectatorUI) {
            this.spectatorUI.style.display = this.spectatorMode ? 'block' : 'none';
            if (this.spectatorMode && this.spectatedPlayer) {
                this.spectatorUI.innerHTML = `Spectator Mode - Watching Player ${this.spectatedPlayer}`;
            } else {
                this.spectatorUI.innerHTML = 'Spectator Mode';
            }
        }
    }

    createStartScreen() {
        // Create start screen container
        this.startScreen = document.createElement('div');
        this.startScreen.style.position = 'fixed';
        this.startScreen.style.top = '0';
        this.startScreen.style.left = '0';
        this.startScreen.style.width = '100%';
        this.startScreen.style.height = '100%';
        this.startScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.startScreen.style.display = 'flex';
        this.startScreen.style.flexDirection = 'column';
        this.startScreen.style.justifyContent = 'center';
        this.startScreen.style.alignItems = 'center';
        this.startScreen.style.zIndex = '2000';
        this.startScreen.style.cursor = 'pointer';
        
        // Add title image if available
        if (this.titleImage) {
            const titleImg = document.createElement('img');
            titleImg.src = this.titleImage.src;
            titleImg.style.maxWidth = '80%';
            titleImg.style.maxHeight = '40%';
            titleImg.style.marginBottom = '20px';
            this.startScreen.appendChild(titleImg);
        }
        
        // Add controls information
        const controls = document.createElement('div');
        controls.style.color = 'white';
        controls.style.fontSize = '18px';
        controls.style.fontFamily = 'Arial, sans-serif';
        controls.style.textAlign = 'center';
        controls.style.padding = '20px';
        controls.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        controls.style.borderRadius = '10px';
        controls.style.marginTop = '20px';
        controls.style.marginBottom = '20px';
        controls.innerHTML = `
            <h2 style="margin-bottom: 15px;">Controls:</h2>
            <div>Arrow Keys - Move</div>
            <div>Space - Fire Laser</div>
            <div>V - Change View (First Person/Top/Isometric)</div>
            <div>P - Change Background Music</div>
            <div>M - Toggle Music</div>
            <div>S - Toggle Sound Effects</div>
        `;
        this.startScreen.appendChild(controls);
        
        // Add tap/click instruction
        const instruction = document.createElement('div');
        instruction.style.color = 'white';
        instruction.style.fontSize = '24px';
        instruction.style.fontFamily = 'Arial, sans-serif';
        instruction.style.textAlign = 'center';
        instruction.style.padding = '20px';
        instruction.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        instruction.style.borderRadius = '10px';
        instruction.style.marginTop = '20px';
        instruction.style.animation = 'pulse 1.5s infinite';
        
        // Add pulse animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
        
        // Set instruction text based on device type
        instruction.textContent = this.isMobile ? 'Tap anywhere to start' : 'Press any key to start';
        this.startScreen.appendChild(instruction);
        
        // Add event listeners for both click and touch
        const startGame = () => {
            if (this.showStartScreen) {
                this.showStartScreen = false;
                this.startScreen.style.display = 'none';
                this.gameStarted = true;
                this.showNotification('Game started!');
            }
        };
        
        this.startScreen.addEventListener('click', startGame);
        this.startScreen.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent double-firing on mobile
            startGame();
        });
        
        document.body.appendChild(this.startScreen);
    }

    updateInputState() {
        // Update keyboard state
        this.inputState.keyboard = { ...this.keys };

        // Update gamepad state
        if (navigator.getGamepads) {
            const gamepads = navigator.getGamepads();
            if (gamepads[0]) {
                this.inputState.gamepad = gamepads[0];
            }
        }

        // Update touch state
        if (this.isMobile) {
            this.inputState.touch.leftJoystick = this.leftJoystick;
            this.inputState.touch.rightJoystick = this.rightJoystick;
        }
    }

    initializeAudio() {
        // Initialize audio context
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // Set up background music
            this.backgroundMusic = new Audio();
            this.backgroundMusic.loop = true;
            this.backgroundMusic.volume = 0.3;
            
            // Set up sound effects
            this.soundEnabled = true;
            this.musicEnabled = true;
            
            console.log('Audio initialized successfully');
        } catch (error) {
            console.error('Error initializing audio:', error);
            this.soundEnabled = false;
            this.musicEnabled = false;
        }
    }

    handleKeyDown(e) {
        // Handle view cycling with 'V' key
        if (e.key.toLowerCase() === 'v') {
            switch (this.viewMode) {
                case 'firstPerson':
                    this.viewMode = 'topView';
                    this.showNotification('Top View');
                    break;
                case 'topView':
                    this.viewMode = 'isometric';
                    this.showNotification('Isometric View');
                    break;
                case 'isometric':
                    this.viewMode = 'firstPerson';
                    this.showNotification('First Person View');
                    break;
            }
        }
        
        // Handle music change with 'P' key
        if (e.key.toLowerCase() === 'p') {
            this.changeBackgroundMusic();
        }
        
        // Handle music toggle with 'M' key
        if (e.key.toLowerCase() === 'm') {
            this.musicEnabled = !this.musicEnabled;
            if (this.backgroundMusic) {
                if (this.musicEnabled) {
                    this.backgroundMusic.play();
                    this.muteSlash.style.display = 'none';
                } else {
                    this.backgroundMusic.pause();
                    this.muteSlash.style.display = 'block';
                }
            }
            this.showNotification(this.musicEnabled ? 'Music Enabled' : 'Music Disabled');
        }
        
        // Handle sound toggle with 'S' key
        if (e.key.toLowerCase() === 's') {
            this.soundEnabled = !this.soundEnabled;
            this.showNotification(this.soundEnabled ? 'Sound Effects Enabled' : 'Sound Effects Disabled');
        }
        
        // Handle other keys
        this.keys[e.key] = true;
    }

    changeBackgroundMusic() {
        if (!this.backgroundMusic) return;
        
        // List of music URLs
        const musicUrls = [
            'https://www.openmusicarchive.org/audio/Dont_Go_Way_Nobody.mp3',
            'https://www.openmusicarchive.org/audio/Pinetops_Blues.mp3',
            // ... (all the URLs you provided)
            'https://www.openmusicarchive.org/audio/K%20C%20Railroad%20Blues%20by%20Andrew%20And%20Jim%20Baxter.mp3'
        ];
        
        // Get current music index or start at 0
        const currentIndex = this.backgroundMusic.dataset.index || 0;
        const nextIndex = (parseInt(currentIndex) + 1) % musicUrls.length;
        
        // Update music source
        this.backgroundMusic.src = musicUrls[nextIndex];
        this.backgroundMusic.dataset.index = nextIndex;
        
        // Play if music is enabled
        if (this.musicEnabled) {
            this.backgroundMusic.play();
        }
        
        // Extract song name from URL
        const songName = musicUrls[nextIndex].split('/').pop().replace('.mp3', '').replace(/_/g, ' ');
        this.showNotification(`Now playing: ${songName}`);
    }

    handleKeyUp(e) {
        this.keys[e.key] = false;
    }

    resetGame() {
        // Reset game state
        this.gameStatus = 'waiting';
        this.roundNumber = 0;
        this.eliminatedPlayers = new Set();
        
        // Reset player state
        if (this.kart) {
            this.kart.position.set(0, 0, 0);
            this.kart.rotation.y = Math.PI;
            if (this.playerKartMesh) {
                this.playerKartMesh.position.copy(this.kart.position);
                this.playerKartMesh.rotation.copy(this.kart.rotation);
            }
        }
        
        // Reset camera
        this.viewMode = 'firstPerson';
        this.updateCamera();
        
        // Reset UI
        this.updateUI();
    }

    updateUI() {
        // Update game status display
        if (this.gameStatus === 'waiting') {
            this.showNotification('Waiting for players...');
        } else if (this.gameStatus === 'active') {
            this.showNotification('Game in progress!');
        } else if (this.gameStatus === 'finished') {
            this.showNotification('Game Over!');
        }
        
        // Update spectator UI
        this.updateSpectatorUI();
        
        // Update sound icon
        if (this.muteSlash) {
            this.muteSlash.style.display = this.musicEnabled ? 'none' : 'block';
        }
    }
}

// ... rest of the code ... 