// Plain-language descriptions surfaced in "Explain" mode. Keyed by
// `topic|direction` so the same topic can be explained differently from the
// browser's vs the server's point of view.
const PIB_DEMO_EXPLANATIONS = {
    '/pib/hangman/guess|out':
        'Browser publishes a single-letter String message to /pib/hangman/guess. ' +
        'No direct connection to the server is needed — anything subscribed to that topic receives it.',
    '/pib/hangman/state|in':
        'Server publishes the new game state to /pib/hangman/state. Every subscriber ' +
        '(main game + spectator) receives the same broadcast in parallel.',
    '/pib/hangman/reset|out':
        'Browser publishes a reset signal. Topics fully decouple sender and receivers — ' +
        'the server processes this without knowing which client sent it.',
    '/pib/display_command|in':
        'Server tells the browser which mode to display. The same topic could drive ' +
        'multiple displays, loggers, or animations at once.',
};

class PibDemoPanel {
    constructor(rosClient) {
        this.rosClient = rosClient;
        this.panel = document.getElementById('demo-panel');
        this.log = document.getElementById('demo-log');
        this.pauseBtn = document.getElementById('demo-pause');
        this.stepBtn = document.getElementById('demo-step');
        this.clearBtn = document.getElementById('demo-clear');
        this.explainBtn = document.getElementById('demo-explain');
        this.counterMsgs = document.getElementById('demo-counter-msgs');
        this.counterRate = document.getElementById('demo-counter-rate');
        this.counterBytes = document.getElementById('demo-counter-bytes');

        this.paused = false;
        // Each entry: { event, runDispatch, logEl }
        this.queue = [];
        this.totalMessages = 0;
        this.totalBytes = 0;
        this.msgTimestamps = [];
        this.maxLogEntries = 80;

        // Network simulation (applied to MAIN inbound dispatch only — the
        // spectator deliberately gets perfect QoS so the audience can see
        // the difference side-by-side).
        this.simLatencyMs = 0;
        this.simDropRate = 0;
        this.simReliable = true;

        // The dispatchGate is always installed; it decides per-message whether
        // to pause, drop, delay, or pass through.
        this.rosClient.dispatchGate = (event, runDispatch) => this.gate(event, runDispatch);
        this.rosClient.addEventListener((evt) => this.onEvent(evt));
        console.log('[PibDemoPanel] initialised, listening for ROS events');

        this.wireControls();
        this.initSpectator();

        // Refresh the rolling msgs/sec rate even when no messages are flowing,
        // so the number drops to 0 when traffic stops.
        setInterval(() => this.updateRate(), 250);
    }

    toggle() {
        document.body.classList.toggle('demo-mode');
    }

    isVisible() {
        return document.body.classList.contains('demo-mode');
    }

    // ---------- Controls ----------

    wireControls() {
        this.pauseBtn.addEventListener('click', () => this.togglePause());
        this.stepBtn.addEventListener('click', () => this.step());
        this.clearBtn.addEventListener('click', () => this.clearLog());
        this.explainBtn.addEventListener('click', () => this.toggleExplain());

        const latency = document.getElementById('sim-latency');
        const latencyVal = document.getElementById('sim-latency-val');
        latency.addEventListener('input', () => {
            this.simLatencyMs = Number(latency.value);
            latencyVal.textContent = `${this.simLatencyMs} ms`;
        });

        const drop = document.getElementById('sim-drop');
        const dropVal = document.getElementById('sim-drop-val');
        drop.addEventListener('input', () => {
            this.simDropRate = Number(drop.value) / 100;
            dropVal.textContent = `${drop.value}%`;
        });

        const reliable = document.getElementById('sim-qos-reliable');
        const besteffort = document.getElementById('sim-qos-besteffort');
        reliable.addEventListener('click', () => {
            this.simReliable = true;
            reliable.classList.add('active');
            besteffort.classList.remove('active');
        });
        besteffort.addEventListener('click', () => {
            this.simReliable = false;
            besteffort.classList.add('active');
            reliable.classList.remove('active');
        });
    }

    // ---------- Dispatch gate (pause + network sim) ----------

    gate(event, runDispatch) {
        if (this.paused) {
            this.queueWhilePaused(event, runDispatch);
            return;
        }
        this.applyNetworkSim(event, runDispatch, 5);
    }

    queueWhilePaused(event, runDispatch) {
        const entry = this.queue.find(q => q.event.id === event.id);
        if (entry) {
            entry.runDispatch = runDispatch;
        } else {
            this.queue.push({ event, runDispatch, logEl: null });
        }
        this.stepBtn.disabled = false;
    }

    applyNetworkSim(event, runDispatch, attemptsRemaining) {
        if (this.simDropRate > 0 && Math.random() < this.simDropRate) {
            this.tagLogEntry(event.id, 'dropped');
            this.appendDropTag(event.id, this.simReliable ? 'DROP — RETRY' : 'DROP');
            if (this.simReliable && attemptsRemaining > 0) {
                const retryDelay = 250 + Math.random() * 350;
                setTimeout(
                    () => this.applyNetworkSim(event, runDispatch, attemptsRemaining - 1),
                    retryDelay,
                );
            } else {
                // Best-effort, or reliable retries exhausted: message is lost.
                this.appendDropTag(event.id, this.simReliable ? 'GAVE UP' : 'LOST');
            }
            return;
        }

        // Made it through. If we'd previously tagged it as dropped, mark redelivery.
        const el = this.findLogEl(event.id);
        if (el && el.classList.contains('dropped')) {
            el.classList.remove('dropped');
            this.appendDropTag(event.id, 'REDELIVERED', '#5eff8a');
        }

        if (this.simLatencyMs > 0) {
            setTimeout(runDispatch, this.simLatencyMs);
        } else {
            runDispatch();
        }
    }

    // ---------- Pause / step ----------

    togglePause() {
        this.paused = !this.paused;
        if (this.paused) {
            this.pauseBtn.textContent = 'Resume';
            this.pauseBtn.classList.add('active');
            this.stepBtn.disabled = this.queue.length === 0;
        } else {
            this.pauseBtn.textContent = 'Pause';
            this.pauseBtn.classList.remove('active');
            this.stepBtn.disabled = true;
            this.drainAll();
        }
    }

    step() {
        const entry = this.queue.shift();
        if (!entry) return;
        if (entry.logEl) entry.logEl.classList.remove('pending');
        // Run through the network sim path so latency/drop still apply on step.
        if (entry.runDispatch) this.applyNetworkSim(entry.event, entry.runDispatch, 5);
        this.stepBtn.disabled = this.queue.length === 0;
    }

    drainAll() {
        while (this.queue.length) {
            const entry = this.queue.shift();
            if (entry.logEl) entry.logEl.classList.remove('pending');
            if (entry.runDispatch) this.applyNetworkSim(entry.event, entry.runDispatch, 5);
        }
    }

    // ---------- Log rendering ----------

    clearLog() {
        this.log.innerHTML = '';
        this.totalMessages = 0;
        this.totalBytes = 0;
        this.msgTimestamps = [];
        this.updateCounter();
    }

    onEvent(evt) {
        if (evt.phase !== 'received' && evt.phase !== 'sent') return;

        const logEl = this.appendLogEntry(evt);
        this.pulseNodesFor(evt);

        const bytes = this.byteLengthOf(evt.payload);
        this.totalMessages++;
        this.totalBytes += bytes;
        this.msgTimestamps.push(performance.now());
        this.updateCounter();

        if (this.paused && evt.direction === 'in') {
            logEl.classList.add('pending');
            this.queue.push({ event: evt, runDispatch: null, logEl });
            this.stepBtn.disabled = false;
        }
    }

    appendLogEntry(evt) {
        const div = document.createElement('div');
        div.className = `log-entry ${evt.direction === 'in' ? 'log-in' : 'log-out'}`;
        div.dataset.eventId = String(evt.id);

        const arrow = evt.direction === 'in' ? '←' : '→';
        const ts = new Date(evt.timestamp);
        const time =
            `${String(ts.getHours()).padStart(2, '0')}:` +
            `${String(ts.getMinutes()).padStart(2, '0')}:` +
            `${String(ts.getSeconds()).padStart(2, '0')}.` +
            `${String(ts.getMilliseconds()).padStart(3, '0')}`;

        const head = document.createElement('div');
        head.className = 'log-head';
        head.innerHTML =
            '<span class="log-arrow"></span>' +
            '<span class="log-topic"></span>' +
            '<span class="log-time"></span>';
        head.querySelector('.log-arrow').textContent = arrow;
        head.querySelector('.log-topic').textContent = evt.topic;
        head.querySelector('.log-time').textContent = time;

        const body = document.createElement('pre');
        body.className = 'log-payload';
        body.textContent = this.formatPayload(evt.payload);

        div.appendChild(head);
        div.appendChild(body);

        const explainText = PIB_DEMO_EXPLANATIONS[`${evt.topic}|${evt.direction}`];
        if (explainText) {
            const ex = document.createElement('div');
            ex.className = 'log-explain';
            ex.textContent = explainText;
            div.appendChild(ex);
        }

        this.log.appendChild(div);
        this.log.scrollTop = this.log.scrollHeight;

        while (this.log.children.length > this.maxLogEntries) {
            this.log.removeChild(this.log.firstChild);
        }
        return div;
    }

    findLogEl(eventId) {
        return this.log.querySelector(`.log-entry[data-event-id="${eventId}"]`);
    }

    tagLogEntry(eventId, className) {
        const el = this.findLogEl(eventId);
        if (el) el.classList.add(className);
    }

    appendDropTag(eventId, text, color) {
        const el = this.findLogEl(eventId);
        if (!el) return;
        let tag = el.querySelector('.log-drop-tag');
        if (!tag) {
            tag = document.createElement('span');
            tag.className = 'log-drop-tag';
            el.querySelector('.log-head').appendChild(tag);
        }
        tag.textContent = text;
        if (color) tag.style.color = color;
    }

    formatPayload(payload) {
        if (payload === '' || payload == null) return '(empty)';
        try {
            return JSON.stringify(JSON.parse(payload), null, 2);
        } catch {
            return String(payload);
        }
    }

    pulseNodesFor(evt) {
        const sequence = evt.direction === 'out'
            ? ['browser', 'rosbridge', 'hangman_node']
            : ['hangman_node', 'rosbridge', 'browser'];
        sequence.forEach((nodeName, i) => {
            setTimeout(() => {
                const el = document.querySelector(`.demo-node[data-node="${nodeName}"]`);
                if (!el) return;
                el.classList.add('pulse');
                setTimeout(() => el.classList.remove('pulse'), 380);
            }, i * 140);
        });
    }

    // ---------- Counter ----------

    byteLengthOf(payload) {
        if (payload == null) return 0;
        const s = String(payload);
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(s).length;
        }
        return s.length;
    }

    formatBytes(b) {
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / (1024 * 1024)).toFixed(2)} MB`;
    }

    updateCounter() {
        if (this.counterMsgs) {
            this.counterMsgs.textContent = `${this.totalMessages} msg${this.totalMessages === 1 ? '' : 's'}`;
        }
        if (this.counterBytes) {
            this.counterBytes.textContent = this.formatBytes(this.totalBytes);
        }
    }

    updateRate() {
        const cutoff = performance.now() - 1000;
        while (this.msgTimestamps.length > 0 && this.msgTimestamps[0] < cutoff) {
            this.msgTimestamps.shift();
        }
        if (this.counterRate) {
            this.counterRate.textContent = `${this.msgTimestamps.length}/s`;
        }
    }

    // ---------- Explain mode ----------

    toggleExplain() {
        const on = document.body.classList.toggle('explain-mode');
        this.explainBtn.classList.toggle('active', on);
    }

    // ---------- Spectator (independent ROS client) ----------

    initSpectator() {
        if (typeof ROSLIB === 'undefined') return;

        this.spectatorRos = new ROSLIB.Ros({ url: this.rosClient.wsUrl });
        const dot = document.getElementById('spectator-dot');

        this.spectatorRos.on('connection', () => {
            console.log('[PibDemoPanel] spectator connected');
            if (dot) dot.classList.add('connected');

            const topic = new ROSLIB.Topic({
                ros: this.spectatorRos,
                name: '/pib/hangman/state',
                messageType: 'std_msgs/String',
            });
            topic.subscribe((msg) => {
                try {
                    const state = JSON.parse(msg.data);
                    this.renderSpectator(state);
                } catch (e) {
                    console.error('[spectator] parse error', e);
                }
            });
        });

        this.spectatorRos.on('close', () => {
            if (dot) dot.classList.remove('connected');
            // Auto-reconnect alongside the main client.
            setTimeout(() => this.initSpectator(), 5000);
        });

        this.spectatorRos.on('error', () => {
            if (dot) dot.classList.remove('connected');
        });
    }

    renderSpectator(state) {
        const wordEl = document.getElementById('spectator-word');
        const wrongEl = document.getElementById('spectator-wrong');
        const statusEl = document.getElementById('spectator-status-text');
        const guessedEl = document.getElementById('spectator-guessed');
        const card = document.getElementById('spectator-card');

        if (wordEl) wordEl.textContent = state.word || '';
        if (wrongEl) wrongEl.textContent = String(state.wrong_guesses ?? 0);
        if (guessedEl) guessedEl.textContent = (state.guessed_letters || []).join(' ');
        if (statusEl) {
            statusEl.textContent = state.status || '';
            statusEl.className = 'spectator-status-text ' + (state.status || '');
        }

        // Pulse the spectator card and graph node so the audience can see
        // it received the same broadcast as the main client.
        if (card) {
            card.classList.add('pulse');
            setTimeout(() => card.classList.remove('pulse'), 350);
        }
        const node = document.querySelector('.demo-node[data-node="spectator"]');
        if (node) {
            node.classList.add('pulse');
            setTimeout(() => node.classList.remove('pulse'), 380);
        }
    }
}

window.PibDemoPanel = PibDemoPanel;
