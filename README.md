# NUMORA — Mission Relay Console

**Autonomous Underwater Swarm System | Live Demo Dashboard**

A full-stack simulation of the NUMORA AUV swarm command chain:

```
Operator → Mothership AUV → Acoustic Relay → Drone Swarm
```

---

## Quick Start (Two Terminals)

### Prerequisites
- Python 3.9+
- Node.js 18+

---

### Terminal 1 — Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Server starts at: `http://localhost:8000`
WebSocket at:     `ws://localhost:8000/ws`

---

### Terminal 2 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:3000**

---

## One-Command Start (Unix/macOS)

```bash
chmod +x start.sh && ./start.sh
```

---

## Architecture

```
/backend
  main.py          — FastAPI + WebSocket server
  requirements.txt — Python deps

/frontend
  src/
    App.jsx                      — Root component + WebSocket client
    components/OperatorConsole.jsx — Left panel: mission dispatch
    components/Mothership.jsx      — Centre panel: MS-01 state machine
    components/SwarmStatus.jsx     — Right panel: drone cards + map
  index.html
  vite.config.js
```

## Features

- **Mothership state machine** — Continuously cycles SUBMERGED → ASCENDING → SURFACED → COMMS LOCK → RELAYING → DIVING with live depth animation
- **Operator Console** — Dispatch missions with type, target, priority, drone count
- **Acoustic oscilloscope** — Live waveform that activates on relay
- **Tactical map** — Top-down canvas showing drone positions spreading from mothership
- **Staggered drone dispatch** — 0.5–1.5s per drone to simulate acoustic propagation delay
- **Live telemetry drift** — Battery, temp, depth, heading animate realistically
- **WebSocket reconnect** — Auto-reconnects if backend restarts

## Tech Stack

| Layer    | Tech                       |
|----------|----------------------------|
| Backend  | Python · FastAPI · asyncio · WebSockets |
| Frontend | React 18 · Vite · Canvas API |
| Styling  | Pure CSS · JetBrains Mono  |

---

*NUMORA Modular Underwater Drone Swarm System — Kushal Alajpur, UNSW Mechatronic Engineering*
