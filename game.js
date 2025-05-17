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

// Wait for DOM to be fully loaded
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
    
    console.log('Event listeners added for game start');
});

// ... rest of the existing code ... 