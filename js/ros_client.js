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

        // Demo-mode hooks: listeners receive every send/receive event;
        // dispatchGate (when set) wraps the actual handler invocation so the
        // demo panel can pause/step incoming dispatches.
        this.eventListeners = [];
        this.dispatchGate = null;

        this.init();
    }

    addEventListener(fn) {
        this.eventListeners.push(fn);
    }

    emit(event) {
        for (const fn of this.eventListeners) {
            try { fn(event); } catch (e) { console.error(e); }
        }
    }

    handleIncoming(topic, rawData, dispatchFn) {
        const event = {
            id: ++PibRosClient._nextId,
            direction: 'in',
            topic,
            payload: rawData,
            timestamp: Date.now(),
            phase: 'received',
        };
        this.emit(event);

        const runDispatch = () => {
            this.emit({ ...event, phase: 'processed' });
            try { dispatchFn(); } catch (e) { console.error(e); }
        };

        if (this.dispatchGate) {
            this.dispatchGate(event, runDispatch);
        } else {
            runDispatch();
        }
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
            this.handleIncoming('/pib/display_command', message.data, () => {
                const payload = JSON.parse(message.data);
                if (this.onCommandReceived) this.onCommandReceived(payload);
            });
        });

        const hangmanStateTopic = new ROSLIB.Topic({
            ros: this.ros,
            name: '/pib/hangman/state',
            messageType: 'std_msgs/String'
        });

        hangmanStateTopic.subscribe((message) => {
            this.handleIncoming('/pib/hangman/state', message.data, () => {
                const state = JSON.parse(message.data);
                if (this.onHangmanStateReceived) this.onHangmanStateReceived(state);
            });
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
        this.hangmanGuessPublisher.publish(new ROSLIB.Message({ data: letter }));
        this.emit({
            id: ++PibRosClient._nextId,
            direction: 'out',
            topic: '/pib/hangman/guess',
            payload: letter,
            timestamp: Date.now(),
            phase: 'sent',
        });
    }

    publishHangmanReset() {
        if (!this.connected || !this.hangmanResetPublisher) return;
        this.hangmanResetPublisher.publish(new ROSLIB.Message({ data: '' }));
        this.emit({
            id: ++PibRosClient._nextId,
            direction: 'out',
            topic: '/pib/hangman/reset',
            payload: '',
            timestamp: Date.now(),
            phase: 'sent',
        });
    }
}

PibRosClient._nextId = 0;

// Global scope
window.PibRosClient = PibRosClient;
