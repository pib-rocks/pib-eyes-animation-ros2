# Pib.rocks Eyes & Screen

A browser-based display for the [pib robot](https://pib.rocks) that renders animated eyes, arbitrary HTML snippets, and an interactive Hangman game. The frontend communicates with ROS2 over a websocket bridge (`roslibjs`), making it easy to drive the display from robot software or from the included Python mock server.

## Features

- **Animated eyes (idle mode)** — sprite-driven blinking and expression animation.
- **Active mode** — injects arbitrary HTML snippets sent over ROS into the page.
- **Hangman mode** — interactive 6–8 letter word game with on-screen keyboard and gallows.
- **ROS2 demonstrator mode** — toggleable side panel that visualises the ROS node graph, message flow, a second ("spectator") subscriber, configurable network simulation (latency / drop / QoS), and plain-language explanations. See [DOCUMENTATION.md](DOCUMENTATION.md) for a full walkthrough.
- **ROS2 bridge** — connects to `rosbridge_server` (or the included mock) at `ws://localhost:9090`.
- **Fullscreen toggle** and a connection-status indicator.

## Project Layout

```
pib-eyes-animation-ros2/
├── index.html           # Main page, layouts for idle / active / hangman modes + demo panel
├── style.css            # Styling and animations
├── mock_server.py       # Python mock ROS bridge + static file server
├── readme.md            # This file
├── DOCUMENTATION.md     # Architecture, ROS topics, demo mode walkthrough
├── js/
│   ├── main.js          # Bootstrap, mode switching, keyboard shortcuts
│   ├── eyes.js          # Eye animation logic
│   ├── hangman.js       # Hangman UI logic
│   ├── ros_client.js    # roslibjs wrapper, topic subscriptions, demo-mode hooks
│   ├── demo_panel.js    # ROS2 demonstrator: graph, log, spectator, network sim
│   ├── eventemitter2.min.js
│   └── roslib.min.js
└── files/
    ├── spritesheet.png      # Eye sprite frames
    ├── pib-eyes-animated.gif
    └── extract.py
```

## Getting Started

### Requirements

- Python 3.8+ (for the mock server)
- The `websockets` package: `pip install websockets`
- A modern browser (Chrome, Firefox, Edge)

### Run with the mock server

The mock server hosts the static files **and** acts as a stand-in ROS bridge so you can develop without a running ROS2 stack.

```bash
python mock_server.py
```

Then open <http://localhost:8000/> in a browser.

The CLI prompt accepts:

| Command | Effect |
| ------- | ------ |
| `1`     | Show `<h1>Hello World!</h1>` (active mode) |
| `2`     | Back to idle eyes |
| `6`     | Start a Hangman game |
| `q`     | Quit the server |

### Use with a real ROS2 setup

Point your browser at the page while `rosbridge_server` is running on `ws://localhost:9090`, or change the URL in [js/main.js](js/main.js#L7).

## ROS Topics

| Topic | Direction | Payload |
| ----- | --------- | ------- |
| `/pib/display_command` | server → browser | JSON string: `{ "mode": "idle" \| "active" \| "hangman", ... }` |
| `/pib/hangman/state`   | server → browser | JSON string with `word`, `wrong_guesses`, `status`, `guessed_letters` |
| `/pib/hangman/guess`   | browser → server | Single uppercase letter |
| `/pib/hangman/reset`   | browser → server | Triggers a fresh round |

### Display command payloads

```json
{ "mode": "idle", "expression": "neutral" }
{ "mode": "active", "html": "<h2>Hello!</h2>" }
{ "mode": "hangman" }
```

## Keyboard Shortcuts

The same commands as the mock CLI are available in the browser:

- `1` — active mode with sample HTML
- `2` — idle eyes
- `6` — start a fresh Hangman game
- `d` — toggle the ROS2 demonstrator panel

## Documentation

See [DOCUMENTATION.md](DOCUMENTATION.md) for:

- Architecture and module-by-module overview
- ROS topic reference with payload schemas
- Demo mode walkthrough (node graph, message log, spectator subscriber, network simulation, explain mode)
- Extension points (adding new topics, modes, or demo features)

## License

See [LICENSE](LICENSE) for licensing information.
