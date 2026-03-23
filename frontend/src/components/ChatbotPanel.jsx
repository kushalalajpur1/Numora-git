import React, { useState, useRef, useEffect } from 'react'
import './ChatbotPanel.css'

const TASK_TYPES = ['SURVEILLANCE', 'PERIMETER PATROL', 'RECON', 'MINE DETECTION']
const DRONE_IDS = ['HUNTER-01', 'HUNTER-02', 'HUNTER-03', 'HUNTER-04', 'HUNTER-05']

export default function ChatbotPanel({
  mothership,
  drones,
  missionLog,
  pendingCommands,
  onQueueCommand,
  onSetMothershipWaypoint,
  onSetDroneTarget,
}) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I\'m your AI tactical advisor. I can help you manage the swarm and mothership. What would you like to do?' }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestedCommand, setSuggestedCommand] = useState(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const getSystemState = () => {
    const activeDrones = drones.filter(d => d.status !== 'IDLE')
    const avgBattery = (drones.reduce((sum, d) => sum + d.battery, 0) / drones.length).toFixed(1)
    return {
      mothership: {
        state: mothership.state,
        depth: mothership.depth.toFixed(1),
        battery: mothership.battery.toFixed(1),
        heading: mothership.heading,
        position: { x: mothership.x?.toFixed(1) || 0, y: mothership.y?.toFixed(1) || 0 },
      },
      fleet: {
        total_units: drones.length,
        active_units: activeDrones.length,
        avg_battery: avgBattery,
        drones: drones.map(d => ({
          id: d.id, status: d.status,
          battery: d.battery.toFixed(1),
          position: { x: d.x?.toFixed(1) || 0, y: d.y?.toFixed(1) || 0 },
        })),
      },
      recent_missions: missionLog.slice(0, 3).map(m => ({ type: m.type, status: m.status })),
      pending_commands: Object.entries(pendingCommands || {}).map(([id, task]) => ({ drone: id, task })),
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setInput('')

    const updatedMessages = [...messages, { role: 'user', content: userMessage }].slice(-50)
    setMessages(updatedMessages)
    setIsLoading(true)

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_state: getSystemState(),
          messages: updatedMessages,
        }),
      })

      const data = await response.json()

      if (data.error) throw new Error(data.error)

      const aiText = data.text || 'No response received'

      if (data.command) {
        setSuggestedCommand(data.command)
      }

      setMessages(prev => [...prev, { role: 'assistant', content: aiText }].slice(-50))
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠ COMMS ERROR — Backend unreachable or API key missing.`,
      }].slice(-50))
    } finally {
      setIsLoading(false)
    }
  }

  const handleApproveCommand = () => {
    if (!suggestedCommand) return

    if (suggestedCommand.type === 'queue_drone_command') {
      onQueueCommand(suggestedCommand.drone_id, {
        task_type: suggestedCommand.task_type,
        hold_duration: suggestedCommand.duration,
        target_x: suggestedCommand.target_x,
        target_y: suggestedCommand.target_y,
      })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✓ Command approved! ${suggestedCommand.drone_id} has been queued for ${suggestedCommand.task_type}.`
      }])
    } else if (suggestedCommand.type === 'set_mothership_waypoint') {
      onSetMothershipWaypoint(suggestedCommand.x, suggestedCommand.y)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✓ Waypoint set! Mothership is navigating to (${suggestedCommand.x}, ${suggestedCommand.y}).`
      }])
    }

    setSuggestedCommand(null)
  }

  const handleRejectCommand = () => {
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Command rejected. What would you like to do instead?'
    }])
    setSuggestedCommand(null)
  }

  return (
    <div className="chatbot-panel">
      <div className="chatbot-header">
        <div className="chatbot-title">◆ AI TACTICAL ADVISOR</div>
      </div>

      <div className="chatbot-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message chat-message--${msg.role}`}>
            <div className="chat-message__content">{msg.content}</div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-message chat-message--assistant">
            <div className="chat-message__content">
              <div className="chat-spinner">○ ◎ ◉</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {suggestedCommand && (
        <div className="chatbot-suggestion">
          <div className="suggestion-header">⚡ SUGGESTED COMMAND</div>
          <div className="suggestion-content">
            {suggestedCommand.type === 'queue_drone_command' && (
              <div>
                <strong>{suggestedCommand.drone_id}</strong> → {suggestedCommand.task_type} at ({suggestedCommand.target_x.toFixed(1)}, {suggestedCommand.target_y.toFixed(1)})
              </div>
            )}
            {suggestedCommand.type === 'set_mothership_waypoint' && (
              <div>
                <strong>Mothership</strong> → Navigate to ({suggestedCommand.x.toFixed(1)}, {suggestedCommand.y.toFixed(1)})
              </div>
            )}
          </div>
          <div className="suggestion-actions">
            <button className="suggestion-btn suggestion-btn--approve" onClick={handleApproveCommand}>
              ✓ APPROVE
            </button>
            <button className="suggestion-btn suggestion-btn--reject" onClick={handleRejectCommand}>
              ✗ REJECT
            </button>
          </div>
        </div>
      )}

      <div className="chatbot-input-area">
        <input
          type="text"
          className="chatbot-input"
          placeholder="Describe your mission objective or ask for status..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          disabled={isLoading}
        />
        <button
          className="chatbot-send"
          onClick={handleSendMessage}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '◎' : '▶'}
        </button>
      </div>
    </div>
  )
}
