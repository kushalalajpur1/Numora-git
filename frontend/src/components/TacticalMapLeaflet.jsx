import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// ── Coordinate system ────────────────────────────────────────────────────────
const MS_LAT = 45.5
const MS_LNG = -30.0
const M_PER_UNIT = 100
const LAT_M = 111000
const LNG_M = LAT_M * Math.cos(MS_LAT * Math.PI / 180)

function toLatLng(x, y) {
  return [MS_LAT - (y * M_PER_UNIT) / LAT_M,
          MS_LNG + (x * M_PER_UNIT) / LNG_M]
}

function fromLatLng(lat, lng) {
  return {
    x:  (lng - MS_LNG) * LNG_M / M_PER_UNIT,
    y: -(lat - MS_LAT) * LAT_M / M_PER_UNIT,
  }
}

// ── Icon helpers ─────────────────────────────────────────────────────────────
const STATUS_HEX = {
  'IDLE':        '#5a8a6a',
  'TASKED':      '#ffb347',
  'EN ROUTE':    '#00aaff',
  'SURVEILLING': '#00ff88',
  'PATROLLING':  '#00aaff',
  'RECONNING':   '#ffb347',
  'SCANNING':    '#00ff88',
  'ON STATION':  '#00ff88',
  'RETURNING':   '#ffb347',
}

const STATUS_ICON_CHAR = {
  'IDLE': '○', 'TASKED': '◎', 'EN ROUTE': '▶',
  'SURVEILLING': '↻', 'PATROLLING': '⇌', 'RECONNING': '◈',
  'SCANNING': '▦', 'ON STATION': '◉', 'RETURNING': '◀',
}

function makeDroneIcon(status, isSelected) {
  const c = STATUS_HEX[status] || '#5a8a6a'
  const r = isSelected ? 9 : 6
  const sel = isSelected
    ? `<circle cx="18" cy="18" r="15" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.9"/>
       <circle cx="18" cy="18" r="18" fill="none" stroke="${c}" stroke-width="1" opacity="0.3"/>`
    : ''
  return L.divIcon({
    className: '',
    html: `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
      ${sel}
      <circle cx="18" cy="18" r="${r + 4}" fill="${c}22"/>
      <circle cx="18" cy="18" r="${r}" fill="${c}" opacity="0.9"/>
    </svg>`,
    iconSize: [36, 36], iconAnchor: [18, 18],
  })
}

function makeMothershipIcon(isMoving) {
  const pulse = isMoving
    ? `<circle cx="20" cy="20" r="18" fill="none" stroke="#00aaff" stroke-width="1" opacity="0.4" stroke-dasharray="3,3"/>`
    : ''
  return L.divIcon({
    className: '',
    html: `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      ${pulse}
      <circle cx="20" cy="20" r="15" fill="rgba(0,255,136,0.06)" stroke="#00ff88" stroke-width="1.5" stroke-dasharray="6,3"/>
      <circle cx="20" cy="20" r="9"  fill="rgba(0,255,136,0.12)" stroke="#00ff88" stroke-width="2"/>
      <circle cx="20" cy="20" r="3.5" fill="rgba(0,255,136,0.8)"/>
    </svg>`,
    iconSize: [40, 40], iconAnchor: [20, 20],
  })
}

function makeWaypointIcon() {
  return L.divIcon({
    className: '',
    html: `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="0"  x2="12" y2="24" stroke="#00aaff" stroke-width="1" opacity="0.6"/>
      <line x1="0"  y1="12" x2="24" y2="12" stroke="#00aaff" stroke-width="1" opacity="0.6"/>
      <circle cx="12" cy="12" r="4" fill="none" stroke="#00aaff" stroke-width="1.5" opacity="0.8"/>
    </svg>`,
    iconSize: [24, 24], iconAnchor: [12, 12],
  })
}

// ── CSS injection ─────────────────────────────────────────────────────────────
let cssInjected = false
function injectCSS() {
  if (cssInjected) return
  cssInjected = true
  const s = document.createElement('style')
  s.textContent = `
    .leaflet-container { background: #0a0e14; font-family: 'JetBrains Mono', monospace; }
    .leaflet-control-zoom {
      left: auto !important; right: 5px !important; top: auto !important; bottom: -30px !important;
    }
    .leaflet-control-zoom a {
      background: #0d1219 !important; color: #00ff88 !important;
      border-color: #1a2a1a !important; font-weight: bold;
    }
    .leaflet-control-zoom a:hover { background: #111820 !important; }
    .leaflet-control-attribution { display: none; }
    .numora-tip {
      background: rgba(13,18,25,0.95) !important;
      border: 1px solid #1a2a1a !important; color: #00ff88 !important;
      font-family: 'JetBrains Mono', monospace !important;
      font-size: 10px !important; letter-spacing: 0.1em;
      border-radius: 2px !important; padding: 3px 7px !important;
      box-shadow: none !important;
    }
    .numora-tip::before { display: none !important; }
  `
  document.head.appendChild(s)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TacticalMapLeaflet({
  drones, mothership,
  selectedDroneId, onSelectDrone, onSetTarget, onSetMothershipWaypoint,
}) {
  const containerRef          = useRef(null)
  const mapRef                = useRef(null)
  const markersRef            = useRef({})
  const msMarkerRef           = useRef(null)
  const msWaypointRef         = useRef(null)
  const msRouteLineRef        = useRef(null)

  // Stable refs so map event callbacks don't go stale
  const selectedRef           = useRef(selectedDroneId)
  const onSelectRef           = useRef(onSelectDrone)
  const onSetTargetRef        = useRef(onSetTarget)
  const onSetMsWaypointRef    = useRef(onSetMothershipWaypoint)
  const modeRef               = useRef('drone')

  const [mode, setMode]       = useState('drone')   // 'drone' | 'mothership'
  const [expanded, setExpanded] = useState(false)
  const [cursor, setCursor]   = useState(null)

  useEffect(() => { selectedRef.current        = selectedDroneId        }, [selectedDroneId])
  useEffect(() => { onSelectRef.current        = onSelectDrone           }, [onSelectDrone])
  useEffect(() => { onSetTargetRef.current     = onSetTarget             }, [onSetTarget])
  useEffect(() => { onSetMsWaypointRef.current = onSetMothershipWaypoint }, [onSetMothershipWaypoint])
  useEffect(() => { modeRef.current            = mode                    }, [mode])

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    injectCSS()
    if (mapRef.current || !containerRef.current) return

    const map = L.map(containerRef.current, {
      center: [MS_LAT, MS_LNG], zoom: 12,
      zoomControl: true, attributionControl: false,
      worldCopyJump: false,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, noWrap: true,
    }).addTo(map)

    // Mothership marker (starts at origin)
    const msMarker = L.marker([MS_LAT, MS_LNG], { icon: makeMothershipIcon(false), zIndexOffset: 1000 })
      .addTo(map)
    msMarker.bindTooltip('MS-01', { permanent: true, direction: 'top', className: 'numora-tip', offset: [0, -22] })
    msMarkerRef.current = msMarker

    // Map click handler
    map.on('click', (e) => {
      const { x, y } = fromLatLng(e.latlng.lat, e.latlng.lng)
      if (modeRef.current === 'mothership') {
        onSetMsWaypointRef.current(x, y)
      } else if (selectedRef.current) {
        onSetTargetRef.current(selectedRef.current, x, y)
      }
    })

    map.on('mousemove', (e) => setCursor(e.latlng))
    map.on('mouseout',  () => setCursor(null))

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = {}
      msMarkerRef.current = null
      msWaypointRef.current = null
      msRouteLineRef.current = null
    }
  }, [])

  // ── Update mothership marker + waypoint line ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !msMarkerRef.current || !mothership) return

    const [msLat, msLng] = toLatLng(mothership.x ?? 0, mothership.y ?? 0)
    const [tLat,  tLng]  = toLatLng(mothership.target_x ?? 0, mothership.target_y ?? 0)

    const isMoving = Math.hypot(
      (mothership.target_x ?? 0) - (mothership.x ?? 0),
      (mothership.target_y ?? 0) - (mothership.y ?? 0)
    ) > 0.5

    msMarkerRef.current.setLatLng([msLat, msLng])
    msMarkerRef.current.setIcon(makeMothershipIcon(isMoving))

    // Waypoint crosshair marker
    if (isMoving) {
      if (msWaypointRef.current) {
        msWaypointRef.current.setLatLng([tLat, tLng])
      } else {
        msWaypointRef.current = L.marker([tLat, tLng], { icon: makeWaypointIcon(), zIndexOffset: 900 })
          .addTo(map)
        msWaypointRef.current.bindTooltip('MS-01 WAYPOINT', { className: 'numora-tip', direction: 'top', offset: [0, -14] })
      }
      // Route line
      const pts = [[msLat, msLng], [tLat, tLng]]
      if (msRouteLineRef.current) {
        msRouteLineRef.current.setLatLngs(pts)
      } else {
        msRouteLineRef.current = L.polyline(pts, {
          color: '#00aaff', weight: 1, dashArray: '4 6', opacity: 0.5,
        }).addTo(map)
      }
    } else {
      msWaypointRef.current?.remove();  msWaypointRef.current  = null
      msRouteLineRef.current?.remove(); msRouteLineRef.current = null
    }
  }, [mothership])

  // ── Update drone markers ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const seen = new Set()
    drones.forEach(drone => {
      const [lat, lng] = toLatLng(drone.x, drone.y)
      const isSelected = drone.id === selectedDroneId
      seen.add(drone.id)

      if (markersRef.current[drone.id]) {
        markersRef.current[drone.id].setLatLng([lat, lng])
        markersRef.current[drone.id].setIcon(makeDroneIcon(drone.status, isSelected))
      } else {
        const marker = L.marker([lat, lng], { icon: makeDroneIcon(drone.status, isSelected) })
          .addTo(map)
          .on('click', (e) => {
            L.DomEvent.stopPropagation(e)
            if (modeRef.current === 'drone')
              onSelectRef.current(drone.id === selectedRef.current ? null : drone.id)
          })
        marker.bindTooltip(
          `${drone.id.replace('HUNTER-', 'H-')}  ${STATUS_ICON_CHAR[drone.status] || ''} ${drone.status}`,
          { className: 'numora-tip', direction: 'top', offset: [0, -18] }
        )
        markersRef.current[drone.id] = marker
      }
    })

    Object.keys(markersRef.current).forEach(id => {
      if (!seen.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id] }
    })
  }, [drones, selectedDroneId])

  // ── Cursor style ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.cursor = (mode === 'mothership' || selectedDroneId) ? 'crosshair' : ''
  }, [mode, selectedDroneId])

  useEffect(() => {
    setTimeout(() => mapRef.current?.invalidateSize(), 200)
  }, [expanded])

  // ── HUD text ─────────────────────────────────────────────────────────────
  const hudText = mode === 'mothership'
    ? 'MOTHERSHIP MODE — CLICK MAP TO SET WAYPOINT'
    : selectedDroneId
      ? `DRONE MODE — CLICK MAP TO MOVE ${selectedDroneId.replace('HUNTER-', 'H-')}`
      : 'DRONE MODE — CLICK MARKER TO SELECT'

  const hudColor = mode === 'mothership' ? 'rgba(0,170,255,0.8)' : selectedDroneId ? 'rgba(0,255,136,0.7)' : 'rgba(0,255,136,0.3)'

  const wrapStyle = expanded ? {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', flexDirection: 'column', background: '#0a0e14',
  } : {}

  const mapStyle = expanded ? { width: '100%', height: '100%' } : { width: '100%', height: '220px' }

  return (
    <div style={wrapStyle}>
      {expanded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #1a2a1a', background: '#0d1219', flexShrink: 0 }}>
          <span style={{ color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', letterSpacing: '0.2em' }}>
            ◈ TACTICAL OVERLAY — NORTH ATLANTIC
          </span>
          <span style={{ color: hudColor, fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>{hudText}</span>
          <button onClick={() => setExpanded(false)} style={btnStyle}>✕ CLOSE</button>
        </div>
      )}

      <div style={{ position: 'relative', overflow: 'hidden', width: '100%', ...(expanded ? { flex: 1 } : { height: '100%' }) }}>
        <div ref={containerRef} style={mapStyle} />

        {/* Mode toggle */}
        <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 1000, display: 'flex', gap: '4px' }}>
          <button
            onClick={() => { setMode('drone'); onSelectDrone(null) }}
            style={{ ...btnStyle, background: mode === 'drone' ? 'rgba(0,255,136,0.15)' : 'rgba(13,18,25,0.92)', borderColor: mode === 'drone' ? 'var(--green)' : 'rgba(0,255,136,0.2)' }}
          >
            ◎ DRONE
          </button>
          <button
            onClick={() => { setMode('mothership'); onSelectDrone(null) }}
            style={{ ...btnStyle, color: '#00aaff', background: mode === 'mothership' ? 'rgba(0,170,255,0.15)' : 'rgba(13,18,25,0.92)', borderColor: mode === 'mothership' ? '#00aaff' : 'rgba(0,170,255,0.2)' }}
          >
            ◈ MS-01
          </button>
        </div>

        {/* HUD */}
        <div style={{ position: 'absolute', bottom: 6, left: 8, zIndex: 1000, fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.1em', pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: hudColor, background: 'rgba(10,14,20,0.8)', padding: '2px 5px' }}>{hudText}</span>
          {cursor && (
            <span style={{ color: 'rgba(0,255,136,0.4)', background: 'rgba(10,14,20,0.8)', padding: '2px 5px' }}>
              {cursor.lat.toFixed(4)}°N  {Math.abs(cursor.lng).toFixed(4)}°W
            </span>
          )}
        </div>

        {!expanded && (
          <button onClick={() => setExpanded(true)} style={{ ...btnStyle, position: 'absolute', top: 6, right: 6, zIndex: 1000 }}>
            ⤢ EXPAND
          </button>
        )}
      </div>
    </div>
  )
}

const btnStyle = {
  background: 'rgba(13,18,25,0.92)',
  border: '1px solid rgba(0,255,136,0.4)',
  color: '#00ff88',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '10px', letterSpacing: '0.1em',
  padding: '4px 10px', cursor: 'pointer',
}
