import React, { useState } from 'react'
import './SwarmStatus.css'
import TacticalMapLeaflet from './TacticalMapLeaflet.jsx'

const STATUS_COLORS = {
  'IDLE':        'var(--text-secondary)',
  'TASKED':      'var(--amber)',
  'EN ROUTE':    'var(--blue)',
  'SURVEILLING': 'var(--green)',
  'PATROLLING':  'var(--blue)',
  'RECONNING':   'var(--amber)',
  'SCANNING':    'var(--green)',
  'ON STATION':  'var(--green)',
  'RETURNING':   'var(--amber)',
}

const STATUS_ANIM = {
  'TASKED':      'pulse-amber 1.5s ease-in-out infinite',
  'EN ROUTE':    'none',
  'SURVEILLING': 'pulse-glow 2s ease-in-out infinite',
  'PATROLLING':  'none',
  'RECONNING':   'pulse-amber 1.5s ease-in-out infinite',
  'SCANNING':    'pulse-glow 2s ease-in-out infinite',
  'ON STATION':  'pulse-glow 2s ease-in-out infinite',
}

const STATUS_ICON = {
  'IDLE':        '○',
  'TASKED':      '◎',
  'EN ROUTE':    '▶',
  'SURVEILLING': '↻',
  'PATROLLING':  '⇌',
  'RECONNING':   '◈',
  'SCANNING':    '▦',
  'ON STATION':  '◉',
  'RETURNING':   '◀',
}

const TASK_TYPES = ['SURVEILLANCE', 'PERIMETER PATROL', 'RECON', 'MINE DETECTION']
const CONTINUOUS = 9999

function fmtDuration(s) {
  if (s >= CONTINUOUS) return '∞ CONTINUOUS'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), r = s % 60
  return r ? `${m}m ${r}s` : `${m}m`
}


function DroneCard({ drone, onQueueCommand, isSelected, onSelect, pendingTask, mothership, taskType, duration, onTaskChange, onRemove }) {
  const color  = STATUS_COLORS[drone.status] || 'var(--text-secondary)'
  const anim   = STATUS_ANIM[drone.status]   || 'none'
  const battColor = drone.battery > 40 ? 'var(--green)' : drone.battery > 20 ? 'var(--amber)' : 'var(--red)'

  const [targetX,  setTargetX]  = useState(drone.target_x || 0)
  const [targetY,  setTargetY]  = useState(drone.target_y || 0)
  const [coordError, setCoordError] = useState('')

  const handleQueue = (e) => {
    e.stopPropagation()
    const x = parseFloat(targetX)
    const y = parseFloat(targetY)
    if (isNaN(x) || isNaN(y)) {
      setCoordError('INVALID COORDINATES')
      return
    }
    setCoordError('')
    onQueueCommand(drone.id, {
      task_type:    taskType,
      hold_duration: duration,
      target_x:     x,
      target_y:     y,
    })
  }

  const handleFollowMothership = (e) => {
    e.stopPropagation()
    onQueueCommand(drone.id, {
      task_type:    taskType,
      hold_duration: duration,
      target_x:     mothership.x ?? 0,
      target_y:     mothership.y ?? 0,
    })
  }

  return (
    <div
      className="drone-card"
      style={{
        borderColor: isSelected ? 'var(--green)' : color,
        boxShadow:   isSelected ? '0 0 16px rgba(0,255,136,0.5)' : drone.status !== 'IDLE' ? `0 0 12px ${color}33` : 'none',
        animation:   anim,
        cursor:      'pointer',
      }}
      onClick={() => onSelect(drone.id)}
    >
      {/* Header */}
      <div className="drone-card__header">
        <span className="drone-card__id">{isSelected ? '▶ ' : ''}{drone.id}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="drone-card__status" style={{ color }}>
            {STATUS_ICON[drone.status] || '○'} {drone.status}
          </span>
          <button
            title={drone.status !== 'IDLE' ? 'Can only remove idle drones' : 'Remove from swarm'}
            disabled={drone.status !== 'IDLE'}
            onClick={e => { e.stopPropagation(); onRemove(drone.id) }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: drone.status === 'IDLE' ? 'var(--red)' : 'var(--border)',
              cursor: drone.status === 'IDLE' ? 'pointer' : 'not-allowed',
              fontSize: '9px', padding: '1px 5px', borderRadius: '2px',
              fontFamily: 'inherit', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Unrelayed contacts stored onboard */}
      {drone.unrelayed_count > 0 && (
        <div style={{
          fontSize: '8px', letterSpacing: '0.1em', padding: '2px 5px',
          background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.35)',
          color: 'var(--amber)', marginBottom: '4px', textAlign: 'center',
        }}>
          ◉ {drone.unrelayed_count} CONTACT{drone.unrelayed_count > 1 ? 'S' : ''} STORED — AWAITING RELAY
        </div>
      )}

      {/* Kill chain stage indicator */}
      {drone.kill_chain_stage && (
        <div style={{
          fontSize: '8px', letterSpacing: '0.1em', padding: '2px 5px',
          background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.4)',
          color: 'var(--red)', marginBottom: '4px', textAlign: 'center',
          animation: 'pulse-red 1.2s ease-in-out infinite',
        }}>
          ◈ KILL CHAIN — {drone.kill_chain_stage}
        </div>
      )}

      {/* Telemetry */}
      <div className="drone-card__metrics">
        <div className="drone-metric">
          <span className="drone-metric__label">BATT</span>
          <span className="drone-metric__value" style={{ color: battColor, animation: drone.battery <= 20 ? 'pulse-red 1.2s ease-in-out infinite' : 'none' }}>
            {drone.battery.toFixed(0)}%
          </span>
          <div className="drone-metric__bar">
            <div className="drone-metric__bar-fill"
              style={{ width: `${drone.battery}%`, background: battColor }} />
          </div>
        </div>
        <div className="drone-metric">
          <span className="drone-metric__label">DEPTH</span>
          <span className="drone-metric__value green">{drone.depth.toFixed(0)}m</span>
        </div>
      </div>

      {/* Waypoint */}
      <div className="drone-card__control">
        <div className="control-row">
          <label>X:</label>
          <input type="number" value={targetX} onChange={e => setTargetX(e.target.value)} step="0.1" onClick={e => e.stopPropagation()} />
        </div>
        <div className="control-row">
          <label>Y:</label>
          <input type="number" value={targetY} onChange={e => setTargetY(e.target.value)} step="0.1" onClick={e => e.stopPropagation()} />
        </div>
      </div>

      {/* Command section */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '6px' }}>
        <div className="section-label" style={{ marginBottom: '5px', fontSize: '8px' }}>TASK COMMAND</div>

        <select
          value={taskType}
          onChange={e => onTaskChange(e.target.value, duration)}
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', marginBottom: '5px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '3px 5px', fontFamily: 'inherit', fontSize: '10px' }}
        >
          {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Duration slider */}
        <div style={{ marginBottom: '5px' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>HOLD DURATION</span>
            <span style={{ fontSize: '10px', color: duration >= CONTINUOUS ? 'var(--amber)' : 'var(--green)', fontWeight: 700, letterSpacing: '0.06em' }}>
              {fmtDuration(duration)}
            </span>
          </div>
          <input
            type="range" min={30} max={600} step={10}
            value={Math.min(duration, 600)}
            disabled={duration >= CONTINUOUS}
            onChange={e => onTaskChange(taskType, Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--green)', opacity: duration >= CONTINUOUS ? 0.3 : 1 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--text-dim)', marginTop: '1px' }}>
            <span>30s</span><span>2m</span><span>5m</span><span>10m</span>
          </div>
          {/* Continuous toggle */}
          <button
            onClick={() => onTaskChange(taskType, duration >= CONTINUOUS ? 60 : CONTINUOUS)}
            style={{
              width: '100%', marginTop: '5px', padding: '3px', fontFamily: 'inherit',
              fontSize: '9px', letterSpacing: '0.1em', cursor: 'pointer', borderRadius: '2px',
              background: duration >= CONTINUOUS ? 'rgba(255,179,71,0.12)' : 'transparent',
              border: `1px solid ${duration >= CONTINUOUS ? 'var(--amber)' : 'var(--border)'}`,
              color: duration >= CONTINUOUS ? 'var(--amber)' : 'var(--text-dim)',
            }}
          >
            {duration >= CONTINUOUS ? '∞ CONTINUOUS — until recalled' : '∞ SET CONTINUOUS'}
          </button>
        </div>

        {coordError && (
          <div style={{ fontSize: '9px', color: 'var(--red)', marginBottom: '4px', letterSpacing: '0.08em' }}>
            ⚠ {coordError}
          </div>
        )}

        {pendingTask ? (
          <div style={{ fontSize: '9px', padding: '3px 6px', background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.3)', color: 'var(--amber)', textAlign: 'center' }}>
            ⏱ QUEUED: {pendingTask}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className="control-btn"
              style={{ flex: 1 }}
              onClick={handleQueue}
            >
              ◈ QUEUE
            </button>
            <button
              className="control-btn"
              style={{ flex: 1, background: 'rgba(0,170,255,0.15)', borderColor: '#00aaff', color: '#00aaff' }}
              onClick={handleFollowMothership}
            >
              ◈ FOLLOW
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


export default function SwarmStatus({ drones, mothership, onSetTarget, onSetMothershipWaypoint, onQueueCommand, pendingCommands, uplinkTime, onAddDrone, onRemoveDrone, contacts = [] }) {
  const [selectedDroneId, setSelectedDroneId] = useState(null)
  const [droneTaskSettings, setDroneTaskSettings] = useState({})
  const active = drones.filter(d => d.status !== 'IDLE').length

  const getTaskSettings = (droneId) => droneTaskSettings[droneId] ?? { taskType: 'SURVEILLANCE', duration: 60 }

  const handleTaskChange = (droneId, taskType, duration) => {
    setDroneTaskSettings(prev => ({ ...prev, [droneId]: { taskType, duration } }))
  }

  const handleSelectDrone = (id) => setSelectedDroneId(id)

  const handleSetTarget = (droneId, x, y) => {
    const { taskType, duration } = getTaskSettings(droneId)
    onSetTarget(droneId, x, y, taskType, duration)
    setSelectedDroneId(null)
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <span className="panel__title">SWARM NODES</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="panel__badge" style={{ color: active > 0 ? 'var(--amber)' : 'var(--text-secondary)', borderColor: active > 0 ? 'var(--amber)' : 'var(--text-secondary)' }}>
            {active}/{drones.length} ACTIVE
          </span>
          <button
            onClick={onAddDrone}
            disabled={drones.length >= 10}
            title={drones.length >= 10 ? 'Max swarm size reached (10)' : 'Deploy new drone'}
            style={{
              background: 'rgba(0,255,136,0.08)', border: '1px solid var(--green)',
              color: drones.length >= 10 ? 'var(--text-dim)' : 'var(--green)',
              fontFamily: 'inherit', fontSize: '9px', letterSpacing: '0.1em',
              padding: '2px 8px', cursor: drones.length >= 10 ? 'not-allowed' : 'pointer',
              borderRadius: '2px',
            }}
          >
            + ADD
          </button>
        </div>
      </div>

      <div style={{ padding: '4px 10px', fontSize: '9px', letterSpacing: '0.1em', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-dim)' }}>LAST UPLINK</span>
        <span style={{ color: uplinkTime ? 'var(--amber)' : 'var(--text-dim)' }}>
          {uplinkTime ? `${uplinkTime} UTC` : '— AWAITING SURFACE WINDOW —'}
        </span>
      </div>

      <div className="panel__body" style={{ padding: '10px' }}>

        {/* Tactical map */}
        <div className="tactical-map-wrap">
          <div className="section-label" style={{ marginBottom: '6px' }}>
            TACTICAL OVERLAY
            {selectedDroneId && (
              <span style={{ color: 'var(--green)', marginLeft: '8px' }}>
                — {selectedDroneId} SELECTED
              </span>
            )}
          </div>
          <TacticalMapLeaflet
            drones={drones}
            mothership={mothership}
            contacts={contacts}
            selectedDroneId={selectedDroneId}
            onSelectDrone={handleSelectDrone}
            onSetTarget={handleSetTarget}
            onSetMothershipWaypoint={onSetMothershipWaypoint}
          />
        </div>

        {/* Drone cards */}
        <div className="drone-grid">
          {drones.map(d => (
            <DroneCard
              key={d.id}
              drone={d}
              onQueueCommand={onQueueCommand}
              isSelected={d.id === selectedDroneId}
              onSelect={handleSelectDrone}
              pendingTask={pendingCommands[d.id] ?? null}
              mothership={mothership}
              taskType={getTaskSettings(d.id).taskType}
              duration={getTaskSettings(d.id).duration}
              onTaskChange={(t, dur) => handleTaskChange(d.id, t, dur)}
              onRemove={onRemoveDrone}
            />
          ))}
        </div>

        {/* Fleet summary */}
        <div className="fleet-summary">
          <div className="fleet-sum-row">
            <span className="dim">FLEET AVG BATTERY</span>
            <span className="green">
              {(drones.reduce((a, d) => a + d.battery, 0) / drones.length).toFixed(1)}%
            </span>
          </div>
          <div className="fleet-sum-row">
            <span className="dim">UNITS ON MISSION</span>
            <span className="amber">{active}</span>
          </div>
          <div className="fleet-sum-row">
            <span className="dim">UNITS IDLE</span>
            <span className="green">{drones.length - active}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
