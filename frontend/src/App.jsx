import React, { useEffect, useRef, useState, useCallback } from 'react'
import OperatorConsole  from './components/OperatorConsole.jsx'
import Mothership       from './components/Mothership.jsx'
import SwarmStatus      from './components/SwarmStatus.jsx'
import KillChainPanel   from './components/KillChainPanel.jsx'
import './App.css'

const WS_URL = 'ws://localhost:8000/ws'

const INITIAL_DRONES = Array.from({ length: 5 }, (_, i) => ({
  id:      `HUNTER-${String(i + 1).padStart(2, '0')}`,
  status:  'IDLE',
  battery: 95,
  depth:   45,
  x: 0, y: 0,
}))

const INITIAL_MOTHERSHIP = {
  state:           'SUBMERGED',
  depth:           85,
  battery:         94,
  temp:            12.4,
  heading:         247,
  signal_strength: 0,
}

export default function App() {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const panelsRef = useRef(null)
  const resizingRef = useRef(null)

  const [connected, setConnected]               = useState(false)
  const [mothership, setMothership]             = useState(INITIAL_MOTHERSHIP)
  const [drones, setDrones]                     = useState(INITIAL_DRONES)
  const [missionLog, setMissionLog]             = useState([])
  const [relayPulse, setRelayPulse]             = useState(false)
  const [lastTxTime, setLastTxTime]             = useState(null)
  const [txStatus, setTxStatus]                 = useState('')
  const [scheduledAscentTime, setScheduledAscentTime] = useState(null) // Unix timestamp
  const [ascentInterval, setAscentInterval]           = useState(60)   // seconds
  const [uplinkTime, setUplinkTime]                   = useState(null) // HH:MM:SS of last drone uplink
  const [pendingCommands, setPendingCommands]         = useState({})   // drone_id -> task_type
  const [missionQueue, setMissionQueue]               = useState([])   // operator mission queue
  const [scheduledDiveTime, setScheduledDiveTime]     = useState(null)
  const [surfaceHoldInterval, setSurfaceHoldInterval] = useState(60)
  const [colWidths, setColWidths]                     = useState({ left: 280, right: 340 })
  const [killChains, setKillChains]                   = useState([])
  const [activeRightTab, setActiveRightTab]           = useState('SWARM')

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      clearTimeout(reconnectTimer.current)
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectTimer.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => ws.close()

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)

      switch (msg.type) {
        case 'init':
          setMothership(msg.data.mothership)
          setDrones(msg.data.drones)
          setMissionLog(msg.data.mission_log)
          setMissionQueue(msg.data.mission_queue ?? [])
          setScheduledAscentTime(msg.data.scheduled_ascent_time ?? null)
          setAscentInterval(msg.data.ascent_interval ?? 60)
          setScheduledDiveTime(msg.data.scheduled_dive_time ?? null)
          setSurfaceHoldInterval(msg.data.surface_hold_interval ?? 60)
          setPendingCommands(msg.data.pending_commands ?? {})
          setKillChains(msg.data.kill_chains ?? [])
          break

        case 'queue_update':
          setMissionQueue(msg.data.queue ?? [])
          break

        case 'dive_status':
          setScheduledDiveTime(msg.data.scheduled_dive_time ?? null)
          break

        case 'mothership_update':
          setMothership({ ...msg.data })
          break

        case 'drone_update':
          setDrones(prev => prev.map(d => d.id === msg.data.id ? { ...msg.data } : d))
          break

        case 'drone_uplink':
          setDrones(msg.data.drones)
          setUplinkTime(msg.data.uplink_time)
          break

        case 'pending_commands_update':
          setPendingCommands(msg.data.pending ?? {})
          break

        case 'mission_log_update':
          setMissionLog(msg.data.log)
          break

        case 'relay_pulse':
          setRelayPulse(msg.data.active)
          break

        case 'ascent_status':
          setScheduledAscentTime(msg.data.scheduled_time ?? null)
          if (msg.data.ascent_interval != null) setAscentInterval(msg.data.ascent_interval)
          break

        case 'kill_chain_update': {
          const update = msg.data
          setKillChains(prev => {
            const idx = prev.findIndex(c => c.contact_id === update.contact_id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = update
              return next
            }
            return [...prev, update]
          })
          // Auto-switch to Kill Chain tab when a new chain is detected
          if (update.stage === 'DETECT' && update.active) {
            setActiveRightTab('KILL_CHAIN')
          }
          break
        }

        case 'ack':
          setTxStatus(msg.data.message)
          setTimeout(() => setTxStatus(''), 4000)
          break

        default:
          break
      }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const addToQueue = useCallback((mission) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setTxStatus('ERROR: NO UPLINK')
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'add_to_queue', data: mission }))
    setLastTxTime(new Date())
    setTxStatus('ADDED TO QUEUE')
  }, [])

  const removeFromQueue = useCallback((qid) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'remove_from_queue', data: { qid } }))
  }, [])

  const setMothershipWaypoint = useCallback((x, y) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'set_mothership_waypoint', data: { x, y } }))
  }, [])


  const queueDroneCommand = useCallback((droneId, cmd) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setTxStatus('ERROR: NO UPLINK')
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'queue_drone_command', data: { id: droneId, ...cmd } }))
  }, [])

  const setAscentIntervalCmd = useCallback((seconds) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'set_ascent_interval', data: { seconds } }))
  }, [])

  const commandDive = useCallback((mode, time) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setTxStatus('ERROR: NO UPLINK')
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'command_dive', data: { mode, time } }))
  }, [])

  const setSurfaceHoldIntervalCmd = useCallback((seconds) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    setSurfaceHoldInterval(seconds)
    wsRef.current.send(JSON.stringify({ type: 'set_surface_hold_interval', data: { seconds } }))
  }, [])

  const commandAscent = useCallback((mode, time) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setTxStatus('ERROR: NO UPLINK')
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'command_ascent', data: { mode, time } }))
    setTxStatus(mode === 'immediate' ? 'ASCENDING...' : mode === 'cancel' ? 'SCHEDULE CLEARED' : `SCHEDULED ${time}`)
  }, [])

  const triggerKillChain = useCallback((droneId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'trigger_kill_chain', data: { drone_id: droneId } }))
  }, [])

  const setDroneTarget = useCallback((id, x, y, taskType = 'SURVEILLANCE', duration = 20) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setTxStatus('ERROR: NO UPLINK')
      return
    }
    wsRef.current.send(JSON.stringify({ type: 'set_drone_target', data: { id, x: parseFloat(x), y: parseFloat(y), task_type: taskType, hold_duration: duration } }))
    setTxStatus(`COMMANDING ${id}...`)
  }, [])

  const startResize = useCallback((divider) => {
    return (e) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidths = { ...colWidths }

      const handleMouseMove = (moveE) => {
        const diff = moveE.clientX - startX

        if (divider === 'left') {
          // Dragging left divider - resize left panel
          const newLeft = Math.max(200, Math.min(400, startWidths.left + diff))
          setColWidths(prev => ({ ...prev, left: newLeft }))
        } else {
          // Dragging right divider - resize right panel
          const newRight = Math.max(200, Math.min(500, startWidths.right - diff))
          setColWidths(prev => ({ ...prev, right: newRight }))
        }
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div className="app">
      {/* Top status bar */}
      <div className="top-bar">
        <span className="top-bar__logo">◈ NUMORA</span>
        <span className="top-bar__system">AUTONOMOUS UNDERWATER SWARM RELAY SYSTEM</span>

        {/* Right panel tab switcher */}
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', marginRight: '12px' }}>
          {[
            { key: 'SWARM', label: 'SWARM' },
            { key: 'KILL_CHAIN', label: 'KILL CHAIN', count: killChains.filter(c => c.active).length },
          ].map(({ key, label, count }) => {
            const isActive = activeRightTab === key
            const hasAlert = count > 0
            return (
              <button
                key={key}
                onClick={() => setActiveRightTab(key)}
                style={{
                  background:   isActive ? 'rgba(0,255,136,0.12)' : 'transparent',
                  border:       `1px solid ${isActive ? 'var(--green)' : hasAlert ? 'var(--red)' : 'var(--border)'}`,
                  color:        isActive ? 'var(--green)' : hasAlert ? 'var(--red)' : 'var(--text-dim)',
                  fontFamily:   'inherit',
                  fontSize:     '9px',
                  letterSpacing: '0.12em',
                  padding:      '3px 10px',
                  cursor:       'pointer',
                  borderRadius: '2px',
                  animation:    hasAlert && !isActive ? 'pulse-red 1.5s ease-in-out infinite' : 'none',
                }}
              >
                {label}{count > 0 ? ` [${count}]` : ''}
              </button>
            )
          })}
        </div>

        <span className="top-bar__time">{new Date().toUTCString().slice(0, 25)} UTC</span>
        <span className={`top-bar__link ${connected ? 'green' : 'red'}`}>
          {connected ? '● UPLINK ACTIVE' : '● UPLINK LOST'}
        </span>
      </div>

      {/* Three-panel layout */}
      <div
        ref={panelsRef}
        className="panels"
        style={{ gridTemplateColumns: `${colWidths.left}px 10px 1fr 10px ${colWidths.right}px` }}
      >
        <OperatorConsole
          onAddToQueue={addToQueue}
          onRemoveFromQueue={removeFromQueue}
          missionQueue={missionQueue}
          onCommandAscent={commandAscent}
          onSetAscentInterval={setAscentIntervalCmd}
          scheduledAscentTime={scheduledAscentTime}
          ascentInterval={ascentInterval}
          onCommandDive={commandDive}
          onSetSurfaceHoldInterval={setSurfaceHoldIntervalCmd}
          scheduledDiveTime={scheduledDiveTime}
          surfaceHoldInterval={surfaceHoldInterval}
          mothership={mothership}
          lastTxTime={lastTxTime}
          txStatus={txStatus}
          mothershipState={mothership?.state}
        />

        <div onMouseDown={startResize('left')} style={{ cursor: 'col-resize', width: '10px', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '2px', height: '80%', background: 'rgba(0,255,136,0.2)', borderRadius: '1px' }} />
        </div>

        <Mothership
          mothership={mothership}
          missionLog={missionLog}
          relayPulse={relayPulse}
          drones={drones}
          pendingCommands={pendingCommands}
          onQueueCommand={queueDroneCommand}
          onSetMothershipWaypoint={setMothershipWaypoint}
          onSetDroneTarget={setDroneTarget}
        />

        <div onMouseDown={startResize('right')} style={{ cursor: 'col-resize', width: '10px', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '2px', height: '80%', background: 'rgba(0,255,136,0.2)', borderRadius: '1px' }} />
        </div>

        {activeRightTab === 'SWARM' ? (
          <SwarmStatus
            drones={drones}
            mothership={mothership}
            onSetTarget={setDroneTarget}
            onSetMothershipWaypoint={setMothershipWaypoint}
            onQueueCommand={queueDroneCommand}
            pendingCommands={pendingCommands}
            uplinkTime={uplinkTime}
          />
        ) : (
          <KillChainPanel
            killChains={killChains}
            drones={drones}
            onTriggerKillChain={triggerKillChain}
          />
        )}
      </div>
    </div>
  )
}
