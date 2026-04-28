document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Eye Animations
    const pibEyes = new PibEyes();

    // 2. Initialize ROS Client
    // Can optionally read from an environment variable or config, defaulting to ws://localhost:9090
    const rosClient = new PibRosClient('ws://localhost:9090');

    // UI Elements
    const idleContainer = document.getElementById('idle-container');
    const activeContainer = document.getElementById('active-container');
    const snippetContainer = document.getElementById('snippet-container');
    const hangmanContainer = document.getElementById('hangman-container');
    const fullscreenBtn = document.getElementById('fullscreen-toggle');

    window.pibRosClientInstance = rosClient;
    window.pibHangman = new PibHangman();

    rosClient.onHangmanStateReceived = (state) => {
        if (window.pibHangman) {
            window.pibHangman.updateGameState(state);
        }
    };

    // 3. Command Handler from ROS
    rosClient.onCommandReceived = (payload) => {
        /*
         Expected Payload Formats:
         { "mode": "idle", "expression": "happy" } // switches to eyes layout, sets expression
         { "mode": "active", "html": "<h2>Hello World</h2>" } // hides eyes, shows HTML
        */

        if (payload.mode === 'idle') {
            activeContainer.classList.remove('active');
            activeContainer.classList.add('hidden');
            hangmanContainer.classList.remove('active');
            hangmanContainer.classList.add('hidden');
            
            idleContainer.classList.remove('hidden');
            idleContainer.classList.add('active');

            if (payload.expression) {
                pibEyes.setExpression(payload.expression);
            } else {
                pibEyes.setExpression('neutral');
            }
        } 
        else if (payload.mode === 'active') {
            idleContainer.classList.remove('active');
            idleContainer.classList.add('hidden');
            hangmanContainer.classList.remove('active');
            hangmanContainer.classList.add('hidden');

            activeContainer.classList.remove('hidden');
            activeContainer.classList.add('active');

            if (payload.html !== undefined) {
                snippetContainer.innerHTML = payload.html;
            }
        }
        else if (payload.mode === 'hangman') {
            idleContainer.classList.remove('active');
            idleContainer.classList.add('hidden');
            activeContainer.classList.remove('active');
            activeContainer.classList.add('hidden');

            hangmanContainer.classList.remove('hidden');
            hangmanContainer.classList.add('active');
        }
    };

    // 4. Fullscreen Toggle Logic
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });

    // Update icon based on fullscreen state
    document.addEventListener('fullscreenchange', () => {
        const icon = fullscreenBtn.querySelector('i');
        if (document.fullscreenElement) {
            icon.classList.remove('fa-expand');
            icon.classList.add('fa-compress');
        } else {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
        }
    });

    // For local testing (remove or comment out for production)
    window.testCommand = (payload) => {
        rosClient.onCommandReceived(payload);
    };

    // Hidden keyboard shortcuts: same payloads the mock-server CLI sends.
    // 1 = active HTML, 2 = idle eyes, 6 = hangman. No on-screen hint.
    const KEY_PAYLOADS = {
        '1': { mode: 'active', html: "<h1>Hello World!</h1><p style='color: white;'>ROS2 is communicating!</p>" },
        '2': { mode: 'idle', expression: 'neutral' },
        '6': { mode: 'hangman' },
    };
    document.addEventListener('keydown', (e) => {
        const payload = KEY_PAYLOADS[e.key];
        if (!payload) return;
        // Switching INTO hangman should always start a fresh game, otherwise
        // we'd land on whatever stale state the server is holding (won/lost
        // from the previous round, or a half-played word).
        if (e.key === '6') rosClient.publishHangmanReset();
        rosClient.onCommandReceived(payload);
    });
});
