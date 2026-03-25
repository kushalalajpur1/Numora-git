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

function ConfidenceBar({ value }) {
  const color = value >= 75 ? 'var(--green)' : value >= 50 ? 'var(--amber)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: '10px', color, fontWeight: 700, minWidth: '34px', textAlign: 'right' }}>
        {value}%
      </span>
    </div>
  )
}

function ContactCard({ contact, onEngage, onDismiss }) {
  const threatColor = THREAT_COLOR[contact.threat_level] || 'var(--green)'
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--amber)',
      borderRadius: '3px',
      padding: '10px',
      marginBottom: '6px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: '11px', letterSpacing: '0.1em' }}>
            {contact.contact_id}
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
            ▶ {contact.drone_id}
          </span>
        </div>
        <span style={{
          fontSize: '9px', padding: '2px 6px',
          border: `1px solid ${threatColor}`, color: threatColor,
          letterSpacing: '0.1em',
          animation: contact.threat_level === 'CRITICAL' ? 'pulse-red 1.2s ease-in-out infinite' : 'none',
        }}>
          {contact.threat_level}
        </span>
      </div>

      {/* Intel row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '2px' }}>
            POSITION
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            ({contact.x}, {contact.y})
          </div>
        </div>
        <div>
          <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '2px' }}>
            DETECTED
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            {contact.detected_at}
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: '4px' }}>
          AI CONFIDENCE SCORE
        </div>
        <ConfidenceBar value={contact.confidence} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => onEngage(contact.contact_id)}
          style={{
            flex: 1, padding: '5px', fontFamily: 'inherit', fontSize: '9px',
            letterSpacing: '0.12em', cursor: 'pointer', borderRadius: '2px',
            background: 'rgba(255,68,68,0.12)', border: '1px solid var(--red)',
            color: 'var(--red)', fontWeight: 700,
          }}
        >
          ◈ ENGAGE
        </button>
        <button
          onClick={() => onDismiss(contact.contact_id)}
          style={{
            flex: 1, padding: '5px', fontFamily: 'inherit', fontSize: '9px',
            letterSpacing: '0.12em', cursor: 'pointer', borderRadius: '2px',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-dim)',
          }}
        >
          ✕ DISMISS
        </button>
      </div>
    </div>
  )
}

function KillChainCard({ chain }) {
  const currentIdx  = STAGES.indexOf(chain.stage)
  const progress    = chain.active ? Math.round(((currentIdx + 1) / STAGES.length) * 100) : 100
  const threatColor = THREAT_COLOR[chain.threat_level] || 'var(--green)'

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${chain.active ? 'rgba(0,255,136,0.25)' : 'var(--border)'}`,
      borderRadius: '3px',
      padding: '10px',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '11px', letterSpacing: '0.1em' }}>
            {chain.contact_id}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>▶ {chain.drone_id}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{
            fontSize: '9px', padding: '2px 7px',
            border: `1px solid ${threatColor}`, color: threatColor, letterSpacing: '0.1em',
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

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2px', marginBottom: '6px' }}>
        {STAGES.map((stage, i) => {
          const isPast    = i < currentIdx || !chain.active
          const isCurrent = i === currentIdx && chain.active
          return (
            <React.Fragment key={stage}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '8px', letterSpacing: '0.04em', padding: '3px 4px',
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
                  color: (i < currentIdx || !chain.active) ? 'rgba(0,255,136,0.4)' : 'var(--border)',
                  fontSize: '9px', flexShrink: 0, paddingTop: '4px', paddingLeft: '1px', paddingRight: '1px',
                }}>▸</div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px', marginBottom: '6px' }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: chain.active ? 'var(--green)' : 'rgba(0,255,136,0.45)',
          borderRadius: '1px', transition: 'width 0.6s ease',
        }} />
      </div>

      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', letterSpacing: '0.04em', fontStyle: 'italic' }}>
        {chain.active ? STAGE_DESC[chain.stage] : 'Kill chain sequence complete.'}
      </div>
    </div>
  )
}

export default function KillChainPanel({ killChains, contacts = [], onTriggerKillChain, onDismissContact }) {
  const pending  = contacts.filter(c => c.status === 'PENDING')
  const active   = killChains.filter(c => c.active)
  const archived = killChains.filter(c => !c.active)

  const isEmpty = pending.length === 0 && killChains.length === 0

  return (
    <div className="panel">
      <div className="panel__header">
        <span className="panel__title" style={{ fontSize: '11px', letterSpacing: '0.2em' }}>
          KILL CHAIN CONSOLE
        </span>
        <span className="panel__badge" style={{
          color: pending.length > 0 ? 'var(--amber)' : active.length > 0 ? 'var(--red)' : 'var(--text-dim)',
          borderColor: pending.length > 0 ? 'var(--amber)' : active.length > 0 ? 'var(--red)' : 'var(--text-dim)',
          animation: (pending.length > 0 || active.length > 0) ? 'pulse-amber 1.5s ease-in-out infinite' : 'none',
        }}>
          {pending.length > 0 ? `${pending.length} PENDING` : `${active.length} ACTIVE`}
        </span>
      </div>

      <div className="panel__body">

        {/* Empty state */}
        {isEmpty && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 20px', gap: '10px',
            color: 'var(--text-dim)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', opacity: 0.25 }}>◎</div>
            <div style={{ fontSize: '10px', letterSpacing: '0.15em' }}>NO CONTACTS RELAYED</div>
            <div style={{ fontSize: '9px', opacity: 0.6 }}>Contacts detected by drones are stored onboard and relayed to you during the next surface window</div>
          </div>
        )}

        {/* Pending contacts awaiting operator decision */}
        {pending.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div className="section-label" style={{ color: 'var(--amber)', letterSpacing: '0.2em', animation: 'pulse-amber 1.5s ease-in-out infinite' }}>
                ⚠ CONTACTS AWAITING ASSESSMENT
              </div>
              <button
                onClick={() => pending.forEach(c => onDismissContact(c.contact_id))}
                style={{
                  background: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--text-dim)', fontFamily: 'inherit',
                  fontSize: '8px', letterSpacing: '0.1em',
                  padding: '2px 7px', cursor: 'pointer', borderRadius: '2px',
                }}
              >
                DISMISS ALL
              </button>
            </div>
            {pending.map(c => (
              <ContactCard
                key={c.contact_id}
                contact={c}
                onEngage={onTriggerKillChain}
                onDismiss={onDismissContact}
              />
            ))}
          </div>
        )}

        {(pending.length > 0 && (active.length > 0 || archived.length > 0)) && (
          <div className="divider" />
        )}

        {/* Active kill chains */}
        {active.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
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
