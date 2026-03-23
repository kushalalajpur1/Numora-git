"""
NUMORA Mission Relay Backend
FastAPI + WebSocket server simulating AUV swarm command chain
"""

import asyncio
import json
import math
import random
import time
import os
import httpx
import anthropic
from contextlib import asynccontextmanager
from enum import Enum
from typing import Optional
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

try:
    from dotenv import load_dotenv
    load_dotenv()  # Load environment variables from .env file
except ImportError:
    pass  # python-dotenv not installed, use system env vars

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(mothership_loop())
    asyncio.create_task(drone_telemetry_loop())
    yield

app = FastAPI(title="NUMORA Mission Relay", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── State Enums ────────────────────────────────────────────────────────────

class MothershipState(str, Enum):
    SUBMERGED   = "SUBMERGED"
    ASCENDING   = "ASCENDING"
    SURFACED    = "SURFACED"
    COMMS_LOCK  = "COMMS LOCK"
    HOLDING     = "HOLDING"
    RELAYING    = "RELAYING"
    DIVING      = "DIVING"

class DroneStatus(str, Enum):
    IDLE        = "IDLE"
    TASKED      = "TASKED"
    EN_ROUTE    = "EN ROUTE"
    SURVEILLING = "SURVEILLING"
    PATROLLING  = "PATROLLING"
    RECONNING   = "RECONNING"
    SCANNING    = "SCANNING"
    ON_STATION  = "ON STATION"
    RETURNING   = "RETURNING"

class KillChainStage(str, Enum):
    DETECT   = "DETECT"
    CLASSIFY = "CLASSIFY"
    DECIDE   = "DECIDE"
    TASK     = "TASK"
    CONFIRM  = "CONFIRM"
    COMPLETE = "COMPLETE"

# ─── Shared State ────────────────────────────────────────────────────────────

class NUMORAState:
    def __init__(self):
        self.mothership = {
            "state": MothershipState.SUBMERGED,
            "depth": 85.0,
            "battery": 94.2,
            "temp": 12.4,
            "heading": 247.0,
            "signal_strength": 0.0,
            "x": 0.0,
            "y": 0.0,
            "target_x": 0.0,
            "target_y": 0.0,
            "speed": 0.12,
        }
        self.drones = {
            f"HUNTER-{i:02d}": {
                "id": f"HUNTER-{i:02d}",
                "status": DroneStatus.IDLE,
                "battery": round(random.uniform(88, 99), 1),
                "depth": round(random.uniform(30, 60), 1),
                "x": 0.0,
                "y": 0.0,
                "target_x": 0.0,
                "target_y": 0.0,
                "kill_chain_stage": None,
            }
            for i in range(1, 6)
        }
        self.mission_log = []
        self.mission_queue: list[dict] = []        # operator-added missions awaiting relay
        self._queue_counter: int = 0               # auto-increment queue item IDs
        self.relay_pulse = False
        self.last_mission_time: Optional[float] = None
        self.ascent_override: bool = False
        self.scheduled_ascent_time: Optional[float] = None  # Unix timestamp
        self.ascent_interval: float = 60.0         # seconds between autonomous ascents
        self.idle_timer: float = 0.0               # seconds since last became SUBMERGED
        self.queued_relay_list: list[dict] = []    # snapshot held for underwater relay
        self.pending_drone_commands: dict = {}     # drone_id -> queued command
        # Surface hold / dive scheduling
        self.surface_hold_interval: float = 60.0  # seconds to hold at surface before auto-dive
        self.scheduled_dive_time: Optional[float] = None
        self.dive_override: bool = False
        self._surface_start_time: Optional[float] = None
        # Kill chain
        self.kill_chains: dict = {}                # contact_id -> chain dict
        self._kill_chain_counter: int = 0

state = NUMORAState()
connected_clients: list[WebSocket] = []

# ─── Broadcast ───────────────────────────────────────────────────────────────

async def broadcast(event_type: str, data: dict):
    msg = json.dumps({"type": event_type, "data": data, "ts": time.time()})
    dead = []
    for ws in connected_clients:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in connected_clients:
            connected_clients.remove(ws)

# ─── Mothership State Machine ────────────────────────────────────────────────

IDLE_DEPTH_TARGET  = 90.0
SURFACE_DEPTH      = 0.5
RELAY_DEPTH        = 40.0   # depth at which acoustic relay fires during descent

async def mothership_loop():
    """Continuous state machine — always doing something."""
    import traceback
    while True:
        try:
            ms = state.mothership

            # ── Navigate toward waypoint (runs in SUBMERGED and DIVING) ──
            dx   = ms["target_x"] - ms["x"]
            dy   = ms["target_y"] - ms["y"]
            dist = math.sqrt(dx * dx + dy * dy)
            if ms["state"] in (MothershipState.SUBMERGED, MothershipState.DIVING):
                if dist > 0.5:
                    speed = ms.get("speed", 0.12)
                    step  = min(speed, dist)
                    ms["x"] += (dx / dist) * step
                    ms["y"] += (dy / dist) * step
                    ms["heading"] = (math.degrees(math.atan2(dx, -dy))) % 360

            # ── SUBMERGED: drift, wait, occasionally cycle up spontaneously ──
            if ms["state"] == MothershipState.SUBMERGED:
                ms["depth"] += random.uniform(-0.3, 0.3)
                ms["depth"] = max(70.0, min(110.0, ms["depth"]))
                ms["battery"] = max(10.0, ms["battery"] - random.uniform(0.001, 0.003))
                ms["temp"] += random.uniform(-0.05, 0.05)
                ms["temp"] = max(8.0, min(18.0, ms["temp"]))
                ms["heading"] += random.uniform(-0.5, 0.5)
                ms["heading"] = ms["heading"] % 360

                state.idle_timer += 0.5

                # Immediate ascent override from operator
                if state.ascent_override:
                    state.ascent_override = False
                    ms["target_x"] = ms["x"]
                    ms["target_y"] = ms["y"]
                    ms["state"] = MothershipState.ASCENDING
                    await broadcast("mothership_update", ms)
                    await asyncio.sleep(0.5)
                    continue

                # Scheduled ascent — trigger when time is reached
                if state.scheduled_ascent_time and time.time() >= state.scheduled_ascent_time:
                    state.scheduled_ascent_time = None
                    await broadcast("ascent_status", {"scheduled_time": None})
                    ms["target_x"] = ms["x"]
                    ms["target_y"] = ms["y"]
                    ms["state"] = MothershipState.ASCENDING
                    await broadcast("mothership_update", ms)
                    await asyncio.sleep(0.5)
                    continue

                # Spontaneous comms window at operator-set interval
                if state.idle_timer >= state.ascent_interval:
                    state.idle_timer = 0
                    ms["target_x"] = ms["x"]
                    ms["target_y"] = ms["y"]
                    ms["state"] = MothershipState.ASCENDING
                    print(f"[MS] idle_timer triggered ascent", flush=True)

            # ── ASCENDING: animate depth decreasing ──
            elif ms["state"] == MothershipState.ASCENDING:
                ms["depth"] -= random.uniform(3.0, 6.0)
                if ms["depth"] <= SURFACE_DEPTH:
                    ms["depth"] = SURFACE_DEPTH
                    ms["state"] = MothershipState.SURFACED
                    ms["signal_strength"] = 0.0
                    print("[MS] → SURFACED", flush=True)

            # ── SURFACED: lock signal ──
            elif ms["state"] == MothershipState.SURFACED:
                ms["signal_strength"] = min(1.0, ms["signal_strength"] + 0.15)
                if ms["signal_strength"] >= 1.0:
                    ms["state"] = MothershipState.COMMS_LOCK
                    print("[MS] → COMMS LOCK", flush=True)

            # ── COMMS LOCK: satellite locked — uplink drone telemetry, receive mission ──
            elif ms["state"] == MothershipState.COMMS_LOCK:
                await asyncio.sleep(1.5)
                ms["signal_strength"] = 1.0

                await broadcast("drone_uplink", {
                    "drones": list(state.drones.values()),
                    "uplink_time": time.strftime("%H:%M:%S"),
                })

                if state.mission_queue:
                    state.queued_relay_list = list(state.mission_queue)
                    state.mission_queue = []
                    await broadcast("queue_update", {"queue": state.mission_queue})
                    for m in reversed(state.queued_relay_list):
                        if "nav_speed" in m:
                            ms["speed"] = max(0.02, min(0.5, float(m["nav_speed"])))
                            break
                    for mission in state.queued_relay_list:
                        log_entry = {
                            "id": len(state.mission_log) + 1,
                            "type": mission["mission_type"],
                            "target": mission["target_area"],
                            "priority": mission["priority"],
                            "drones": mission["drone_count"],
                            "ts": time.strftime("%H:%M:%S"),
                            "status": "RECEIVED — DIVING TO RELAY DEPTH",
                        }
                        state.mission_log = [log_entry] + state.mission_log[:9]
                    await broadcast("mission_log_update", {"log": state.mission_log})

                ms["state"] = MothershipState.HOLDING
                state._surface_start_time = time.time()
                state.dive_override = False
                print("[MS] → HOLDING", flush=True)

            # ── HOLDING: surface window open — wait for dive command or auto-timeout ──
            elif ms["state"] == MothershipState.HOLDING:
                ms["signal_strength"] = 1.0
                elapsed = time.time() - (state._surface_start_time or time.time())

                should_dive = (
                    state.dive_override
                    or (state.scheduled_dive_time and time.time() >= state.scheduled_dive_time)
                    or elapsed >= state.surface_hold_interval
                )
                if should_dive:
                    state.dive_override = False
                    state.scheduled_dive_time = None
                    state._surface_start_time = None
                    state.idle_timer = 0
                    await broadcast("dive_status", {"scheduled_dive_time": None})
                    ms["state"] = MothershipState.DIVING
                    print("[MS] → DIVING", flush=True)

            # ── DIVING: descend; fire acoustic relay once at relay depth ──
            elif ms["state"] == MothershipState.DIVING:
                ms["depth"] += random.uniform(4.0, 8.0)
                ms["signal_strength"] = max(0.0, ms["signal_strength"] - 0.2)

                has_relay = state.queued_relay_list or state.pending_drone_commands
                if has_relay and ms["depth"] >= RELAY_DEPTH:
                    ms["state"] = MothershipState.RELAYING
                    ms["signal_strength"] = 0.0
                    state.relay_pulse = True
                    print("[MS] → RELAYING", flush=True)

                    await broadcast("relay_pulse", {"active": True})
                    await broadcast("mothership_update", ms)

                    if state.queued_relay_list:
                        relay_batch = list(state.queued_relay_list)
                        state.queued_relay_list = []
                        for i, mission in enumerate(relay_batch):
                            if i < len(state.mission_log):
                                state.mission_log[i]["status"] = "RELAYING TO SWARM"
                        await broadcast("mission_log_update", {"log": state.mission_log})
                        for mission in relay_batch:
                            asyncio.create_task(dispatch_drones(mission))

                    for drone_id, cmd in list(state.pending_drone_commands.items()):
                        if drone_id in state.drones:
                            drone = state.drones[drone_id]
                            drone["target_x"] = cmd["target_x"]
                            drone["target_y"] = cmd["target_y"]
                            drone["status"] = DroneStatus.EN_ROUTE
                            asyncio.create_task(animate_drone(drone_id, cmd))
                    state.pending_drone_commands.clear()
                    await broadcast("pending_commands_update", {"pending": {}})

                    await asyncio.sleep(2.0)
                    state.relay_pulse = False
                    await broadcast("relay_pulse", {"active": False})
                    ms["state"] = MothershipState.DIVING

                elif ms["depth"] >= IDLE_DEPTH_TARGET:
                    ms["depth"] = IDLE_DEPTH_TARGET + random.uniform(0, 10)
                    ms["state"] = MothershipState.SUBMERGED
                    ms["signal_strength"] = 0.0
                    state.idle_timer = 0
                    print("[MS] → SUBMERGED", flush=True)

            # ── RELAYING: handled inline during DIVING transition above ──
            elif ms["state"] == MothershipState.RELAYING:
                pass

            surface_elapsed = (time.time() - state._surface_start_time) if state._surface_start_time else 0.0
            await broadcast("mothership_update", {
                **ms,
                "idle_timer": state.idle_timer,
                "surface_elapsed": surface_elapsed,
                "surface_hold_interval": state.surface_hold_interval,
            })
            await asyncio.sleep(0.5)

        except Exception:
            traceback.print_exc()
            print("[mothership_loop] exception — restarting loop in 1s", flush=True)
            await asyncio.sleep(1.0)


TASK_TYPE_MAP = {
    "SURVEILLANCE":     "SURVEILLANCE",
    "MINE DETECTION":   "MINE DETECTION",
    "PERIMETER PATROL": "PERIMETER PATROL",
    "TARGET TRACKING":  "RECON",
}

async def dispatch_drones(mission: dict):
    """Stagger drone tasking to simulate acoustic propagation delay."""
    count    = mission["drone_count"]
    keys     = list(state.drones.keys())[:count]
    angles   = [i * (360 / count) for i in range(count)]
    task     = TASK_TYPE_MAP.get(mission["mission_type"], "SURVEILLANCE")

    for i, key in enumerate(keys):
        await asyncio.sleep(random.uniform(0.5, 1.5) * (i + 1))
        drone = state.drones[key]
        angle_rad = math.radians(angles[i])
        drone["target_x"] = math.cos(angle_rad) * random.uniform(60, 120)
        drone["target_y"] = math.sin(angle_rad) * random.uniform(60, 120)
        drone["status"]   = DroneStatus.TASKED
        await asyncio.sleep(1.0)
        drone["status"]   = DroneStatus.EN_ROUTE
        asyncio.create_task(animate_drone(key, {
            "task_type":    task,
            "hold_duration": 30,
            "priority":     mission["priority"],
        }))

    for key in list(state.drones.keys())[count:]:
        state.drones[key]["status"] = DroneStatus.IDLE


# ── Task behaviour helpers ────────────────────────────────────────────────────

async def _travel(drone, sx, sy, tx, ty, speed):
    steps = max(10, int(1.0 / speed))
    for step in range(steps):
        t = (step + 1) / steps
        e = t * t * (3 - 2 * t)
        drone["x"]       = sx + (tx - sx) * e
        drone["y"]       = sy + (ty - sy) * e
        drone["depth"]   = 40.0 + random.uniform(-5, 5)
        drone["battery"] = max(10.0, drone["battery"] - 0.01)
        await asyncio.sleep(0.15)


async def _run_surveillance(drone, tx, ty, duration):
    """Slow orbit around target point."""
    drone["status"] = DroneStatus.SURVEILLING
    radius, angle   = 25.0, 0.0
    start = time.time()
    while time.time() - start < duration:
        angle           += 0.08
        drone["x"]       = tx + math.cos(angle) * radius
        drone["y"]       = ty + math.sin(angle) * radius
        drone["depth"]   = 35.0 + random.uniform(-3, 3)
        drone["battery"] = max(10.0, drone["battery"] - 0.004)
        await asyncio.sleep(0.15)


async def _run_patrol(drone, tx, ty, duration):
    """Sweep back and forth between start position and target."""
    drone["status"] = DroneStatus.PATROLLING
    sx, sy = drone["x"], drone["y"]
    steps  = 20
    start  = time.time()
    while time.time() - start < duration:
        for px, py in [(tx, ty), (sx, sy)]:
            ox, oy = drone["x"], drone["y"]
            for step in range(steps):
                t = (step + 1) / steps
                e = t * t * (3 - 2 * t)
                drone["x"]       = ox + (px - ox) * e
                drone["y"]       = oy + (py - oy) * e
                drone["battery"] = max(10.0, drone["battery"] - 0.006)
                await asyncio.sleep(0.18)


async def _run_recon(drone, tx, ty, duration):
    """Fast diamond sweep around target."""
    drone["status"] = DroneStatus.RECONNING
    r = 35.0
    waypoints = [(tx+r, ty), (tx, ty+r), (tx-r, ty), (tx, ty-r), (tx, ty)]
    start = time.time()
    while time.time() - start < duration:
        for wx, wy in waypoints:
            ox, oy = drone["x"], drone["y"]
            for step in range(8):
                t = (step + 1) / 8
                e = t * t * (3 - 2 * t)
                drone["x"]       = ox + (wx - ox) * e
                drone["y"]       = oy + (wy - oy) * e
                drone["depth"]   = 30.0 + random.uniform(-5, 5)
                drone["battery"] = max(10.0, drone["battery"] - 0.012)
                await asyncio.sleep(0.1)


async def _run_mine_detection(drone, tx, ty, duration):
    """Systematic lawnmower grid search."""
    drone["status"] = DroneStatus.SCANNING
    area, rows = 40.0, 4
    start = time.time()
    while time.time() - start < duration:
        for row in range(rows):
            y_pos   = ty - area + row * (area * 2 / max(rows - 1, 1))
            x_start = tx - area if row % 2 == 0 else tx + area
            x_end   = tx + area if row % 2 == 0 else tx - area
            ox, oy  = drone["x"], drone["y"]
            # Move to row start
            for step in range(12):
                t = (step + 1) / 12
                e = t * t * (3 - 2 * t)
                drone["x"]       = ox + (x_start - ox) * e
                drone["y"]       = oy + (y_pos   - oy) * e
                drone["battery"] = max(10.0, drone["battery"] - 0.003)
                await asyncio.sleep(0.2)
            # Sweep across row
            for step in range(20):
                t = (step + 1) / 20
                e = t * t * (3 - 2 * t)
                drone["x"]       = x_start + (x_end - x_start) * e
                drone["y"]       = y_pos
                drone["battery"] = max(10.0, drone["battery"] - 0.003)
                await asyncio.sleep(0.2)


async def animate_drone(drone_id: str, command: dict):
    """Animate drone with task-specific behaviour — internal state only."""
    drone         = state.drones[drone_id]
    task          = command.get("task_type", "SURVEILLANCE")
    hold_duration = float(command.get("hold_duration", 25))
    speed         = {"LOW": 0.05, "MEDIUM": 0.08, "HIGH": 0.12, "CRITICAL": 0.18}.get(
                        command.get("priority", "MEDIUM"), 0.08)

    sx, sy = drone["x"], drone["y"]
    tx, ty = drone["target_x"], drone["target_y"]

    await _travel(drone, sx, sy, tx, ty, speed)

    if   task == "SURVEILLANCE":     await _run_surveillance(drone, tx, ty, hold_duration)
    elif task == "PERIMETER PATROL": await _run_patrol(drone, tx, ty, hold_duration)
    elif task == "RECON":            await _run_recon(drone, tx, ty, hold_duration)
    elif task == "MINE DETECTION":   await _run_mine_detection(drone, tx, ty, hold_duration)
    else:
        drone["status"] = DroneStatus.ON_STATION
        await asyncio.sleep(hold_duration)

    drone["status"] = DroneStatus.RETURNING
    await _travel(drone, drone["x"], drone["y"], 0.0, 0.0, speed)

    drone["x"]      = 0.0
    drone["y"]      = 0.0
    drone["status"] = DroneStatus.IDLE


IDLE_STATUSES = {DroneStatus.IDLE, DroneStatus.ON_STATION}

async def drone_telemetry_loop():
    """Continuously drift drone telemetry internally — not broadcast to operator."""
    while True:
        for drone in state.drones.values():
            if drone["status"] in IDLE_STATUSES:
                drone["battery"] = max(10.0, drone["battery"] - random.uniform(0.001, 0.005))
                drone["depth"]  += random.uniform(-0.5, 0.5)
                drone["depth"]   = max(5.0, min(150.0, drone["depth"]))
        await asyncio.sleep(2.0)

# ─── Kill Chain Pipeline ─────────────────────────────────────────────────────

_STAGE_DELAYS = {
    KillChainStage.DETECT:   (1.0, 2.5),
    KillChainStage.CLASSIFY: (2.0, 4.0),
    KillChainStage.DECIDE:   (1.5, 3.5),
    KillChainStage.TASK:     (1.0, 2.0),
    KillChainStage.CONFIRM:  (2.0, 4.0),
    KillChainStage.COMPLETE: (0.0, 0.0),
}

async def run_kill_chain(contact_id: str, drone_id: str):
    """Advance a kill chain through all stages with realistic delays."""
    threat_level = random.choices(
        ["LOW", "HIGH", "HIGH", "CRITICAL"],
        weights=[20, 40, 25, 15],
    )[0]

    chain = {
        "contact_id":  contact_id,
        "drone_id":    drone_id,
        "stage":       KillChainStage.DETECT,
        "timestamps":  {},
        "threat_level": threat_level,
        "active":      True,
    }
    state.kill_chains[contact_id] = chain

    for stage in KillChainStage:
        chain["stage"] = stage
        chain["timestamps"][stage] = time.strftime("%H:%M:%S", time.localtime())

        if drone_id in state.drones:
            state.drones[drone_id]["kill_chain_stage"] = stage

        await broadcast("kill_chain_update", {
            "contact_id":   contact_id,
            "drone_id":     drone_id,
            "stage":        stage,
            "timestamps":   dict(chain["timestamps"]),
            "threat_level": threat_level,
            "active":       True,
        })

        lo, hi = _STAGE_DELAYS[stage]
        if hi > 0:
            await asyncio.sleep(random.uniform(lo, hi))

    chain["active"] = False
    if drone_id in state.drones:
        state.drones[drone_id]["kill_chain_stage"] = None

    await broadcast("kill_chain_update", {
        "contact_id":   contact_id,
        "drone_id":     drone_id,
        "stage":        KillChainStage.COMPLETE,
        "timestamps":   dict(chain["timestamps"]),
        "threat_level": threat_level,
        "active":       False,
    })

# ─── Chat API Endpoint (Claude) ──────────────────────────────────────────────

_CHAT_TOOLS = [
    {
        "name": "queue_drone_command",
        "description": (
            "Queue a task command for a specific drone. "
            "Only call this when you have a confirmed drone ID, task type, and target coordinates."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "drone_id": {
                    "type": "string",
                    "enum": ["HUNTER-01", "HUNTER-02", "HUNTER-03", "HUNTER-04", "HUNTER-05"],
                    "description": "The drone to command",
                },
                "task_type": {
                    "type": "string",
                    "enum": ["SURVEILLANCE", "PERIMETER PATROL", "RECON", "MINE DETECTION"],
                    "description": "The task to execute",
                },
                "target_x": {"type": "number", "description": "Target X coordinate"},
                "target_y": {"type": "number", "description": "Target Y coordinate"},
                "duration": {"type": "number", "description": "Task hold duration in seconds (default 120)"},
            },
            "required": ["drone_id", "task_type", "target_x", "target_y"],
        },
    },
    {
        "name": "set_mothership_waypoint",
        "description": (
            "Set a navigation waypoint for the mothership. "
            "Only call this when specific coordinates are confirmed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "number", "description": "Waypoint X coordinate"},
                "y": {"type": "number", "description": "Waypoint Y coordinate"},
            },
            "required": ["x", "y"],
        },
    },
]

@app.post("/api/chat")
async def chat_endpoint(body: dict):
    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key or api_key == "your-anthropic-api-key-here":
            return {"error": "ANTHROPIC_API_KEY not configured in backend/.env", "status": 500}

        system_state = body.get("system_state", {})
        messages     = body.get("messages", [])

        system_prompt = (
            "You are an AI tactical advisor for the NUMORA Autonomous Underwater Swarm System. "
            "You help operators manage underwater drones and a mothership. "
            "Be concise and use operational language.\n\n"
            f"Current system state:\n{json.dumps(system_state, indent=2)}\n\n"
            "When you have enough information to issue a specific command (drone ID, coordinates, "
            "task type) use the appropriate tool. Otherwise ask for clarification."
        )

        client   = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            system=system_prompt,
            tools=_CHAT_TOOLS,
            messages=messages,
        )

        text    = ""
        command = None
        for block in response.content:
            if block.type == "text":
                text = block.text
            elif block.type == "tool_use":
                command = {"type": block.name, **block.input}

        return {"text": text, "command": command}

    except anthropic.AuthenticationError:
        return {"error": "Invalid ANTHROPIC_API_KEY — check backend/.env", "status": 401}
    except Exception as e:
        return {"error": f"Backend error: {str(e)}", "status": 500}

# ─── WebSocket Endpoint ──────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.append(ws)

    # Send full initial state
    await ws.send_text(json.dumps({
        "type": "init",
        "data": {
            "mothership": state.mothership,
            "drones": list(state.drones.values()),
            "mission_log": state.mission_log,
            "mission_queue": state.mission_queue,
            "scheduled_ascent_time": state.scheduled_ascent_time,
            "ascent_interval": state.ascent_interval,
            "scheduled_dive_time": state.scheduled_dive_time,
            "surface_hold_interval": state.surface_hold_interval,
            "pending_commands": {k: v["task_type"] for k, v in state.pending_drone_commands.items()},
            "kill_chains": list(state.kill_chains.values()),
        },
        "ts": time.time(),
    }))

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "add_to_queue":
                state._queue_counter += 1
                entry = {**msg["data"], "qid": state._queue_counter}
                state.mission_queue.append(entry)
                await broadcast("queue_update", {"queue": state.mission_queue})
                await ws.send_text(json.dumps({
                    "type": "ack",
                    "data": {"message": f"MISSION #{state._queue_counter} ADDED TO QUEUE ({len(state.mission_queue)} PENDING)"},
                    "ts": time.time(),
                }))

            elif msg.get("type") == "remove_from_queue":
                qid = msg.get("data", {}).get("qid")
                before = len(state.mission_queue)
                state.mission_queue = [m for m in state.mission_queue if m.get("qid") != qid]
                removed = before - len(state.mission_queue)
                await broadcast("queue_update", {"queue": state.mission_queue})
                await ws.send_text(json.dumps({
                    "type": "ack",
                    "data": {"message": f"MISSION REMOVED — {len(state.mission_queue)} REMAINING" if removed else "MISSION NOT FOUND"},
                    "ts": time.time(),
                }))
            elif msg.get("type") == "command_ascent":
                data = msg.get("data", {})
                mode = data.get("mode", "immediate")

                if mode == "immediate":
                    _ms = state.mothership
                    if _ms["state"] == MothershipState.SUBMERGED:
                        _ms["target_x"] = _ms["x"]
                        _ms["target_y"] = _ms["y"]
                        _ms["state"] = MothershipState.ASCENDING
                    else:
                        state.ascent_override = True
                    state.scheduled_ascent_time = None
                    await broadcast("ascent_status", {"scheduled_time": None})
                    await ws.send_text(json.dumps({
                        "type": "ack",
                        "data": {"message": "ASCENT COMMAND ACKNOWLEDGED — ASCENDING NOW"},
                        "ts": time.time(),
                    }))

                elif mode == "scheduled":
                    time_str = data.get("time", "")
                    try:
                        h, m = map(int, time_str.split(":"))
                        if not (0 <= h <= 23 and 0 <= m <= 59):
                            raise ValueError
                        now = time.localtime()
                        target = time.mktime((now.tm_year, now.tm_mon, now.tm_mday, h, m, 0, 0, 0, -1))
                        if target <= time.time():
                            target += 86400  # Schedule for next day if already past
                        state.scheduled_ascent_time = target
                        await broadcast("ascent_status", {"scheduled_time": target})
                        await ws.send_text(json.dumps({
                            "type": "ack",
                            "data": {"message": f"ASCENT SCHEDULED FOR {time_str}"},
                            "ts": time.time(),
                        }))
                    except (ValueError, AttributeError):
                        await ws.send_text(json.dumps({
                            "type": "error",
                            "data": {"message": "INVALID TIME FORMAT — USE HH:MM"},
                            "ts": time.time(),
                        }))

                elif mode == "cancel":
                    state.scheduled_ascent_time = None
                    state.ascent_override = False
                    await broadcast("ascent_status", {"scheduled_time": None})
                    await ws.send_text(json.dumps({
                        "type": "ack",
                        "data": {"message": "ASCENT SCHEDULE CLEARED"},
                        "ts": time.time(),
                    }))

            elif msg.get("type") == "command_dive":
                data = msg.get("data", {})
                mode = data.get("mode", "immediate")
                ms  = state.mothership

                if mode == "immediate":
                    if ms["state"] in (MothershipState.HOLDING, MothershipState.SURFACED, MothershipState.COMMS_LOCK):
                        state.dive_override = True
                        await ws.send_text(json.dumps({
                            "type": "ack",
                            "data": {"message": "DIVE COMMAND RECEIVED — DIVING NOW"},
                            "ts": time.time(),
                        }))
                    else:
                        await ws.send_text(json.dumps({
                            "type": "error",
                            "data": {"message": "CANNOT DIVE — NOT AT SURFACE"},
                            "ts": time.time(),
                        }))

                elif mode == "scheduled":
                    time_str = data.get("time", "")
                    try:
                        h, m = map(int, time_str.split(":"))
                        if not (0 <= h <= 23 and 0 <= m <= 59):
                            raise ValueError
                        now = time.localtime()
                        target = time.mktime((now.tm_year, now.tm_mon, now.tm_mday, h, m, 0, 0, 0, -1))
                        if target <= time.time():
                            target += 86400
                        state.scheduled_dive_time = target
                        await broadcast("dive_status", {"scheduled_dive_time": target})
                        await ws.send_text(json.dumps({
                            "type": "ack",
                            "data": {"message": f"DIVE SCHEDULED FOR {time_str}"},
                            "ts": time.time(),
                        }))
                    except (ValueError, AttributeError):
                        await ws.send_text(json.dumps({
                            "type": "error",
                            "data": {"message": "INVALID TIME FORMAT — USE HH:MM"},
                            "ts": time.time(),
                        }))

                elif mode == "cancel":
                    state.scheduled_dive_time = None
                    state.dive_override = False
                    await broadcast("dive_status", {"scheduled_dive_time": None})
                    await ws.send_text(json.dumps({
                        "type": "ack",
                        "data": {"message": "DIVE SCHEDULE CLEARED"},
                        "ts": time.time(),
                    }))

            elif msg.get("type") == "set_surface_hold_interval":
                seconds = msg.get("data", {}).get("seconds", 60)
                state.surface_hold_interval = max(10.0, float(seconds))
                await ws.send_text(json.dumps({
                    "type": "ack",
                    "data": {"message": f"SURFACE HOLD SET TO {int(state.surface_hold_interval)}s"},
                    "ts": time.time(),
                }))

            elif msg.get("type") == "set_ascent_interval":
                seconds = msg.get("data", {}).get("seconds", 60)
                state.ascent_interval = max(10.0, float(seconds))
                await broadcast("ascent_status", {
                    "scheduled_time": state.scheduled_ascent_time,
                    "ascent_interval": state.ascent_interval,
                })
                await ws.send_text(json.dumps({
                    "type": "ack",
                    "data": {"message": f"ASCENT INTERVAL SET TO {int(state.ascent_interval)}s"},
                    "ts": time.time(),
                }))

            elif msg.get("type") == "queue_drone_command":
                data     = msg["data"]
                drone_id = data.get("id")
                if drone_id in state.drones:
                    state.pending_drone_commands[drone_id] = {
                        "task_type":    data.get("task_type", "SURVEILLANCE"),
                        "hold_duration": max(10.0, float(data.get("hold_duration", 30))),
                        "target_x":     float(data.get("target_x", 0)),
                        "target_y":     float(data.get("target_y", 0)),
                        "priority":     data.get("priority", "MEDIUM"),
                    }
                    await broadcast("pending_commands_update", {
                        "pending": {k: v["task_type"] for k, v in state.pending_drone_commands.items()}
                    })
                    await ws.send_text(json.dumps({
                        "type": "ack",
                        "data": {"message": f"{drone_id} COMMAND QUEUED — WILL RELAY ON NEXT SURFACE WINDOW"},
                        "ts": time.time(),
                    }))
                else:
                    await ws.send_text(json.dumps({
                        "type": "error",
                        "data": {"message": f"DRONE {drone_id} NOT FOUND"},
                        "ts": time.time(),
                    }))

            elif msg.get("type") == "set_mothership_waypoint":
                data = msg["data"]
                state.mothership["target_x"] = float(data.get("x", 0))
                state.mothership["target_y"] = float(data.get("y", 0))
                await ws.send_text(json.dumps({
                    "type": "ack",
                    "data": {"message": f"MS-01 WAYPOINT SET — NAVIGATING"},
                    "ts": time.time(),
                }))

            elif msg.get("type") == "trigger_kill_chain":
                data     = msg["data"]
                drone_id = data.get("drone_id")
                if drone_id not in state.drones:
                    await ws.send_text(json.dumps({
                        "type": "error",
                        "data": {"message": f"DRONE {drone_id} NOT FOUND"},
                        "ts": time.time(),
                    }))
                else:
                    state._kill_chain_counter += 1
                    contact_id = f"CONTACT-{state._kill_chain_counter:04d}"
                    asyncio.create_task(run_kill_chain(contact_id, drone_id))
                    await ws.send_text(json.dumps({
                        "type": "ack",
                        "data": {"message": f"KILL CHAIN INITIATED — {contact_id} VIA {drone_id}"},
                        "ts": time.time(),
                    }))

            elif msg.get("type") == "set_drone_target":
                data     = msg["data"]
                drone_id = data["id"]
                x, y     = data["x"], data["y"]
                if drone_id in state.drones:
                    drone             = state.drones[drone_id]
                    drone["target_x"] = x
                    drone["target_y"] = y
                    drone["status"]   = DroneStatus.TASKED
                    await broadcast("drone_update", drone)
                    asyncio.create_task(animate_drone(drone_id, {
                        "task_type":    data.get("task_type", "SURVEILLANCE"),
                        "hold_duration": float(data.get("hold_duration", 20)),
                        "priority":     data.get("priority", "MEDIUM"),
                    }))
                    await ws.send_text(json.dumps({
                        "type": "ack",
                        "data": {"message": f"DRONE {drone_id} TARGET SET TO ({x:.0f}, {y:.0f})"},
                        "ts": time.time(),
                    }))
                else:
                    await ws.send_text(json.dumps({
                        "type": "error",
                        "data": {"message": f"DRONE {drone_id} NOT FOUND"},
                        "ts": time.time(),
                    }))
    except WebSocketDisconnect:
        if ws in connected_clients:
            connected_clients.remove(ws)

# ─── Startup ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
