class PibEyes {
    constructor() {
        this.leftEye = document.getElementById('left-eye');
        this.rightEye = document.getElementById('right-eye');

        this.isBlinking = false;
        this.currentExpression = 'neutral';

        // Idle blinks/colour-shifts are choreographed entirely by the CSS
        // keyframe animation (eyeIdleCycle / eyeIdleCycleRight) so the page
        // matches the source GIF without JS having to drive the timeline.
        this.init();
    }

    init() {
        // No-op: idle behaviour lives in CSS. blink() and setExpression()
        // remain available for external (ROS) triggers.
    }

    setExpression(expression) {
        const expressions = ['neutral', 'happy', 'sad', 'thinking'];
        expressions.forEach(exp => {
            this.leftEye.classList.remove(exp);
            this.rightEye.classList.remove(exp);
        });

        this.currentExpression = expression;

        if (expression !== 'neutral' && expressions.includes(expression)) {
            this.leftEye.classList.add(expression);
            this.rightEye.classList.add(expression);
        }
    }

    async triggerBlink(eyeElement, duration = 120) {
        eyeElement.classList.add('blink');
        return new Promise(resolve => {
            setTimeout(() => {
                eyeElement.classList.remove('blink');
                resolve();
            }, duration);
        });
    }

    async blink() {
        if (this.isBlinking) return;
        this.isBlinking = true;

        /* Randomize blink style to match the GIF's sequence:
           - The GIF frequently blinks the left eye only or exactly both.
        */
        const rand = Math.random();
        
        if (rand < 0.70) {
            // Both eyes blink simultaneously (Very common)
            this.triggerBlink(this.leftEye);
            this.triggerBlink(this.rightEye);
        } else if (rand < 0.85) {
            // Left eye blinks independently (Seen early in the GIF)
            this.triggerBlink(this.leftEye);
        } else {
            // Right eye blinks independently
            this.triggerBlink(this.rightEye);
        }

        // Occasional double rapid blink logic
        if (Math.random() > 0.8) {
            setTimeout(() => {
                this.triggerBlink(this.leftEye);
                this.triggerBlink(this.rightEye);
            }, 250);
        }

        setTimeout(() => {
            this.isBlinking = false;
        }, 400);
    }

}

// Attach globally
window.PibEyes = PibEyes;
