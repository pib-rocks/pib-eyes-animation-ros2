class PibHangman {
    constructor() {
        this.container = document.getElementById('hangman-container');
        this.wordDisplay = document.getElementById('hangman-word');
        this.keyboard = document.getElementById('hangman-keyboard');
        this.gallowsParts = document.querySelectorAll('.hangman-part');
        this.statusText = document.getElementById('hangman-status');
        
        this.alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
        this.initKeyboard();
    }

    initKeyboard() {
        if (!this.keyboard) return;
        this.keyboard.innerHTML = '';
        this.alphabet.forEach(letter => {
            const btn = document.createElement('button');
            btn.className = 'key-btn';
            btn.innerText = letter;
            btn.dataset.letter = letter;
            btn.addEventListener('click', () => {
                if (!btn.disabled) {
                    btn.disabled = true;
                    if (window.pibRosClientInstance) {
                        window.pibRosClientInstance.publishHangmanGuess(letter);
                    }
                }
            });
            this.keyboard.appendChild(btn);
        });
    }

    updateGameState(state) {
        if (!state) return;
        
        if (this.wordDisplay) {
            this.wordDisplay.innerText = state.word;
        }

        this.gallowsParts.forEach((part, index) => {
            if (index < state.wrong_guesses) {
                part.classList.add('visible');
            } else {
                part.classList.remove('visible');
            }
        });

        if (state.guessed_letters && this.keyboard) {
            const keys = this.keyboard.querySelectorAll('.key-btn');
            keys.forEach(key => {
                const letter = key.dataset.letter;
                if (state.guessed_letters.includes(letter)) {
                    key.disabled = true;
                    key.classList.add('guessed');
                } else {
                    key.disabled = false;
                    key.classList.remove('guessed');
                }
            });
        }

        if (this.statusText) {
            if (state.status === 'won') {
                this.statusText.innerText = "YOU WON!";
                this.statusText.className = "status-won";
                this.disableAllKeys();
            } else if (state.status === 'lost') {
                this.statusText.innerText = "GAME OVER!";
                this.statusText.className = "status-lost";
                this.disableAllKeys();
            } else {
                this.statusText.innerText = "";
                this.statusText.className = "";
            }
        }
    }

    disableAllKeys() {
        if (!this.keyboard) return;
        const keys = this.keyboard.querySelectorAll('.key-btn');
        keys.forEach(key => {
            key.disabled = true;
            key.classList.add('guessed');
        });
    }
}

// We will instantiate this in main.js
window.PibHangman = PibHangman;
