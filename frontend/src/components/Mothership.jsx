import React, { useEffect, useRef, useState } from 'react'
import './Mothership.css'
import ChatbotPanel from './ChatbotPanel'

const STATE_COLORS = {
  'SUBMERGED':  'var(--green)',
  'ASCENDING':  'var(--blue)',
  'SURFACED':   'var(--blue)',
  'COMMS LOCK': 'var(--amber)',
  'HOLDING':    'var(--green)',
  'RELAYING':   'var(--amber)',
  'DIVING':     'var(--blue)',
}

const STATE_ORDER = ['SUBMERGED', 'ASCENDING', 'SURFACED', 'COMMS LOCK', 'HOLDING', 'DIVING', 'RELAYING']

// Oscilloscope canvas hook
function useOscilloscope(canvasRef, active, state) {
  const animRef = useRef(null)
  const phaseRef = useRef(0)
  const amplitudeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const cssW = canvas.offsetWidth
    const cssH = canvas.offsetHeight
    const W = canvas.width = cssW * 2
    const H = canvas.height = cssH * 2
    canvas.style.width  = cssW + 'px'
    canvas.style.height = cssH + 'px'

    const targetAmp = (active || state === 'RELAYING' || state === 'COMMS LOCK') ? 1.0 : 0.12

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      // Background grid
      ctx.strokeStyle = 'rgba(0,255,136,0.06)'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += W / 10) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y < H; y += H / 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // Ease amplitude
      amplitudeRef.current += (targetAmp - amplitudeRef.current) * 0.08

      const amp = amplitudeRef.current
      const freq = active ? 3.5 : 1.2
      const noise = active ? 0.15 : 0.04
      phaseRef.current += active ? 0.12 : 0.04

      // Draw waveform with glow
      const glowColor = active ? 'rgba(255,179,71,' : 'rgba(0,255,136,'

      for (let pass = 0; pass < 3; pass++) {
        const alpha = [0.08, 0.2, 0.7][pass]
        const lineW  = [6,   3,   1.5][pass]

        ctx.beginPath()
        ctx.strokeStyle = `${glowColor}${alpha})`
        ctx.lineWidth = lineW

        for (let px = 0; px <= W; px += 2) {
          const t = px / W
          const wave =
            Math.sin(t * Math.PI * 2 * freq + phaseRef.current) * amp +
            Math.sin(t * Math.PI * 2 * freq * 2.3 + phaseRef.current * 1.3) * amp * 0.3 +
            (Math.random() - 0.5) * noise * amp

          const y = H / 2 + wave * (H * 0.38)
          px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y)
        }
        ctx.stroke()
      }

      // Center line (dim)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(0,255,136,0.15)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2)
      ctx.stroke()
      ctx.setLineDash([])

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [active, state])
}

// Depth gauge component
function DepthGauge({ depth }) {
  const pct = Math.min(100, (depth / 130) * 100)
  return (
    <div className="depth-gauge">
      <div className="depth-gauge__label">DEPTH (m)</div>
      <div className="depth-gauge__bar-wrap">
        <div className="depth-gauge__bar" style={{ height: `${pct}%` }} />
        <div className="depth-gauge__markers">
          {[0, 25, 50, 75, 100].map(p => (
            <div key={p} className="depth-gauge__tick" style={{ bottom: `${p}%` }}>
              <span>{Math.round((1 - p / 100) * 130)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="depth-gauge__value green">{depth.toFixed(1)}</div>
    </div>
  )
}

export default function Mothership({
  mothership,
  missionLog,
  relayPulse,
  drones,
  pendingCommands,
  onQueueCommand,
  onSetMothershipWaypoint,
  onSetDroneTarget,
}) {
  const oscRef = useRef(null)
  const [tick, setTick] = useState(0)

  // Force re-render every second for live clock
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useOscilloscope(oscRef, relayPulse, mothership.state)

  const stateColor = STATE_COLORS[mothership.state] || 'var(--green)'
  const isActive   = mothership.state !== 'SUBMERGED'

  const battColor = mothership.battery > 60
    ? 'var(--green)'
    : mothership.battery > 30
      ? 'var(--amber)'
      : 'var(--red)'

  return (
    <div className="panel panel--mothership">
      <div className="panel__header">
        <span className="panel__title" style={{ fontSize: '13px', letterSpacing: '0.25em' }}>
          NUMORA MS-01 ◈ MOTHERSHIP
        </span>
        <span className="panel__badge" style={{ color: stateColor, borderColor: stateColor }}>
          {mothership.state}
        </span>
      </div>

      <div className="panel__body ms-body">

        {/* ── Big status + depth gauge ── */}
        <div className="ms-top">
          <DepthGauge depth={mothership.depth} />

          <div className="ms-main-status">
            {/* Animated state display */}
            <div className="ms-state-display" style={{ color: stateColor, borderColor: stateColor, boxShadow: `0 0 30px ${stateColor}33` }}>
              <div className="ms-state-label">CURRENT STATE</div>
              <div className="ms-state-text" style={{ color: stateColor, textShadow: `0 0 20px ${stateColor}` }}>
                {mothership.state}
              </div>
              {mothership.state === 'RELAYING' && (
                <div className="ms-relay-ring" />
              )}
            </div>

            {/* State pipeline */}
            <div className="ms-pipeline">
              {STATE_ORDER.map((s, i) => {
                const idx   = STATE_ORDER.indexOf(mothership.state)
                const isCur = s === mothership.state
                const isPast = i < idx
                return (
                  <React.Fragment key={s}>
                    <div className={`ms-pipe-step ${isCur ? 'current' : isPast ? 'past' : ''}`}
                      style={isCur ? { color: stateColor, borderColor: stateColor } : {}}>
                      {s.replace(' ', '\u00a0')}
                    </div>
                    {i < STATE_ORDER.length - 1 && (
                      <div className={`ms-pipe-arrow ${isPast || isCur ? 'active' : ''}`}>▸</div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>

            {/* Telemetry row */}
            <div className="ms-telemetry">
              <div className="ms-telem-cell">
                <div className="ms-telem-label">BATTERY</div>
                <div className="ms-telem-value" style={{ color: battColor }}>
                  {mothership.battery.toFixed(1)}%
                </div>
                <div className="ms-telem-bar">
                  <div className="ms-telem-bar-fill" style={{ width: `${mothership.battery}%`, background: battColor }} />
                </div>
              </div>
              <div className="ms-telem-cell">
                <div className="ms-telem-label">INT TEMP</div>
                <div className="ms-telem-value green">{mothership.temp.toFixed(1)}°C</div>
              </div>
              <div className="ms-telem-cell">
                <div className="ms-telem-label">HEADING</div>
                <div className="ms-telem-value green">{mothership.heading.toFixed(0)}°</div>
              </div>
              <div className="ms-telem-cell">
                <div className="ms-telem-label">SAT SIG</div>
                <div className="ms-telem-value" style={{ color: mothership.signal_strength > 0.5 ? 'var(--amber)' : 'var(--text-dim)' }}>
                  {(mothership.signal_strength * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Acoustic Signal Oscilloscope ── */}
        <div className="ms-osc-wrap">
          <div className="ms-osc-header">
            <span className="section-label">ACOUSTIC SIGNAL MONITOR</span>
            <span className="ms-osc-status" style={{ color: relayPulse ? 'var(--amber)' : 'var(--text-dim)' }}>
              {relayPulse ? '● TRANSMITTING' : '○ PASSIVE'}
            </span>
          </div>
          <canvas ref={oscRef} className="ms-osc-canvas" />
        </div>

        {/* ── Mission Log ── */}
        <div className="ms-log">
          <div className="section-label" style={{ marginBottom: '8px' }}>MISSION LOG</div>
          {missionLog.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: '10px', textAlign: 'center', padding: '20px' }}>
              AWAITING FIRST MISSION TRANSMISSION
            </div>
          ) : (
            missionLog.map((m, i) => (
              <div key={m.id} className={`ms-log-entry ${i === 0 ? 'ms-log-entry--new' : ''}`}>
                <div className="ms-log-row">
                  <span className="ms-log-id">#{String(m.id).padStart(4, '0')}</span>
                  <span className="ms-log-time amber">{m.ts}</span>
                  <span className="ms-log-type green">{m.type}</span>
                  <span className="ms-log-drones dim">{m.drones} UUV{m.drones > 1 ? 's' : ''}</span>
                </div>
                <div className="ms-log-detail">
                  <span style={{ color: 'var(--text-secondary)' }}>{m.target}</span>
                  <span className="ms-log-status" style={{ color: m.priority === 'CRITICAL' ? 'var(--red)' : 'var(--amber)' }}>
                    [{m.priority}] {m.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── AI Chatbot Panel ── */}
        <ChatbotPanel
          mothership={mothership}
          drones={drones || []}
          missionLog={missionLog}
          pendingCommands={pendingCommands || {}}
          onQueueCommand={onQueueCommand}
          onSetMothershipWaypoint={onSetMothershipWaypoint}
          onSetDroneTarget={onSetDroneTarget}
        />
      </div>
    </div>
  )
}
