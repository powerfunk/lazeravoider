import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { io } from 'https://cdn.socket.io/4.7.4/socket.io.esm.min.js';
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
        
        // Music URLs array - specific URLs from openmusicarchive.org
        this.musicUrls = [
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
            'https://www.openmusicarchive.org/audio/Drunkards%20Special%20by%20Coley%20Jones.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Lady%20And%20The%20Devil%20by%20Bill%20And%20Belle%20Reed.mp3',
            'https://www.openmusicarchive.org/audio/The%20Butchers%20Boy%20by%20Buell%20Kazee.mp3',
            'https://www.openmusicarchive.org/audio/The%20Wagoners%20Lad%20by%20Buell%20Kazee.mp3',
            'https://www.openmusicarchive.org/audio/King%20Kong%20Kitchie%20Kitchie%20Kimio%20by%20Chubby%20Parker%20And%20His%20Old%20Time%20Banjo.mp3',
            'https://www.openmusicarchive.org/audio/Willie%20Moore%20by%20Burnett%20And%20Rutherford.mp3',
            'https://www.openmusicarchive.org/audio/A%20Lazy%20Farmer%20Boy%20by%20Buster%20Carter%20And%20Preston%20Young.mp3',
            'https://www.openmusicarchive.org/audio/Peg%20And%20Awl%20by%20The%20Carolina%20Tar%20Heels.mp3',
            'https://www.openmusicarchive.org/audio/Ommie%20Wise%20by%20G%20B%20Grayson.mp3',
            'https://www.openmusicarchive.org/audio/My%20Name%20Is%20John%20Johanna%20by%20Kelly%20Harrell%20And%20The%20Virginia%20String%20Band.mp3',
            'https://www.openmusicarchive.org/audio/Charles%20Giteau%20by%20Kelly%20Harrell.mp3',
            'https://www.openmusicarchive.org/audio/White%20House%20Blues%20by%20Charlie%20Poole%20With%20The%20North%20Carolina%20Ramblers.mp3',
            'https://www.openmusicarchive.org/audio/Frankie%20by%20Mississippi%20John%20Hurt.mp3',
            'https://www.openmusicarchive.org/audio/Mississippi%20Boweavil%20Blues%20by%20The%20Masked%20Marvel.mp3',
            'https://www.openmusicarchive.org/audio/Sail%20Away%20Lady%20by%20Uncle%20Bunt%20Stephens.mp3',
            'https://www.openmusicarchive.org/audio/The%20Wild%20Wagoner%20by%20Jilson%20Setters.mp3',
            'https://www.openmusicarchive.org/audio/Wake%20Up%20Jacob%20by%20Prince%20Albert%20Hunts%20Texas%20Ramblers.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Dog%20Blue%20by%20Jim%20Jackson.mp3',
            'https://www.openmusicarchive.org/audio/Since%20I%20Laid%20My%20Burden%20Down%20by%20The%20Elders%20Mcintorsh%20And%20Edwards%27%20Sanctified%20Singers.mp3',
            'https://www.openmusicarchive.org/audio/Dry%20Bones%20by%20Bascom%20Lamar%20Lunsford.mp3',
            'https://www.openmusicarchive.org/audio/John%20The%20Revelator%20by%20Blind%20Willie%20Johnson.mp3',
            'https://www.openmusicarchive.org/audio/Fifty%20Miles%20Of%20Elbow%20Room%20by%20Reverend%20F%20M%20Mcgee.mp3',
            'https://www.openmusicarchive.org/audio/The%20Coo%20Coo%20Bird%20by%20Clarence%20Ashley.mp3',
            'https://www.openmusicarchive.org/audio/East%20Virginia%20by%20Buell%20Kazee.mp3',
            'https://www.openmusicarchive.org/audio/James%20Alley%20Blues%20by%20Richard%20Rabbit%20Brown.mp3',
            'https://www.openmusicarchive.org/audio/Sugar%20Baby%20by%20Dock%20Boggs.mp3',
            'https://www.openmusicarchive.org/audio/I%20Wish%20I%20Was%20A%20Mole%20In%20The%20Ground%20by%20Bascom%20Lamar%20Lunsford.mp3',
            'https://www.openmusicarchive.org/audio/The%20Mountaineers%20Courtship%20by%20Mr%20And%20Mrs%20Ernest%20V%20Stoneman.mp3',
            'https://www.openmusicarchive.org/audio/Le%20Vieux%20Soulard%20Et%20Sa%20Femme%20by%20Cleoma%20Breaux%20And%20Joseph%20Falcon.mp3',
            'https://www.openmusicarchive.org/audio/Rabbit%20Foot%20Blues%20by%20Blind%20Lemon%20Jefferson.mp3',
            'https://www.openmusicarchive.org/audio/See%20That%20My%20Grave%20Is%20Kept%20Clean%20by%20Blind%20Lemon%20Jefferson.mp3',
            'https://www.openmusicarchive.org/audio/The%20Lone%20Star%20Trail%20by%20Ken%20Maynard.mp3',
            'https://www.openmusicarchive.org/audio/Loving%20Henry%20by%20Joan%20Obryant.mp3',
            'https://www.openmusicarchive.org/audio/House%20Carpenter%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20House%20Carpenter%20by%20Mrs%20Texas%20Gladden.mp3',
            'https://www.openmusicarchive.org/audio/House%20Carpenter%20by%20William%20Edens.mp3',
            'https://www.openmusicarchive.org/audio/House%20Carpenter%20by%20Mrs%20Doug%20Ina%20Harvey.mp3',
            'https://www.openmusicarchive.org/audio/House%20Carpenter%20by%20Allie%20Long%20Parker.mp3',
            'https://www.openmusicarchive.org/audio/The%20House%20Carpenter%20by%20Lucy%20Quigley.mp3',
            'https://www.openmusicarchive.org/audio/The%20House%20Carpenter%20by%20Roxie%20Phillips.mp3',
            'https://www.openmusicarchive.org/audio/Drunken%20Fool%20by%20Doris%20Venie.mp3',
            'https://www.openmusicarchive.org/audio/Our%20Goodman%20by%20Thomas%20Moran.mp3',
            'https://www.openmusicarchive.org/audio/Farmers%20Curst%20Wife%20by%20Mrs%20May%20Kennedy%20Mccord.mp3',
            'https://www.openmusicarchive.org/audio/Devils%20Curst%20Wife%20by%20Johnny%20Morris.mp3',
            'https://www.openmusicarchive.org/audio/Devil%20Doings%20by%20Mrs%20George%20Ripley.mp3',
            'https://www.openmusicarchive.org/audio/The%20Devil%20by%20Jimmy%20White.mp3',
            'https://www.openmusicarchive.org/audio/The%20Butcher%20Boy%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20Wagoners%20Lad%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Pretty%20Saro%20by%20Guy%20Carawan.mp3',
            'https://www.openmusicarchive.org/audio/The%20Rose%20Of%20Naideen%20by%20Mrs%20Laura%20Mcdonald.mp3',
            'https://www.openmusicarchive.org/audio/My%20Horses%20Aint%20Hungry%20by%20Mrs%20Haden%20Robinson.mp3',
            'https://www.openmusicarchive.org/audio/My%20Horses%20Aint%20Hungry%20by%20Mrs%20Kenneth%20Wright%20And%20Mrs%20Gladys%20Jennings.mp3',
            'https://www.openmusicarchive.org/audio/The%20Wagoners%20Lad%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Frog%20Went%20A%20Courtin%20by%20Odis%20Bird.mp3',
            'https://www.openmusicarchive.org/audio/Froggie%20Went%20A%20Courting%20by%20J.%20W.%20Breazeal.mp3',
            'https://www.openmusicarchive.org/audio/Uncle%20Rat%20Went%20Out%20To%20Ride%20The%20Frog%20And%20The%20Mouse%20by%20Elizabeth%20Cronin.mp3',
            'https://www.openmusicarchive.org/audio/With%20His%20Long%20Cane%20Pipe%20A%20Smokin%20by%20Mr%20Clyde%20Johnson.mp3',
            'https://www.openmusicarchive.org/audio/With%20His%20Old%20Gray%20Beard%20A%20Shining%20by%20Mrs%20Laura%20Mcdonald%20And%20Reba%20Glaze.mp3',
            'https://www.openmusicarchive.org/audio/With%20His%20Ole%20Gray%20Beard%20A%20Shining%20by%20Mrs%20Pearl%20Brewer.mp3',
            'https://www.openmusicarchive.org/audio/Sweet%20William%20And%20Lady%20Margaret%20by%20Jean%20Ritchie.mp3',
            'https://www.openmusicarchive.org/audio/Willie%20Moore%20by%20Fred%20Starr.mp3',
            'https://www.openmusicarchive.org/audio/The%20Young%20Man%20Who%20Wouldnt%20Raise%20Corn%20by%20Jean%20Ritchie%20And%20Family.mp3',
            'https://www.openmusicarchive.org/audio/The%20Young%20Man%20Who%20Wouldnt%20Hoe%20Corn%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Peg%20And%20Awl%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Omie%20Wise%20by%20Obray%20Ramsey.mp3',
            'https://www.openmusicarchive.org/audio/Naomi%20Wise%20by%20Paul%20Clayton.mp3',
            'https://www.openmusicarchive.org/audio/Little%20Omie%20by%20Harrison%20Burnett.mp3',
            'https://www.openmusicarchive.org/audio/Arkansas%20by%20Henry%20Thomas.mp3',
            'https://www.openmusicarchive.org/audio/Cole%20Younger%20by%20Mr%20William%20Edens.mp3',
            'https://www.openmusicarchive.org/audio/Cole%20Younger%20by%20Warde%20Ford.mp3',
            'https://www.openmusicarchive.org/audio/Charles%20Guiteau%20by%20Mr%20Lo%20Smith.mp3',
            'https://www.openmusicarchive.org/audio/John%20Hardy%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/John%20Hardy%20by%20Paul%20Clayton.mp3',
            'https://www.openmusicarchive.org/audio/John%20Henry%20by%20Odis%20Bird.mp3',
            'https://www.openmusicarchive.org/audio/John%20Henry%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/John%20Henry%20by%20Paul%20Clayton.mp3',
            'https://www.openmusicarchive.org/audio/John%20Henry%20by%20Wise%20Jones.mp3',
            'https://www.openmusicarchive.org/audio/Stagolee%20by%20Cisco%20Houston.mp3',
            'https://www.openmusicarchive.org/audio/The%20Unlucky%20Road%20To%20Washington%20by%20Ernest%20Stoneman%20And%20His%20Dixie%20Mountaineers.mp3',
            'https://www.openmusicarchive.org/audio/White%20House%20Blues%20by%20The%20New%20Lost%20City%20Ramblers.mp3',
            'https://www.openmusicarchive.org/audio/Frankie%20by%20Paul%20Clayton.mp3',
            'https://www.openmusicarchive.org/audio/Frankie%20by%20Mrs%20Oakley%20Fox.mp3',
            'https://www.openmusicarchive.org/audio/Frankie%20And%20Johnny%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20Titanic%20Disaster%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Ship%20Titanic%20Songs%20Of%20Camp%20by%20Ed%20Badeaux.mp3',
            'https://www.openmusicarchive.org/audio/The%20Brave%20Engineer%20by%20Roy%20Harvey.mp3',
            'https://www.openmusicarchive.org/audio/Casey%20Jones%20The%20Union%20Scab%20by%20Harry%20Mcclintock.mp3',
            'https://www.openmusicarchive.org/audio/Casey%20Jones%20by%20Mrs%20Laura%20Mcdonald%20And%20Reba%20Glaze.mp3',
            'https://www.openmusicarchive.org/audio/Casey%20Jones%20by%20Mr%20T%20R%20Hammond.mp3',
            'https://www.openmusicarchive.org/audio/Hard%20Times%20In%20The%20Mill%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20Boll%20Weevil%20by%20Ramblin%20Jack%20Elliot.mp3',
            'https://www.openmusicarchive.org/audio/The%20Boll%20Weevil%20by%20Hermes%20Nye.mp3',
            'https://www.openmusicarchive.org/audio/The%20Boll%20Weevil%20by%20Amy%20Pridemore.mp3',
            'https://www.openmusicarchive.org/audio/Sail%20Away%20Ladies%20by%20The%20Wagoners.mp3',
            'https://www.openmusicarchive.org/audio/Sail%20Away%20Ladies%20by%20Guy%20Carawan.mp3',
            'https://www.openmusicarchive.org/audio/Tennessee%20Wagoner%20by%20Ray%20Sosbee.mp3',
            'https://www.openmusicarchive.org/audio/Wagoner%20by%20John%20Morgan%20Salyer.mp3',
            'https://www.openmusicarchive.org/audio/Wagoner%20One%20Step%20Version%201%20by%20Isham%20Monday.mp3',
            'https://www.openmusicarchive.org/audio/Wagoner%20One%20Step%20Version%202%20by%20Isham%20Monday.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Blue%20by%20Joan%20Obryant.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Blue%20by%20Cisco%20Houston.mp3',
            'https://www.openmusicarchive.org/audio/Old%20Blue%20by%20Guy%20Carawan.mp3',
            'https://www.openmusicarchive.org/audio/Home%20Sweet%20Home%20by%20Nellie%20Melba.mp3',
            'https://www.openmusicarchive.org/audio/Cowboys%20Home%20Sweet%20Home%20by%20Mrs%20Iva%20Haslett.mp3',
            'https://www.openmusicarchive.org/audio/Cowboys%20Home%20Sweet%20Home%20by%20Nancy%20Philley.mp3',
            'https://www.openmusicarchive.org/audio/At%20The%20Cross%20by%20Fiddlin%20John%20Carson.mp3',
            'https://www.openmusicarchive.org/audio/Glory%20Glory%20by%20Odetta.mp3',
            'https://www.openmusicarchive.org/audio/When%20I%20Lay%20My%20Burdens%20Down%20by%20Blind%20Roosevelt%20Graves.mp3',
            'https://www.openmusicarchive.org/audio/John%20Said%20He%20Saw%20A%20Number%20by%20Arizona%20Dranes.mp3',
            'https://www.openmusicarchive.org/audio/John%20The%20Revelator%20by%20The%20Golden%20Gate%20Quartet.mp3',
            'https://www.openmusicarchive.org/audio/Little%20Moses%20by%20Mrs%20Iva%20Haslett.mp3',
            'https://www.openmusicarchive.org/audio/Shine%20On%20Me%20by%20The%20Wiseman%20Sextette.mp3',
            'https://www.openmusicarchive.org/audio/Let%20Your%20Light%20Shine%20On%20Me%20by%20Blind%20Willie%20Johnson.mp3',
            'https://www.openmusicarchive.org/audio/The%20Coo%20Coo%20by%20Mr%20And%20Mrs%20John%20Sams.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20Shes%20A%20Fine%20Bird%20by%20Kelly%20Harrell.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20by%20Lillie%20Steele.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20Shes%20A%20Pretty%20Bird%20by%20Jean%20Ritchie.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20by%20Jean%20Ritchie.mp3',
            'https://www.openmusicarchive.org/audio/The%20Cuckoo%20by%20Bill%20Westaway.mp3',
            'https://www.openmusicarchive.org/audio/False%20Hearted%20Lover%20by%20Olivia%20Hauser.mp3',
            'https://www.openmusicarchive.org/audio/East%20Virginia%20by%20Pete%20Steele.mp3',
            'https://www.openmusicarchive.org/audio/East%20Virginia%20by%20Cisco%20Houston.mp3',
            'https://www.openmusicarchive.org/audio/Mole%20In%20The%20Ground%20by%20Logan%20English.mp3',
            'https://www.openmusicarchive.org/audio/Mole%20In%20The%20Ground%20by%20Bascom%20Lamar%20Lunsford.mp3',
            'https://www.openmusicarchive.org/audio/Go%20Tell%20Aunt%20Rhody%20by%20Woody%20Guthrie.mp3',
            'https://www.openmusicarchive.org/audio/Go%20Tell%20Aunt%20Nancy%20by%20Mrs%20Shirley%20Lomax%20Mansell.mp3',
            'https://www.openmusicarchive.org/audio/The%20Old%20Grey%20Goose%20by%20The%20Carolina%20Tar%20Heels.mp3',
            'https://www.openmusicarchive.org/audio/What%20Shall%20I%20Wear%20To%20The%20Wedding%20John%20by%20Aunt%20Fanny%20Rumble%20Albert%20Collins.mp3',
            'https://www.openmusicarchive.org/audio/All%20Of%20Her%20Answers%20Were%20No%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/No%20Sir%20No%20Sir%20by%20Sam%20Larner.mp3',
            'https://www.openmusicarchive.org/audio/No%20Sir%20No%20Sir%20by%20Mary%20Jo%20Davis.mp3',
            'https://www.openmusicarchive.org/audio/No%20Sir%20Oh%20No%20John%20by%20Emily%20Bishop.mp3',
            'https://www.openmusicarchive.org/audio/When%20I%20Was%20Single%20by%20Peggy%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/The%20Drunken%20Man%20by%20D%20J%20Dom%20Ingenthron.mp3',
            'https://www.openmusicarchive.org/audio/Single%20Girl%20by%20Julius%20Sutton.mp3',
            'https://www.openmusicarchive.org/audio/I%20Wish%20I%20Was%20A%20Single%20Girl%20Again%20by%20Kelly%20Harrell.mp3',
            'https://www.openmusicarchive.org/audio/Good%20Ole%20Husband%20by%20Violet%20Smith.mp3',
            'https://www.openmusicarchive.org/audio/My%20Dear%20Old%20Husband%20by%20Odis%20Bird.mp3',
            'https://www.openmusicarchive.org/audio/My%20Good%20Ole%20Man%20by%20Laura%20Mcdonald%20And%20Reba%20Glaze.mp3',
            'https://www.openmusicarchive.org/audio/My%20Kind%20Old%20Husband%20by%20Mrs%20Pearl%20Brewer.mp3',
            'https://www.openmusicarchive.org/audio/My%20Kind%20Old%20Husband%20by%20Charley%20W%20Igenthron.mp3',
            'https://www.openmusicarchive.org/audio/Poor%20Boy%20A%20Long%20Ways%20From%20Home%20by%20Barbecue%20Bob.mp3',
            'https://www.openmusicarchive.org/audio/Dig%20My%20Grave%20With%20A%20Silver%20Spade%20by%20Tom%20Dutson.mp3',
            'https://www.openmusicarchive.org/audio/See%20That%20My%20Grave%20Is%20Kept%20Clean%20by%20Bob%20Dylan.mp3',
            'https://www.openmusicarchive.org/audio/Two%20White%20Horses%20Standin%20In%20Line%20by%20Smith%20Cason.mp3',
            'https://www.openmusicarchive.org/audio/Roll%20Down%20The%20Line%20by%20Pete%20Seeger.mp3',
            'https://www.openmusicarchive.org/audio/Goin%20Down%20The%20Road%20Feelin%20Bad%20by%20Cliff%20Carlisle.mp3',
            'https://www.openmusicarchive.org/audio/Im%20Going%20Down%20The%20Road%20by%20J%20Kearns%20Planche.mp3',
            'https://www.openmusicarchive.org/audio/Im%20Going%20Down%20This%20Road%20Feelin%20Bad%20by%20Warde%20Ford.mp3',
            'https://www.openmusicarchive.org/audio/Going%20Down%20The%20Road%20Feeling%20Bad%20by%20Ruth%20Huber%20And%20Lois%20Judd.mp3',
            'https://www.openmusicarchive.org/audio/Im%20Goin%20Down%20The%20Road%20Feelin%20Bad%20by%20Gussie%20Ward%20Stone.mp3',
            'https://www.openmusicarchive.org/audio/K%20C%20Railroad%20Blues%20by%20Andrew%20And%20Jim%20Baxter.mp3'
        ];
        
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
    }

    initMobileControls() {
        // Create container for left joystick (movement)
        const leftJoystickContainer = document.createElement('div');
        leftJoystickContainer.style.position = 'absolute';
        leftJoystickContainer.style.bottom = '20px';
        leftJoystickContainer.style.left = '20px';
        leftJoystickContainer.style.width = '150px';
        leftJoystickContainer.style.height = '150px';
        leftJoystickContainer.style.zIndex = '1000';
        document.body.appendChild(leftJoystickContainer);

        // Create container for right joystick (rotation)
        const rightJoystickContainer = document.createElement('div');
        rightJoystickContainer.style.position = 'absolute';
        rightJoystickContainer.style.bottom = '20px';
        rightJoystickContainer.style.right = '20px';
        rightJoystickContainer.style.width = '150px';
        rightJoystickContainer.style.height = '150px';
        rightJoystickContainer.style.zIndex = '1000';
        document.body.appendChild(rightJoystickContainer);

        // Initialize left joystick (movement)
        this.leftJoystick = nipplejs.create({
            zone: leftJoystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120
        });

        // Initialize right joystick (rotation)
        this.rightJoystick = nipplejs.create({
            zone: rightJoystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120
        });

        // Handle left joystick events (movement)
        this.leftJoystick.on('move', (evt, data) => {
            if (!this.gameStarted || this.countdownActive) return;
            
            // Convert joystick position to movement
            const angle = data.angle.radian;
            const force = Math.min(data.force, 1);
            
            // Update movement keys based on joystick position
            this.keys.ArrowUp = force > 0.1 && angle > -Math.PI/2 && angle < Math.PI/2;
            this.keys.ArrowDown = force > 0.1 && (angle > Math.PI/2 || angle < -Math.PI/2);
        });

        // Handle right joystick events (rotation)
        this.rightJoystick.on('move', (evt, data) => {
            if (!this.gameStarted || this.countdownActive) return;
            
            // Convert joystick position to rotation
            const angle = data.angle.radian;
            const force = Math.min(data.force, 1);
            
            // Update rotation keys based on joystick position
            this.keys.ArrowLeft = force > 0.1 && angle > Math.PI/2 && angle < Math.PI * 1.5;
            this.keys.ArrowRight = force > 0.1 && (angle > -Math.PI/2 && angle < Math.PI/2);
        });

        // Reset keys when joysticks are released
        this.leftJoystick.on('end', () => {
            this.keys.ArrowUp = false;
            this.keys.ArrowDown = false;
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
        mobileControls.style.zIndex = '1000';
        mobileControls.innerHTML = `
            <div>Left Stick - Move</div>
            <div>Right Stick - Rotate</div>
        `;
        document.body.appendChild(mobileControls);
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
            color: this.kart.color // Include color in the update
        });
    }

    animate() {
        if (!this.isReady) {
            requestAnimationFrame(() => this.animate());
            return;
        }
        
        // Only proceed if karts are initialized
        if (!this.kart || !this.playerKartMesh) {
            requestAnimationFrame(() => this.animate());
            return;
        }
        
        // If game hasn't started or is in countdown, just render the scene
        if (!this.gameStarted || this.countdownActive) {
            this.renderer.render(this.scene, this.camera);
            requestAnimationFrame(() => this.animate());
            return;
        }
        
        // Update survival time every 6 frames (0.1 seconds)
        if (this.kart && !this.eliminatedPlayers.has(this.socket.id)) {
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
        
        // Update camera position
        this.updateCamera();
        
        // Update kart meshes
        this.updateKartMeshes();
        
        // Update lasers and check collisions
        this.lasers = this.lasers.filter(laser => {
            // Check for collision with player
            if (!this.eliminatedPlayers.has(this.socket.id) && laser.checkCollision(this.kart)) {
                // Player hit! Eliminate them
                this.eliminatedPlayers.add(this.socket.id);
                
                // Format survival time
                const minutes = Math.floor(this.kart.survivalTime / 60);
                const seconds = (this.kart.survivalTime % 60).toFixed(1);
                const timeStr = `${minutes}:${seconds.padStart(4, '0')}`;
                
                // Show elimination message with survival time
                this.showAchievementNotification(`You were eliminated! Survival time: ${timeStr}`);
                
                // Update UI to show spectator mode
                if (this.survivalTimeDisplay) {
                    this.survivalTimeDisplay.textContent = `Spectator Mode - Eliminated at ${timeStr}`;
                }
                
                // Notify server of elimination
                this.socket.emit('playerEliminated', {
                    id: this.socket.id,
                    survivalTime: this.kart.survivalTime
                });
                
                // Check if game should end
                this.checkGameEnd();
                return false;
            }
            return laser.update();
        });
        
        // Update CPU karts
        this.cpuKarts.forEach((kart, index) => {
            if (kart.update(this.keys, this.kart)) {
                // Create laser if CPU kart fired
                const laser = new Laser(
                    kart.position.x,
                    kart.position.z,
                    kart.rotation.y,
                    kart.color
                );
                
                const laserGeometry = new THREE.SphereGeometry(0.2, 8, 8);
                const laserMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
                laser.mesh = new THREE.Mesh(laserGeometry, laserMaterial);
                laser.mesh.position.copy(laser.position);
                laser.mesh.scale.set(4, 4, 4); // Start at 4x size
                this.scene.add(laser.mesh);
                this.lasers.push(laser);
                
                // Play laser sound
                if (this.soundEnabled && this.laserSounds.length > 0) {
                    const sound = this.laserSounds[Math.floor(Math.random() * this.laserSounds.length)];
                    sound.currentTime = 0;
                    sound.play().catch(e => console.log('Sound play failed:', e));
                }
            }
        });
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
        
        // Continue animation loop
        requestAnimationFrame(() => this.animate());
    }

    checkGameEnd() {
        // Get total number of players (including self)
        const totalPlayers = this.otherPlayers.size + 1;
        const eliminatedCount = this.eliminatedPlayers.size;
        
        // If all but one player is eliminated, end the game
        if (eliminatedCount >= totalPlayers - 1) {
            // Find the winner (the one not eliminated)
            const winner = Array.from(this.otherPlayers.keys())
                .find(id => !this.eliminatedPlayers.has(id)) || this.socket.id;
            
            // Show winner announcement
            if (winner === this.socket.id) {
                this.showAchievementNotification('You won! Last player standing!');
            } else {
                this.showAchievementNotification('Game Over! Another player won!');
            }
            
            // Reset game after a delay
            setTimeout(() => this.resetGame(), 3000);
        }
    }

    resetGame() {
        // Reset game state
        this.gameOver = false;
        this.gameStarted = false;
        this.countdown = 3;
        this.lastCountdownValue = 4;
        this.eliminatedPlayers.clear();
        
        // Show start screen
        this.startScreen.style.display = 'flex';
        
        // Reset player position
        if (this.kart) {
            this.kart.position.set(0, 0, 0);
            this.kart.rotation.y = Math.PI; // Start facing north
            this.kart.velocity.set(0, 0, 0);
            this.kart.survivalTime = 0;
        }
        
        // Clear existing lasers
        this.lasers.forEach(laser => {
            if (laser.mesh) {
                this.scene.remove(laser.mesh);
            }
        });
        this.lasers = [];
        
        // Reset CPU karts
        this.cpuKarts.forEach((kart, index) => {
            if (this.cpuKartMeshes[index]) {
                this.scene.remove(this.cpuKartMeshes[index]);
            }
        });
        this.cpuKarts = [];
        this.cpuKartMeshes = [];
        
        // Create new CPU karts
        const numCPU = 5;
        for (let i = 0; i < numCPU; i++) {
            const angle = (i / numCPU) * Math.PI * 2;
            const radius = 20;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            const cpuKart = new Kart(x, z, true, i * 30);
            const cpuMesh = cpuKart.createMesh();
            this.scene.add(cpuMesh);
            this.cpuKarts.push(cpuKart);
            this.cpuKartMeshes.push(cpuMesh);
        }
        
        // Reset survival time display
        if (this.survivalTimeDisplay) {
            this.survivalTimeDisplay.textContent = 'Survival Time: 0:00.0';
        }
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            // Debug log for key presses
            console.log('Key pressed:', e.key, 'Game started:', this.gameStarted, 'Countdown active:', this.countdownActive);
            
            // Only handle game controls if the game has started and countdown is not active
            if (!this.gameStarted || this.countdownActive) {
                return;
            }
            
            if (this.gameOver) {
                this.resetGame();
                return;
            }
            
            // Handle movement keys
            if (e.key in this.keys) {
                e.preventDefault();
                this.keys[e.key] = true;
            }
            
            // Handle other controls
            if (e.key === 'v') {
                e.preventDefault();
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
            }
            
            if (e.key === 'p') {
                e.preventDefault();
                this.changeSong();
            }
            
            if (e.key === 'm') {
                e.preventDefault();
                this.toggleMute();
            }
        });

        window.addEventListener('keyup', (e) => {
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

        // Handle other players being eliminated
        this.socket.on('playerEliminated', (data) => {
            this.eliminatedPlayers.add(data.id);
            
            // Format the eliminated player's survival time
            const minutes = Math.floor(data.survivalTime / 60);
            const seconds = (data.survivalTime % 60).toFixed(1);
            const timeStr = `${minutes}:${seconds.padStart(4, '0')}`;
            
            this.showAchievementNotification(`Player ${data.id} was eliminated! Survival time: ${timeStr}`);
            this.checkGameEnd();
        });

        // Add gamepad support
        window.addEventListener('gamepadconnected', (e) => {
            console.log('Gamepad connected:', e.gamepad);
            this.gamepad = e.gamepad;
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('Gamepad disconnected:', e.gamepad);
            this.gamepad = null;
        });

        // Add gamepad polling to animation loop
        const originalAnimate = this.animate.bind(this);
        this.animate = function() {
            // Poll gamepad state
            if (this.gamepad) {
                const gamepads = navigator.getGamepads();
                const gamepad = gamepads[this.gamepad.index];
                if (gamepad) {
                    // Left stick for movement
                    const leftStickX = gamepad.axes[0];
                    const leftStickY = gamepad.axes[1];
                    
                    // Right stick for rotation
                    const rightStickX = gamepad.axes[2];
                    
                    // Update movement keys based on left stick
                    this.keys.ArrowUp = leftStickY < -0.5;
                    this.keys.ArrowDown = leftStickY > 0.5;
                    
                    // Update rotation keys based on right stick
                    this.keys.ArrowLeft = rightStickX < -0.5;
                    this.keys.ArrowRight = rightStickX > 0.5;
                    
                    // Update last gamepad state
                    this.lastGamepadState = gamepad;
                }
            }
            
            // Call original animate function
            originalAnimate();
        };
    }

    startCountdown() {
        let count = 3;
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                this.countdownDisplay.textContent = count.toString();
            } else {
                this.countdownDisplay.style.display = 'none';
                clearInterval(countdownInterval);
            }
        }, 1000);
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

        // Create start screen
        this.startScreen = document.createElement('div');
        this.startScreen.style.position = 'absolute';
        this.startScreen.style.top = '0';
        this.startScreen.style.left = '0';
        this.startScreen.style.width = '100%';
        this.startScreen.style.height = '100%';
        this.startScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.startScreen.style.display = 'flex';
        this.startScreen.style.flexDirection = 'column';
        this.startScreen.style.justifyContent = 'center';
        this.startScreen.style.alignItems = 'center';
        this.startScreen.style.color = 'white';
        this.startScreen.style.fontFamily = 'Arial, sans-serif';
        this.startScreen.innerHTML = `
            <h1 style="font-size: 48px; margin-bottom: 20px;">LazerAvoider</h1>
            <div style="font-size: 24px; margin-bottom: 40px;">Press SPACE to Start</div>
            <div style="font-size: 20px; text-align: center; max-width: 600px;">
                <p>Dodge the lasers from the CPU karts!</p>
                <p>Use arrow keys to move and dodge.</p>
                <p>Press V to change camera view.</p>
                <p>Press P to change music.</p>
                <p>Press M to mute/unmute.</p>
            </div>
        `;
        this.uiContainer.appendChild(this.startScreen);

        // Create countdown display
        this.countdownDisplay = document.createElement('div');
        this.countdownDisplay.style.position = 'absolute';
        this.countdownDisplay.style.top = '50%';
        this.countdownDisplay.style.left = '50%';
        this.countdownDisplay.style.transform = 'translate(-50%, -50%)';
        this.countdownDisplay.style.fontSize = '72px';
        this.countdownDisplay.style.color = 'white';
        this.countdownDisplay.style.fontFamily = 'Arial, sans-serif';
        this.countdownDisplay.style.display = 'none';
        this.countdownDisplay.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
        this.uiContainer.appendChild(this.countdownDisplay);

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

    createStartScreen() {
        // Create start screen container
        this.startScreen = document.createElement('div');
        this.startScreen.style.position = 'absolute';
        this.startScreen.style.top = '0';
        this.startScreen.style.left = '0';
        this.startScreen.style.width = '100%';
        this.startScreen.style.height = '100%';
        this.startScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.startScreen.style.display = 'flex';
        this.startScreen.style.flexDirection = 'column';
        this.startScreen.style.justifyContent = 'center';
        this.startScreen.style.alignItems = 'center';
        this.startScreen.style.color = 'white';
        this.startScreen.style.fontFamily = 'Arial, sans-serif';
        this.startScreen.style.zIndex = '1000';
        
        // Add title
        const title = document.createElement('h1');
        title.textContent = 'LazerAvoider';
        title.style.fontSize = '48px';
        title.style.marginBottom = '20px';
        this.startScreen.appendChild(title);
        
        // Add instructions
        const instructions = document.createElement('div');
        instructions.style.textAlign = 'center';
        instructions.style.marginBottom = '30px';
        instructions.innerHTML = `
            <h2>How to Play:</h2>
            <p>Arrow Keys - Move your kart</p>
            <p>V - Change camera view</p>
            <p>P - Change background music</p>
            <p>M - Mute/Unmute sound</p>
            <p>Avoid the lasers from CPU karts!</p>
        `;
        this.startScreen.appendChild(instructions);
        
        // Add start button
        const startButton = document.createElement('button');
        startButton.textContent = 'Start Game';
        startButton.style.padding = '15px 30px';
        startButton.style.fontSize = '24px';
        startButton.style.backgroundColor = '#4CAF50';
        startButton.style.color = 'white';
        startButton.style.border = 'none';
        startButton.style.borderRadius = '5px';
        startButton.style.cursor = 'pointer';
        startButton.onclick = () => this.startGame();
        this.startScreen.appendChild(startButton);
        
        // Create countdown element
        this.countdownElement = document.createElement('div');
        this.countdownElement.style.position = 'absolute';
        this.countdownElement.style.top = '50%';
        this.countdownElement.style.left = '50%';
        this.countdownElement.style.transform = 'translate(-50%, -50%)';
        this.countdownElement.style.fontSize = '72px';
        this.countdownElement.style.color = 'white';
        this.countdownElement.style.fontFamily = 'Arial, sans-serif';
        this.countdownElement.style.display = 'none';
        this.countdownElement.style.zIndex = '1000';
        this.countdownElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.countdownElement.style.padding = '20px';
        this.countdownElement.style.borderRadius = '10px';
        
        document.body.appendChild(this.startScreen);
        document.body.appendChild(this.countdownElement);
    }

    startGame() {
        // Hide start screen
        this.showStartScreen = false;
        this.startScreen.style.display = 'none';
        
        // Start countdown
        this.countdownActive = true;
        this.countdownValue = 3;
        this.countdownElement.style.display = 'block';
        this.countdownElement.textContent = this.countdownValue;
        
        // Start countdown
        const countdownInterval = setInterval(() => {
            this.countdownValue--;
            if (this.countdownValue > 0) {
                this.countdownElement.textContent = this.countdownValue;
            } else {
                clearInterval(countdownInterval);
                this.countdownElement.style.display = 'none';
                this.countdownActive = false;
                this.gameStarted = true;
                
                // Remove any remaining overlays
                if (this.startScreen) {
                    this.startScreen.style.display = 'none';
                }
                if (this.countdownElement) {
                    this.countdownElement.style.display = 'none';
                }
                
                // Force a render update
                this.renderer.render(this.scene, this.camera);
                
                console.log('Game started! Countdown finished, gameStarted:', this.gameStarted);
            }
        }, 1000);
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
        // Create floor
        const floorGeometry = new THREE.PlaneGeometry(80, 80);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.1;
        this.scene.add(floor);

        // Create walls
        const wallGeometry = new THREE.BoxGeometry(80, 10, 1);
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
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