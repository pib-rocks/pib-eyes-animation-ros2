class PibRosClient {
    constructor(wsUrl = 'ws://localhost:9090') {
        this.wsUrl = wsUrl;
        this.ros = null;
        this.connected = false;
        this.statusIndicator = document.getElementById('connection-status');
        
        // Callback hooks for main application
        this.onCommandReceived = null;
        this.onHangmanStateReceived = null;

        // Publishers
        this.hangmanGuessPublisher = null;

        this.init();
    }

    init() {
        this.ros = new ROSLIB.Ros({
            url: this.wsUrl
        });

        this.ros.on('connection', () => {
            console.log('Connected to websocket server.');
            this.connected = true;
            this.updateStatusUI();
            this.subscribeToTopic();
        });

        this.ros.on('error', (error) => {
            console.log('Error connecting to websocket server: ', error);
            this.connected = false;
            this.updateStatusUI();
        });

        this.ros.on('close', () => {
            console.log('Connection to websocket server closed.');
            this.connected = false;
            this.updateStatusUI();
            
            // Attempt to reconnect every 5 seconds
            setTimeout(() => {
                if (!this.connected) {
                    console.log("Attempting to reconnect...");
                    this.init();
                }
            }, 5000);
        });
    }

    updateStatusUI() {
        if (this.statusIndicator) {
            if (this.connected) {
                this.statusIndicator.classList.remove('disconnected');
                this.statusIndicator.classList.add('connected');
                this.statusIndicator.title = "ROS2 Connected";
            } else {
                this.statusIndicator.classList.remove('connected');
                this.statusIndicator.classList.add('disconnected');
                this.statusIndicator.title = "ROS2 Disconnected";
            }
        }
    }

    subscribeToTopic() {
        const cmdTopic = new ROSLIB.Topic({
            ros: this.ros,
            name: '/pib/display_command',
            messageType: 'std_msgs/String'
        });

        cmdTopic.subscribe((message) => {
            console.log('Received command: ' + message.data);
            try {
                const payload = JSON.parse(message.data);
                if (this.onCommandReceived) {
                    this.onCommandReceived(payload);
                }
            } catch (e) {
                console.error("Failed to parse JSON from ROS command:", e);
            }
        });

        const hangmanStateTopic = new ROSLIB.Topic({
            ros: this.ros,
            name: '/pib/hangman/state',
            messageType: 'std_msgs/String'
        });

        hangmanStateTopic.subscribe((message) => {
            try {
                const state = JSON.parse(message.data);
                if (this.onHangmanStateReceived) {
                    this.onHangmanStateReceived(state);
                }
            } catch (e) {
                console.error("Failed to parse JSON from Hangman state:", e);
            }
        });

        this.hangmanGuessPublisher = new ROSLIB.Topic({
            ros: this.ros,
            name: '/pib/hangman/guess',
            messageType: 'std_msgs/String'
        });

        this.hangmanResetPublisher = new ROSLIB.Topic({
            ros: this.ros,
            name: '/pib/hangman/reset',
            messageType: 'std_msgs/String'
        });
    }

    publishHangmanGuess(letter) {
        if (!this.connected || !this.hangmanGuessPublisher) return;
        const msg = new ROSLIB.Message({
            data: letter
        });
        this.hangmanGuessPublisher.publish(msg);
    }

    publishHangmanReset() {
        if (!this.connected || !this.hangmanResetPublisher) return;
        this.hangmanResetPublisher.publish(new ROSLIB.Message({ data: '' }));
    }
}

// Global scope
window.PibRosClient = PibRosClient;
