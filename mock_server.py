import asyncio
import websockets
import json
import http.server
import socketserver
import threading
import random


# Hangman dictionary: 6-8 letter words, uppercase. The assert below catches
# typos so a bad entry can't sneak in and break the layout/keyboard logic.
HANGMAN_WORDS = [
    # 6 letters
    "ROCKET", "PYTHON", "ROBOTS", "PLANET", "GADGET", "MEMORY",
    "BUTTON", "MONKEY", "SCHOOL", "SUMMER", "GUITAR", "ENGINE",
    "WIZARD", "DRAGON", "GALAXY", "CASTLE", "FOREST", "ISLAND",
    "PUZZLE", "ORANGE", "BANANA", "COFFEE", "JUNGLE", "FRIEND",
    "COOKIE", "BRIDGE", "BASKET", "GARDEN", "WINTER", "SILVER",
    # 7 letters
    "PROGRAM", "DISPLAY", "MACHINE", "CIRCUIT", "MONITOR", "SCIENCE",
    "HANGMAN", "ROBOTIC", "NETWORK", "FACTORY", "RAINBOW", "MYSTERY",
    "JOURNEY", "PIRATES", "BICYCLE", "AIRPORT", "DOLPHIN", "PENGUIN",
    "VOLCANO", "COMPASS", "TRAFFIC", "KITCHEN", "JACKPOT", "CRAYONS",
    # 8 letters
    "COMPUTER", "KEYBOARD", "SOFTWARE", "HARDWARE", "VARIABLE", "FUNCTION",
    "INTERNET", "LANGUAGE", "DATABASE", "ELEPHANT", "MOUNTAIN", "DINOSAUR",
    "TRIANGLE", "MAGAZINE", "SANDWICH", "BIRTHDAY", "SCISSORS", "UMBRELLA",
    "MUSHROOM", "TREASURE", "PASSWORD", "FOOTBALL",
]
assert all(6 <= len(w) <= 8 and w.isalpha() and w.isupper() for w in HANGMAN_WORDS), \
    "Hangman words must be 6-8 uppercase letters"

def start_http_server():
    class NoLogHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass # Disable logging to keep CLI clean

    try:
        with socketserver.TCPServer(("", 8000), NoLogHandler) as httpd:
            print(" HTTP Server running at http://localhost:8000/")
            httpd.serve_forever()
    except Exception as e:
        print(f"HTTP Server error: {e}")
connected_clients = set()

class HangmanGame:
    def __init__(self):
        self.reset()

    def reset(self):
        self.target_word = random.choice(HANGMAN_WORDS)
        self.guessed_letters = []
        self.wrong_guesses = 0
        self.status = "playing"

    def guess(self, letter):
        if self.status != "playing":
            return
        letter = letter.upper()
        if letter in self.guessed_letters:
            return
        self.guessed_letters.append(letter)
        if letter not in self.target_word:
            self.wrong_guesses += 1
            if self.wrong_guesses >= 6:
                self.status = "lost"
        else:
            if all(c in self.guessed_letters for c in self.target_word):
                self.status = "won"

    def get_state(self):
        word_display = " ".join([c if c in self.guessed_letters else "_" for c in self.target_word])
        return {
            "word": word_display,
            "wrong_guesses": self.wrong_guesses,
            "status": self.status,
            "guessed_letters": self.guessed_letters
        }

hangman_game = HangmanGame()

async def broadcast_hangman_state():
    if not connected_clients:
        return
    msg = {
        "op": "publish",
        "topic": "/pib/hangman/state",
        "msg": {
            "data": json.dumps(hangman_game.get_state())
        }
    }
    websockets.broadcast(connected_clients, json.dumps(msg))

async def handler(websocket):
    connected_clients.add(websocket)
    print(f"\n[+] Client connected from {websocket.remote_address}")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("op") == "publish" and data.get("topic") == "/pib/hangman/guess":
                    letter = data["msg"]["data"]
                    print(f"\n[Hangman] Received guess: {letter}")
                    hangman_game.guess(letter)
                    await broadcast_hangman_state()
                elif data.get("op") == "publish" and data.get("topic") == "/pib/hangman/reset":
                    # Browser asked to start a fresh game (e.g. user pressed '6').
                    print(f"\n[Hangman] Reset requested -> new word")
                    hangman_game.reset()
                    await broadcast_hangman_state()
            except Exception as e:
                pass

    finally:
        connected_clients.remove(websocket)
        print(f"\n[-] Client disconnected")

async def cli_loop():
    await asyncio.sleep(0.5)
    print("\n===========================================")
    print(" ROS2 Mock Bridge Running (ws://localhost:9090)")
    print("===========================================")
    print("Type a number to send a command to the browser:")
    print("  1: Show <h1>Hello World!</h1> (Active Mode)")
    print("  2: Back to Normal Eyes (Idle Mode)")
    print("  6: Start Hangman Game")
    print("  q: Quit Server")

    while True:
        try:
            cmd = await asyncio.to_thread(input, "\nCMD > ")
            cmd = cmd.strip()

            payload = None
            if cmd == '1':
                payload = {"mode": "active", "html": "<h1>Hello World!</h1><p style='color: white;'>ROS2 is communicating!</p>"}
            elif cmd == '2':
                payload = {"mode": "idle", "expression": "neutral"}
            elif cmd == '6':
                payload = {"mode": "hangman"}
                hangman_game.reset()
                await broadcast_hangman_state()
            elif cmd == 'q':
                break
            elif cmd:
                print("Unknown command. Type 1, 2, 6, or q.")
                
            if payload:
                ros_msg = {
                    "op": "publish",
                    "topic": "/pib/display_command",
                    "msg": {
                        "data": json.dumps(payload)
                    }
                }
                
                if connected_clients:
                    websockets.broadcast(connected_clients, json.dumps(ros_msg))
                    print(f"Sent => {payload}")
                else:
                    print("No clients connected. Make sure you open index.html in the browser!")
                    
        except Exception as e:
            print(f"Error in CLI: {e}")
            break

async def main():
    threading.Thread(target=start_http_server, daemon=True).start()
    async with websockets.serve(handler, "localhost", 9090):
        await cli_loop()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
