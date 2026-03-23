import React, { useState } from 'react'

const MISSION_TYPES = [
  'SURVEILLANCE',
  'MINE DETECTION',
  'PERIMETER PATROL',
  'TARGET TRACKING',
]

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const NAV_SPEED_VALUES = [0.04, 0.08, 0.12, 0.24, 0.40]
const NAV_SPEED_LABELS = ['SLOW', 'AHEAD 1/4', 'CRUISE', 'AHEAD 3/4', 'FLANK']

const PRIORITY_COLOR = {
  LOW: 'green',
  MEDIUM: 'amber',
  HIGH: 'amber',
  CRITICAL: 'red',
}

function QueueItem({ m, idx, onRemove }) {
  const speedLabel = NAV_SPEED_LABELS[NAV_SPEED_VALUES.findIndex(v => Math.abs(v - m.nav_speed) < 0.001)] ?? `${m.nav_speed}`

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      padding: '7px 8px',
      fontSize: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '9px' }}>#{idx + 1}</span>
          <span className="green" style={{ fontWeight: 700, letterSpacing: '0.05em' }}>{m.mission_type}</span>
        </div>
        <button
          onClick={() => onRemove(m.qid)}
          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', padding: '0 2px', lineHeight: 1 }}
          title="Remove"
        >✕</button>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '5px', lineHeight: '1.7' }}>
        {[
          ['TARGET',   m.target_area,                                           'green'],
          ['PRIORITY', m.priority,                                               PRIORITY_COLOR[m.priority] || 'green'],
          ['ASSETS',   `${m.drone_count} UUV${m.drone_count > 1 ? 's' : ''}`,  'green'],
          ['SPEED',    speedLabel,                                               'blue'],
        ].map(([label, value, cls]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>{label}</span>
            <span className={cls}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function fmtCountdown(seconds) {
  if (seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function OperatorConsole({
  onAddToQueue,
  onRemoveFromQueue,
  missionQueue = [],
  onCommandAscent,
  onSetAscentInterval,
  scheduledAscentTime,
  ascentInterval,
  onCommandDive,
  onSetSurfaceHoldInterval,
  scheduledDiveTime,
  surfaceHoldInterval = 60,
  mothership,
  lastTxTime,
  txStatus,
  mothershipState,
}) {
  const [missionType,  setMissionType]  = useState('SURVEILLANCE')
  const [targetArea,   setTargetArea]   = useState('Grid 447-B, depth 40m')
  const [priority,     setPriority]     = useState('MEDIUM')
  const [droneCount,   setDroneCount]   = useState(3)
  const [navSpeed,     setNavSpeed]     = useState(3)
  const [scheduleTime, setScheduleTime] = useState('')
  const [diveTime, setDiveTime]         = useState('')

  const canSetSpeed = mothershipState === 'SURFACED' || mothershipState === 'COMMS LOCK'
  const currentState = mothership?.state || mothershipState
  const atSurface = ['SURFACED', 'COMMS LOCK', 'HOLDING'].includes(currentState)

  const fmtScheduled = (ts) => {
    if (!ts) return null
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const fmtTime = (d) => d
    ? `LAST TX: ${d.toISOString().slice(11, 19)} UTC`
    : 'AWAITING FIRST TRANSMISSION'

  return (
    <div className="panel">
      <div className="panel__header">
        <span className="panel__title">OPERATOR CONSOLE</span>
        <span className="panel__badge green">STA-1</span>
      </div>

      <div className="panel__body">

        {/* ── MISSION QUEUE (top — always visible) ── */}
        <div>
          <div className="section-label" style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
            <span>MISSION QUEUE</span>
            <span style={{ color: missionQueue.length > 0 ? 'var(--amber)' : 'var(--text-dim)' }}>
              {missionQueue.length} PENDING
            </span>
          </div>

          {missionQueue.length === 0 ? (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center', padding: '10px 0', border: '1px dashed var(--border)' }}>
              NO MISSIONS QUEUED
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {missionQueue.map((m, idx) => (
                <QueueItem key={m.qid} m={m} idx={idx} onRemove={onRemoveFromQueue} />
              ))}
              <div style={{ fontSize: '9px', color: 'var(--text-dim)', textAlign: 'center', letterSpacing: '0.08em', paddingTop: '2px' }}>
                ⚡ RELAYS ON NEXT SURFACE WINDOW
              </div>
            </div>
          )}
        </div>

        <div className="divider" />

        {/* ── MISSION FORM ── */}
        <div>
          <div className="section-label" style={{ marginBottom: '8px' }}>ADD MISSION</div>

          {/* Classification banner */}
          <div style={{
            border: '1px solid var(--red)',
            padding: '4px 8px',
            textAlign: 'center',
            fontSize: '9px',
            letterSpacing: '0.15em',
            color: 'var(--red)',
            background: 'rgba(255,68,68,0.05)',
            marginBottom: '10px',
          }}>
            ⚠ CLASSIFIED — EYES ONLY
          </div>

          <div className="field">
            <label>Mission Type</label>
            <select value={missionType} onChange={e => setMissionType(e.target.value)}>
              {MISSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="field">
            <label>Target Area / Grid Reference</label>
            <input
              type="text"
              value={targetArea}
              onChange={e => setTargetArea(e.target.value)}
              placeholder="e.g. Grid 447-B, depth 40m"
            />
          </div>

          <div className="field">
            <label>Mission Priority</label>
            <div className="priority-grid">
              {PRIORITIES.map(p => (
                <button
                  key={p}
                  className={`priority-btn ${priority === p ? `active-${p.toLowerCase()}` : ''}`}
                  onClick={() => setPriority(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Drone Allocation</label>
            <div className="slider-row">
              <input type="range" min={1} max={5} value={droneCount} onChange={e => setDroneCount(Number(e.target.value))} />
              <span className="slider-value green">{droneCount}</span>
            </div>
          </div>

          <div className="field" style={{ opacity: canSetSpeed ? 1 : 0.4 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Transit Speed</span>
              <span style={{ color: canSetSpeed ? 'var(--blue)' : 'var(--text-dim)', fontSize: '9px' }}>
                {canSetSpeed ? 'UPLINK ACTIVE' : 'REQUIRES SURFACE WINDOW'}
              </span>
            </label>
            <div className="slider-row">
              <input type="range" min={1} max={5} value={navSpeed} disabled={!canSetSpeed} onChange={e => setNavSpeed(Number(e.target.value))} />
              <span className="slider-value" style={{ color: canSetSpeed ? 'var(--blue)' : 'var(--text-dim)' }}>
                {NAV_SPEED_LABELS[navSpeed - 1]}
              </span>
            </div>
          </div>

          <button className="transmit-btn" onClick={() => onAddToQueue({
            mission_type: missionType,
            target_area: targetArea,
            priority,
            drone_count: droneCount,
            nav_speed: NAV_SPEED_VALUES[navSpeed - 1],
          })}>
            ＋ ADD TO QUEUE
          </button>

          <div className="tx-status">{txStatus || fmtTime(lastTxTime)}</div>
        </div>

        <div className="divider" />

        {/* ── SURFACE TIMING ── */}
        <div>
          <div className="section-label" style={{ marginBottom: '8px' }}>SURFACE TIMING</div>

          {/* Countdown / status display */}
          {(() => {
            const ms = mothership || {}
            const state = ms.state || mothershipState
            const idleTimer = ms.idle_timer ?? 0
            const surfaceElapsed = ms.surface_elapsed ?? 0
            const timeUntilSurface = Math.max(0, ascentInterval - idleTimer)
            const timeUntilAutoDive = Math.max(0, surfaceHoldInterval - surfaceElapsed)
            const atSurface = ['SURFACED', 'COMMS LOCK', 'HOLDING'].includes(state)

            let statusColor = 'var(--green)'
            let statusLine = ''
            let countdownLine = ''

            if (!atSurface) {
              // No comms underwater — show countdown but no live telemetry
              statusLine = 'COMMS DARK — NO SIGNAL'
              statusColor = 'var(--text-dim)'
              countdownLine = scheduledAscentTime
                ? `SCHEDULED SURFACE AT ${fmtScheduled(scheduledAscentTime)}`
                : `NEXT SURFACE IN  ${fmtCountdown(timeUntilSurface)}`
            } else {
              statusLine = state === 'COMMS LOCK' ? 'ACQUIRING COMMS LOCK...' : 'SURFACE WINDOW ACTIVE'
              statusColor = 'var(--green)'
              countdownLine = scheduledDiveTime
                ? `SCHEDULED DIVE AT ${fmtScheduled(scheduledDiveTime)}`
                : `AUTO-DIVE IN  ${fmtCountdown(timeUntilAutoDive)}`
            }

            return (
              <div style={{
                background: 'var(--bg-card)',
                border: `1px solid ${atSurface ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`,
                padding: '8px 10px',
                marginBottom: '10px',
                fontSize: '10px',
              }}>
                <div style={{ color: statusColor, fontWeight: 700, letterSpacing: '0.1em', marginBottom: countdownLine ? '4px' : 0 }}>
                  ● {statusLine}
                </div>
                {countdownLine && (
                  <div style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.05em' }}>
                    {countdownLine}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Auto-ascent interval */}
          <div className="field" style={{ marginBottom: '8px', opacity: atSurface ? 1 : 0.4 }}>
            <label>Auto-Ascent Interval</label>
            <div className="slider-row">
              <input type="range" min={10} max={1800} step={5} value={ascentInterval} disabled={!atSurface} onChange={e => onSetAscentInterval(Number(e.target.value))} />
              <span className="slider-value green">
                {ascentInterval >= 60
                  ? `${Math.floor(ascentInterval / 60)}m${ascentInterval % 60 ? `${ascentInterval % 60}s` : ''}`
                  : `${ascentInterval}s`}
              </span>
            </div>
          </div>

          {/* Schedule ascent */}
          <div style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '4px', opacity: atSurface ? 1 : 0.4 }}>
            SCHEDULE ASCENT {!atSurface && '— SURFACE ONLY'}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', opacity: atSurface ? 1 : 0.4 }}>
            <input
              type="time"
              value={scheduleTime}
              disabled={!atSurface}
              onChange={e => setScheduleTime(e.target.value)}
              style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '5px 8px', fontFamily: 'inherit', fontSize: '11px', borderRadius: '2px' }}
            />
            <button className="control-btn" style={{ padding: '5px 10px', opacity: scheduleTime && atSurface ? 1 : 0.4 }} disabled={!scheduleTime || !atSurface}
              onClick={() => { onCommandAscent('scheduled', scheduleTime); setScheduleTime('') }}>
              SET
            </button>
          </div>
          {scheduledAscentTime ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', padding: '4px 8px', fontSize: '10px', marginBottom: '8px' }}>
              <span style={{ color: 'var(--green)' }}>⏱ ASCENT AT {fmtScheduled(scheduledAscentTime)}</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', padding: 0, opacity: atSurface ? 1 : 0.4 }} disabled={!atSurface} onClick={() => onCommandAscent('cancel')}>✕</button>
            </div>
          ) : (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '8px' }}>NO ASCENT SCHEDULED</div>
          )}

          <div className="divider" />

          {/* Surface hold interval */}
          <div className="field" style={{ marginBottom: '8px', opacity: atSurface ? 1 : 0.4 }}>
            <label>Surface Hold Duration</label>
            <div className="slider-row">
              <input type="range" min={10} max={600} step={5} value={surfaceHoldInterval} disabled={!atSurface} onChange={e => onSetSurfaceHoldInterval(Number(e.target.value))} />
              <span className="slider-value" style={{ color: 'var(--blue)' }}>
                {surfaceHoldInterval >= 60
                  ? `${Math.floor(surfaceHoldInterval / 60)}m${surfaceHoldInterval % 60 ? `${surfaceHoldInterval % 60}s` : ''}`
                  : `${surfaceHoldInterval}s`}
              </span>
            </div>
          </div>

          {/* Schedule dive / dive now */}
          {(() => {
            return (
              <>
                <div style={{ fontSize: '9px', color: atSurface ? 'var(--text-dim)' : 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '4px', opacity: atSurface ? 1 : 0.4 }}>
                  COMMAND DIVE {!atSurface && '— SURFACE ONLY'}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', opacity: atSurface ? 1 : 0.4 }}>
                  <input
                    type="time"
                    value={diveTime}
                    disabled={!atSurface}
                    onChange={e => setDiveTime(e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '5px 8px', fontFamily: 'inherit', fontSize: '11px', borderRadius: '2px', opacity: atSurface ? 1 : 0.5 }}
                  />
                  <button className="control-btn" style={{ padding: '5px 10px', opacity: diveTime && atSurface ? 1 : 0.4 }} disabled={!diveTime || !atSurface}
                    onClick={() => { onCommandDive('scheduled', diveTime); setDiveTime('') }}>
                    SET
                  </button>
                </div>
                {scheduledDiveTime ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,170,255,0.06)', border: '1px solid rgba(0,170,255,0.25)', padding: '4px 8px', fontSize: '10px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--blue)' }}>⏱ DIVE AT {fmtScheduled(scheduledDiveTime)}</span>
                    <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', padding: 0 }} onClick={() => onCommandDive('cancel')}>✕</button>
                  </div>
                ) : (
                  <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '4px' }}>NO DIVE SCHEDULED</div>
                )}
                <button
                  className="transmit-btn"
                  style={{ background: atSurface ? 'rgba(255,68,68,0.08)' : 'none', borderColor: 'var(--red)', color: 'var(--red)', opacity: atSurface ? 1 : 0.3, marginTop: '4px' }}
                  disabled={!atSurface}
                  onClick={() => onCommandDive('immediate')}
                >
                  ▼ DIVE NOW
                </button>
              </>
            )
          })()}
        </div>

        {/* Operator auth */}
        <div style={{
          marginTop: 'auto',
          fontSize: '9px',
          color: 'var(--text-dim)',
          letterSpacing: '0.1em',
          borderTop: '1px solid var(--border)',
          paddingTop: '10px',
        }}>
          <div>OPERATOR: OPS-7 // AUTH LEVEL 3</div>
          <div>CHANNEL: ENCRYPTED ACOUSTIC</div>
          <div>PLATFORM: NUMORA-GCS v2.1.4</div>
        </div>
      </div>
    </div>
  )
}
