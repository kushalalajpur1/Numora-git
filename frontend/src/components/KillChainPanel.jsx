import React from 'react'

const STAGES = ['DETECT', 'CLASSIFY', 'DECIDE', 'TASK', 'CONFIRM', 'COMPLETE']

const STAGE_DESC = {
  DETECT:   'Acoustic / optical contact detected by drone sensor array',
  CLASSIFY: 'AI classifier identifying contact type and acoustic signature',
  DECIDE:   'Command authority evaluating rules of engagement',
  TASK:     'Tasking assigned drone to intercept or shadow contact',
  CONFIRM:  'Confirming engagement outcome and filing contact report',
  COMPLETE: 'Kill chain sequence complete — contact actioned',
}

const THREAT_COLOR = {
  LOW:      'var(--green)',
  MEDIUM:   'var(--amber)',
  HIGH:     'var(--amber)',
  CRITICAL: 'var(--red)',
}

function KillChainCard({ chain }) {
  const currentIdx = STAGES.indexOf(chain.stage)
  const progress   = chain.active
    ? Math.round(((currentIdx + 1) / STAGES.length) * 100)
    : 100
  const threatColor = THREAT_COLOR[chain.threat_level] || 'var(--green)'

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${chain.active ? 'rgba(0,255,136,0.25)' : 'var(--border)'}`,
      borderRadius: '3px',
      padding: '10px',
      marginBottom: '8px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '11px', letterSpacing: '0.1em' }}>
            {chain.contact_id}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>
            ▶ {chain.drone_id}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{
            fontSize: '9px', padding: '2px 7px',
            border: `1px solid ${threatColor}`,
            color: threatColor, letterSpacing: '0.1em',
            animation: chain.threat_level === 'CRITICAL' ? 'pulse-red 1.2s ease-in-out infinite' : 'none',
          }}>
            {chain.threat_level}
          </span>
          {chain.active
            ? <span style={{ fontSize: '9px', color: 'var(--amber)', letterSpacing: '0.08em', animation: 'pulse-amber 1.5s ease-in-out infinite' }}>● ACTIVE</span>
            : <span style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>✓ DONE</span>
          }
        </div>
      </div>

      {/* Stage pipeline */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2px', marginBottom: '6px' }}>
        {STAGES.map((stage, i) => {
          const isPast    = i < currentIdx || !chain.active
          const isCurrent = i === currentIdx && chain.active
          return (
            <React.Fragment key={stage}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '8px', letterSpacing: '0.04em',
                  padding: '3px 4px',
                  border: `1px solid ${isCurrent ? 'var(--green)' : isPast ? 'rgba(0,255,136,0.35)' : 'var(--border)'}`,
                  color: isCurrent ? 'var(--green)' : isPast ? 'rgba(0,255,136,0.55)' : 'var(--text-dim)',
                  background: isCurrent ? 'rgba(0,255,136,0.08)' : 'transparent',
                  animation: isCurrent ? 'pulse-glow 1.5s ease-in-out infinite' : 'none',
                  width: '100%', textAlign: 'center', boxSizing: 'border-box',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {stage}
                </div>
                <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '2px', minHeight: '10px', letterSpacing: '0.02em' }}>
                  {chain.timestamps?.[stage] || ''}
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <div style={{
                  color: (i < currentIdx || (!chain.active)) ? 'rgba(0,255,136,0.4)' : 'var(--border)',
                  fontSize: '9px', flexShrink: 0, paddingTop: '4px', paddingLeft: '1px', paddingRight: '1px',
                }}>▸</div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Progress bar */}
      <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px', marginBottom: '6px' }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: chain.active ? 'var(--green)' : 'rgba(0,255,136,0.45)',
          borderRadius: '1px', transition: 'width 0.6s ease',
        }} />
      </div>

      {/* Description */}
      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '0.04em', fontStyle: 'italic' }}>
        {chain.active ? STAGE_DESC[chain.stage] : 'Kill chain sequence complete.'}
      </div>
    </div>
  )
}

export default function KillChainPanel({ killChains, drones, onTriggerKillChain }) {
  const active   = killChains.filter(c => c.active)
  const archived = killChains.filter(c => !c.active)

  return (
    <div className="panel">
      <div className="panel__header">
        <span className="panel__title" style={{ fontSize: '11px', letterSpacing: '0.2em' }}>
          KILL CHAIN CONSOLE
        </span>
        <span className="panel__badge" style={{
          color: active.length > 0 ? 'var(--red)' : 'var(--text-dim)',
          borderColor: active.length > 0 ? 'var(--red)' : 'var(--text-dim)',
          animation: active.length > 0 ? 'pulse-red 1.5s ease-in-out infinite' : 'none',
        }}>
          {active.length} ACTIVE
        </span>
      </div>

      <div className="panel__body">

        {/* Trigger controls */}
        <div>
          <div className="section-label" style={{ marginBottom: '6px' }}>INITIATE KILL CHAIN</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {drones.map(drone => (
              <button
                key={drone.id}
                onClick={() => onTriggerKillChain(drone.id)}
                style={{
                  background: drone.kill_chain_stage ? 'rgba(255,68,68,0.1)' : 'var(--bg-card)',
                  border: `1px solid ${drone.kill_chain_stage ? 'var(--red)' : 'var(--border)'}`,
                  color: drone.kill_chain_stage ? 'var(--red)' : 'var(--text-secondary)',
                  fontFamily: 'inherit', fontSize: '9px', letterSpacing: '0.08em',
                  padding: '4px 8px', cursor: 'pointer', borderRadius: '2px',
                  transition: 'all 0.15s',
                }}
              >
                {drone.id.replace('HUNTER-', 'H-')}
                {drone.kill_chain_stage && ` ◈ ${drone.kill_chain_stage}`}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '5px', letterSpacing: '0.06em' }}>
            Select any drone to initiate a new kill chain sequence
          </div>
        </div>

        <div className="divider" />

        {/* Empty state */}
        {killChains.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 20px', gap: '10px',
            color: 'var(--text-dim)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', opacity: 0.25 }}>◎</div>
            <div style={{ fontSize: '10px', letterSpacing: '0.15em' }}>NO KILL CHAINS ACTIVE</div>
            <div style={{ fontSize: '9px', opacity: 0.6 }}>Assign a drone above to initiate</div>
          </div>
        )}

        {/* Active chains */}
        {active.length > 0 && (
          <div>
            <div className="section-label" style={{ marginBottom: '6px', color: 'var(--red)', letterSpacing: '0.2em' }}>
              ● ACTIVE CHAINS
            </div>
            {active.map(chain => <KillChainCard key={chain.contact_id} chain={chain} />)}
          </div>
        )}

        {/* Archived chains */}
        {archived.length > 0 && (
          <div>
            <div className="section-label" style={{ marginBottom: '6px' }}>COMPLETED ARCHIVE</div>
            {archived.map(chain => <KillChainCard key={chain.contact_id} chain={chain} />)}
          </div>
        )}

      </div>
    </div>
  )
}
