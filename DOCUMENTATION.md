# Pib Eyes & Screen — Project Documentation

This document covers architecture, ROS interface, the ROS2 demonstrator mode, and how to extend the project. For a quick-start guide, see [readme.md](readme.md).

---

## 1. Architecture

The project is a single-page browser app that talks to ROS2 over `rosbridge_websocket`. There is no build step — everything is plain HTML / CSS / vanilla JS, served as static files.

### High-level flow

```
┌───────────────────────────────────────────────────────────┐
│                         Browser                           │
│                                                           │
│  ┌────────┐  ┌─────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Eyes  │  │ Snippet │  │ Hangman  │  │ Demo Panel   │  │
│  │ (idle) │  │ (active)│  │  (game)  │  │ (visualiser) │  │
│  └───┬────┘  └────┬────┘  └────┬─────┘  └──────┬───────┘  │
│      │            │            │               │          │
│      └────────────┴────────────┴───────────────┘          │
│                          │                                │
│                ┌─────────▼──────────┐                     │
│                │   PibRosClient     │  ◄── main socket    │
│                │  (roslibjs)        │                     │
│                └─────────┬──────────┘                     │
│                          │                                │
│                ┌─────────▼──────────┐                     │
│                │  Spectator Ros     │  ◄── 2nd socket     │
│                │  (demo only)       │     (proves multi-  │
│                └─────────┬──────────┘      subscriber)    │
└──────────────────────────┼────────────────────────────────┘
                           │  ws://localhost:9090
              ┌────────────▼────────────┐
              │   rosbridge_server      │
              │  (or mock_server.py)    │
              └────────────┬────────────┘
                           │
                ┌──────────▼──────────┐
                │   ROS2 nodes /      │
                │   hangman_node      │
                └─────────────────────┘
```

### Module responsibilities

| File | Responsibility |
| ---- | -------------- |
| [index.html](index.html) | DOM scaffolding for every mode and the demo panel. |
| [style.css](style.css) | All styling, including the eye keyframes and demo-mode layout. |
| [js/main.js](js/main.js) | Bootstrap on `DOMContentLoaded`; instantiates `PibEyes`, `PibRosClient`, `PibHangman`, `PibDemoPanel`; routes keyboard shortcuts and ROS commands to the right component. |
| [js/eyes.js](js/eyes.js) | Eye expression and animation logic. |
| [js/hangman.js](js/hangman.js) | Hangman UI: keyboard, word display, gallows, status. |
| [js/ros_client.js](js/ros_client.js) | `roslibjs` wrapper. Owns all topic subscriptions/publishers and exposes the **event/gate hooks** used by the demo panel. |
| [js/demo_panel.js](js/demo_panel.js) | The ROS2 demonstrator: node graph, message log, spectator subscriber, network simulation, msgs/sec + bytes counter, explain mode. |
| [mock_server.py](mock_server.py) | Combined static file server (port 8000) and stand-in for `rosbridge_websocket` (port 9090). Includes a tiny CLI and a `HangmanGame` state machine. |

### Cache busting

Static-asset URLs in `index.html` carry a `?v=N` query string (e.g. `style.css?v=7`, `js/demo_panel.js?v=2`). Bump the number when shipping changes so browsers don't serve stale files.

---

## 2. ROS interface

All topics use `std_msgs/String`. Structured payloads are JSON-encoded into the `data` field.

### Topics

| Topic | Direction | Payload (`data`) |
| ----- | --------- | ---------------- |
| `/pib/display_command` | server → browser | JSON: `{ "mode": "idle" \| "active" \| "hangman", ... }` |
| `/pib/hangman/state`   | server → browser | JSON: `{ "word": "_ _ _", "wrong_guesses": 0, "status": "playing" \| "won" \| "lost", "guessed_letters": ["A", "E"] }` |
| `/pib/hangman/guess`   | browser → server | Single uppercase letter, e.g. `"A"` |
| `/pib/hangman/reset`   | browser → server | Empty string. Triggers a fresh round. |

### `display_command` payloads

```json
{ "mode": "idle", "expression": "neutral" }
{ "mode": "active", "html": "<h2>Hello!</h2>" }
{ "mode": "hangman" }
```

`expression` accepts `neutral`, `happy`, `sad`, `thinking`. `html` is injected directly into `#snippet-container` — keep input trusted.

### Mock server CLI

While `mock_server.py` is running, the operator console accepts:

| Command | Effect |
| ------- | ------ |
| `1`     | Publish `display_command` for active mode with a sample snippet. |
| `2`     | Publish `display_command` for idle eyes. |
| `6`     | Reset the hangman game and switch the display to hangman mode. |
| `q`     | Quit the server. |

The same shortcuts are available in the browser via the `1`, `2`, `6` keys.

---

## 3. Demonstrator mode

Press **`d`** in the browser to slide the demonstrator panel in from the right. This mode is intended for live presentations explaining how ROS2 messaging works.

### 3.1 Layout

When demo mode is active, `body.demo-mode` is set:

- The active mode container shrinks to **58%** width on the left.
- The demo panel (42% width) slides in on the right.
- The eye animation and hangman layout scale down so they still fit comfortably.

### 3.2 Node graph

A horizontal diagram of the participants:

```
[browser] → [rosbridge] → [hangman_node] · [spectator]
```

Each node pulses pink when a message lands on it. For outbound traffic the pulse propagates left-to-right; for inbound traffic right-to-left. The spectator node lights up independently when the spectator subscriber receives a `state` broadcast.

### 3.3 Message log

Every send and receive is logged in chronological order. Each entry shows:

- Direction arrow (`→` outbound, `←` inbound)
- Topic name
- Timestamp (`HH:MM:SS.mmm`)
- Pretty-printed JSON payload

Outbound entries have a pink left border, inbound a green one. The log is capped at 80 entries; older ones scroll off.

### 3.4 Pause / Step / Clear

- **Pause** — stops dispatching incoming messages to handlers. They still appear in the log (marked *pending* with a pink outline) but the game state freezes until you step or resume.
- **Step** — releases exactly one queued message. It still goes through the network simulation, so latency/drop apply.
- **Resume** — drains every queued message in order.
- **Clear** — wipes the log and resets the counters.

Outbound publishes are not gated — they go on the wire immediately. The pause queue holds inbound dispatch only.

### 3.5 Spectator subscriber

The demo panel opens a **second** `ROSLIB.Ros` connection to the same `ws://localhost:9090`. The mock server treats it as an independent client, and you'll see a second `[+] Client connected` line in the server log on page load.

The spectator subscribes only to `/pib/hangman/state`. Its purpose is to demonstrate the multi-subscriber broadcast pattern that REST/HTTP cannot match cheaply: one publisher, multiple receivers, single network event.

It **does not** apply the network simulation (see below) — it stays as ground truth so the audience can see the difference when the main subscriber lags or drops messages.

### 3.6 Network simulation

Three controls inject artificial network conditions on the **main subscriber's inbound dispatch path** only:

| Control | Range | Effect |
| ------- | ----- | ------ |
| **Latency** | 0 – 2000 ms | Delays calling the message handler by this many ms. |
| **Drop rate** | 0 – 80% | Probability that any inbound message is dropped before dispatch. |
| **QoS** | Reliable / Best Effort | Determines what happens after a drop. |

QoS modes:

- **Reliable** — a dropped message is retried up to 5 times with random 250–600 ms delays. Each retry re-rolls the drop dice. The log entry is tagged `DROP — RETRY` until the message either gets through (re-tagged `REDELIVERED` in green) or all retries fail (re-tagged `GAVE UP`).
- **Best Effort** — a dropped message is gone. The log entry is tagged `LOST`.

The teaching demo: crank drop rate to ~50%, leave QoS on Reliable, and the main game stutters but recovers. Switch to Best Effort and the main game falls behind the spectator — visual proof of QoS reliability.

### 3.7 Counter

The status line shows three values that update live:

- **N msgs** — total messages sent or received since the demo started (or the log was cleared).
- **N/s** — rolling 1-second message rate, refreshed 4× per second so it decays cleanly to 0 when traffic stops.
- **N B / KB / MB** — total UTF-8 byte length of all payloads observed.

Spectator-side messages are not counted in the panel counter — that's the main subscriber's view, deliberately.

### 3.8 Explain mode

The **Explain** button toggles `body.explain-mode`. Each log entry has a hidden `.log-explain` block with a plain-language description keyed by `topic|direction`; the body class simply unhides them. Toggle on during a demo to walk the audience through what each message means.

Edit the `PIB_DEMO_EXPLANATIONS` map at the top of [js/demo_panel.js](js/demo_panel.js) to reword or add explanations for new topics.

---

## 4. ROS client internals

Most extensions touch [js/ros_client.js](js/ros_client.js). Key APIs:

### Constructor

```js
new PibRosClient(wsUrl = 'ws://localhost:9090')
```

Opens the websocket, registers reconnect logic (5-second back-off), and sets up subscriptions on `connection`.

### Application callbacks

```js
rosClient.onCommandReceived  = (payload) => { ... }   // /pib/display_command
rosClient.onHangmanStateReceived = (state) => { ... } // /pib/hangman/state
```

These are the entry points the rest of the app consumes — set them once.

### Demo-mode hooks

```js
rosClient.addEventListener(fn)
rosClient.dispatchGate = (event, runDispatch) => { ... }
```

- `addEventListener(fn)` — `fn(event)` is called for **every** publish and every received message. Event shape:

  ```js
  {
    id: 7,                         // monotonic counter
    direction: 'in' | 'out',
    topic:   '/pib/hangman/state',
    payload: '<raw data string>',
    timestamp: 1714329810000,      // ms epoch
    phase:   'received' | 'sent' | 'processed',
  }
  ```

  `received` fires the moment a message arrives on the wire. `processed` fires after the gate releases it (when the application handler is actually invoked). `sent` fires for outbound publishes.

- `dispatchGate(event, runDispatch)` — when set, takes ownership of dispatching incoming messages. Call `runDispatch()` to actually invoke the application handler. The demo panel uses this for pause/step and network simulation. Set to `null` (or leave unset) for default pass-through behaviour.

---

## 5. Extending the project

### Add a new topic

1. In `subscribeToTopic()` ([js/ros_client.js](js/ros_client.js)), add a new `ROSLIB.Topic` and call `this.handleIncoming(topicName, message.data, () => { /* dispatch logic */ })` from its subscribe callback. This routes through the demo panel's gate and event listeners automatically.
2. For publishing, add a method like `publishX()` that publishes via `ROSLIB.Topic.publish(...)` and follows it with `this.emit({ direction:'out', topic, payload, timestamp: Date.now(), phase:'sent', id: ++PibRosClient._nextId })`.
3. (Optional) Add an entry to `PIB_DEMO_EXPLANATIONS` in [js/demo_panel.js](js/demo_panel.js) so explain mode picks it up.

### Add a new display mode

1. Add the container DOM in [index.html](index.html) following the existing pattern (`<div class="container hidden">`).
2. Style it in [style.css](style.css).
3. Handle `payload.mode === 'your-mode'` in the `onCommandReceived` switch in [js/main.js](js/main.js), toggling the right containers' `active` / `hidden` classes.
4. Add a CLI command and key binding in [mock_server.py](mock_server.py) and [js/main.js](js/main.js) if you want it triggerable interactively.

### Add a new graph node

The graph is data-driven via `data-node="..."` attributes. To add a node:

1. Add a `<div class="demo-node" data-node="your_node">…</div>` inside `.demo-graph` in [index.html](index.html) (with optional `<div class="demo-arrow">` between nodes).
2. Update the `pulseNodesFor(evt)` sequence in [js/demo_panel.js](js/demo_panel.js) so messages animate through your new node.

### Adjust simulation behaviour

The retry budget (5 attempts) and retry delay window (250–600 ms) are inline constants in `applyNetworkSim()` ([js/demo_panel.js](js/demo_panel.js)). Change them to taste.

The simulation only affects **inbound** dispatch; if you want to drop or delay outbound publishes too, wrap the publish calls in [js/ros_client.js](js/ros_client.js) similarly.

---

## 6. Running with a real ROS2 stack

The frontend is unchanged — point it at a running `rosbridge_websocket` node:

```bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

Then ensure your nodes publish on `/pib/hangman/state` and `/pib/display_command`, and subscribe to `/pib/hangman/guess` and `/pib/hangman/reset`. All four use `std_msgs/String` — keep the JSON conventions documented in §2 above and the browser will work as-is.

If you change the rosbridge URL, edit the constant in [js/main.js](js/main.js) (the `PibRosClient` constructor argument).
