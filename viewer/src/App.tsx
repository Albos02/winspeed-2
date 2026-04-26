import { useState, useRef, useEffect } from 'react'
import './App.css'

interface GpsPoint {
  time: number
  lat: number
  lon: number
  speed: number | null
  heading: number | null
  altitude: number | null
  accuracy: number | null
}

interface OrientationPoint {
  time: number
  alpha: number | null
  beta: number | null
  gamma: number | null
}

interface MotionPoint {
  time: number
  ax: number | null
  ay: number | null
  az: number | null
  agx: number | null
  agy: number | null
  agz: number | null
  rx: number | null
  ry: number | null
  rz: number | null
  tilt: number | null
}

interface SensorPoint {
  time: number
  x: number | null
  y: number | null
  z: number | null
}

interface BarometerPoint {
  time: number
  pressure: number | null
}

interface AmbientLightPoint {
  time: number
  illuminance: number | null
}

interface PolarEntry {
  maxSpeed: number
  tiltDirection: 'left' | 'right' | 'center'
  tiltAngle: number
}

interface SessionData {
  meta: {
    startTime: string | null
    endTime: string | null
    duration: number
    device: string
    platform: string
    screen: { width: number; height: number; orientation: string; pixelRatio: number }
    app: string
  }
  gps: GpsPoint[]
  orientation: OrientationPoint[]
  motion: MotionPoint[]
  sensors: {
    accelerometer: SensorPoint[]
    gyroscope: SensorPoint[]
    linearAcceleration: SensorPoint[]
    gravity: SensorPoint[]
    magnetometer: SensorPoint[]
    barometer: BarometerPoint[]
    ambientLight: AmbientLightPoint[]
  }
  polar: Record<string, PolarEntry>
  windDir: number | null
  stats: {
    gpsPoints: number
    orientationPoints: number
    motionPoints: number
    accelerometerPoints: number
    gyroscopePoints: number
    magnetometerPoints: number
    barometerPoints: number
    maxSpeed: number | null
    avgSpeed: number | null
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

function formatSpeed(mps: number | null): string {
  if (mps === null) return '---'
  return (mps * 1.94384).toFixed(1) // knots
}

function interpolateData<T extends { time: number }>(data: T[], time: number): T | null {
  if (data.length === 0) return null
  if (time <= data[0].time) return data[0]
  if (time >= data[data.length - 1].time) return data[data.length - 1]
  
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i].time <= time && data[i + 1].time >= time) {
      return data[i]
    }
  }
  return data[0]
}

export default function App() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'track' | 'graphs' | 'polar'>('overview')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as SessionData
        setSessionData(data)
        setCurrentTime(0)
        setIsPlaying(false)
      } catch (err) {
        alert('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const startTime = sessionData?.meta?.startTime ? new Date(sessionData.meta.startTime).getTime() : 0
  const endTime = sessionData?.meta?.endTime ? new Date(sessionData.meta.endTime).getTime() : startTime
  const totalDuration = endTime - startTime

  const currentGps = sessionData?.gps ? interpolateData(sessionData.gps, startTime + currentTime) : null
  const currentMotion = sessionData?.motion ? interpolateData(sessionData.motion, startTime + currentTime) : null

  useEffect(() => {
    if (!isPlaying || !sessionData) return

    lastTimeRef.current = performance.now()
    
    const animate = (timestamp: number) => {
      const delta = (timestamp - lastTimeRef.current) / 1000
      lastTimeRef.current = timestamp
      
      setCurrentTime(prev => {
        const next = prev + delta * playbackSpeed * 1000
        if (next >= totalDuration) {
          setIsPlaying(false)
          return totalDuration
        }
        return next
      })
      
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, playbackSpeed, sessionData, totalDuration])

  useEffect(() => {
    if (!sessionData || selectedTab !== 'track' || !canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gps = sessionData.gps
    if (gps.length === 0) return

    const padding = 40
    const width = canvas.width - padding * 2
    const height = canvas.height - padding * 2

    const lats = gps.map(p => p.lat)
    const lons = gps.map(p => p.lon)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)

    const scale = Math.min(width / (maxLon - minLat || 1), height / (maxLat - minLat || 1))
    const centerX = width / 2
    const centerY = height / 2

    const project = (lat: number, lon: number) => ({
      x: padding + centerX + (lon - (minLon + maxLon) / 2) * scale * 111320 * Math.cos(lat * Math.PI / 180),
      y: padding + centerY - (lat - (minLat + maxLat) / 2) * scale * 111320
    })

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#888'
    ctx.lineWidth = 1
    ctx.strokeRect(padding, padding, width, height)

    ctx.beginPath()
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    let first = true
    for (const point of gps) {
      const pos = project(point.lat, point.lon)
      if (first) {
        ctx.moveTo(pos.x, pos.y)
        first = false
      } else {
        ctx.lineTo(pos.x, pos.y)
      }
    }
    ctx.stroke()

    if (gps.length > 0) {
      const firstPos = project(gps[0].lat, gps[0].lon)
      ctx.fillStyle = '#22c55e'
      ctx.beginPath()
      ctx.arc(firstPos.x, firstPos.y, 6, 0, Math.PI * 2)
      ctx.fill()
    }

    if (currentGps) {
      const pos = project(currentGps.lat, currentGps.lon)
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [sessionData, currentTime, selectedTab, currentGps])

  if (!sessionData) {
    return (
      <div className="upload-screen">
        <h1>WinSpeed Session Replay</h1>
        <div className="upload-box">
          <p>Upload a session JSON file to replay</p>
          <input
            type="file"
            accept=".json"
            onChange={handleFileLoad}
            ref={fileInputRef}
            className="file-input"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Session Replay</h1>
        <button onClick={() => {
          setSessionData(null)
          setCurrentTime(0)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}>Load New File</button>
      </header>

      <div className="meta-info">
        <span>{sessionData.meta.startTime ? new Date(sessionData.meta.startTime).toLocaleString() : 'Unknown'}</span>
        <span>{formatDuration(sessionData.meta.duration)}</span>
        <span>{sessionData.stats.gpsPoints} GPS points</span>
      </div>

      <div className="current-data">
        <div className="data-card">
          <span className="label">Speed</span>
          <span className="value">{formatSpeed(currentGps?.speed ?? null)}</span>
          <span className="unit">kts</span>
        </div>
        <div className="data-card">
          <span className="label">Heading</span>
          <span className="value">{currentGps?.heading?.toFixed(0) ?? '---'}</span>
          <span className="unit">°</span>
        </div>
        <div className="data-card">
          <span className="label">Tilt</span>
          <span className="value">{currentMotion?.tilt?.toFixed(0) ?? '---'}</span>
          <span className="unit">°</span>
        </div>
        <div className="data-card">
          <span className="label">Wind</span>
          <span className="value">{sessionData.windDir ?? '---'}</span>
          <span className="unit">°</span>
        </div>
      </div>

      <div className="tabs">
        <button className={selectedTab === 'overview' ? 'active' : ''} onClick={() => setSelectedTab('overview')}>Overview</button>
        <button className={selectedTab === 'track' ? 'active' : ''} onClick={() => setSelectedTab('track')}>Track</button>
        <button className={selectedTab === 'graphs' ? 'active' : ''} onClick={() => setSelectedTab('graphs')}>Graphs</button>
        <button className={selectedTab === 'polar' ? 'active' : ''} onClick={() => setSelectedTab('polar')}>Polar</button>
      </div>

      <div className="content">
        {selectedTab === 'overview' && (
          <div className="overview">
            <div className="stat-grid">
              <div className="stat">
                <span className="stat-label">Max Speed</span>
                <span className="stat-value">{formatSpeed(sessionData.stats.maxSpeed)} kts</span>
              </div>
              <div className="stat">
                <span className="stat-label">Avg Speed</span>
                <span className="stat-value">{formatSpeed(sessionData.stats.avgSpeed)} kts</span>
              </div>
              <div className="stat">
                <span className="stat-label">GPS Points</span>
                <span className="stat-value">{sessionData.stats.gpsPoints.toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Motion Points</span>
                <span className="stat-value">{sessionData.stats.motionPoints.toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Wind Direction</span>
                <span className="stat-value">{sessionData.windDir ?? '---'}°</span>
              </div>
              <div className="stat">
                <span className="stat-label">Polar Entries</span>
                <span className="stat-value">{Object.keys(sessionData.polar).length}</span>
              </div>
            </div>
            <div className="sensor-stats">
              <h3>Sensor Data</h3>
              <div className="sensor-grid">
                <div>Orientation: {sessionData.stats.orientationPoints.toLocaleString()}</div>
                <div>Accelerometer: {sessionData.sensors.accelerometer.length.toLocaleString()}</div>
                <div>Gyroscope: {sessionData.sensors.gyroscope.length.toLocaleString()}</div>
                <div>Magnetometer: {sessionData.sensors.magnetometer.length.toLocaleString()}</div>
                <div>Barometer: {sessionData.sensors.barometer.length.toLocaleString()}</div>
                <div>Ambient Light: {sessionData.sensors.ambientLight.length.toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'track' && (
          <div className="track-view">
            <canvas ref={canvasRef} width={600} height={400} className="track-canvas" />
            <div className="track-info">
              Lat: {currentGps?.lat?.toFixed(5) ?? '---'}, Lon: {currentGps?.lon?.toFixed(5) ?? '---'}
            </div>
          </div>
        )}

        {selectedTab === 'graphs' && (
          <div className="graphs">
            <div className="graph-section">
              <h3>Speed over Time</h3>
              <div className="graph">
                {sessionData.gps.map((p, i) => {
                  const x = (i / sessionData.gps.length) * 100
                  const y = 100 - ((p.speed ?? 0) / (sessionData.stats.maxSpeed ?? 10)) * 100
                  const isCurrent = i === sessionData.gps.findIndex(g => g.time >= startTime + currentTime)
                  return (
                    <div
                      key={i}
                      className={`graph-point ${isCurrent ? 'current' : ''}`}
                      style={{ left: `${x}%`, bottom: `${y}%` }}
                      title={`${formatTime(p.time)}: ${formatSpeed(p.speed)} kts`}
                    />
                  )
                })}
              </div>
            </div>
            <div className="graph-section">
              <h3>Heading over Time</h3>
              <div className="graph">
                {sessionData.gps.map((p, i) => {
                  const x = (i / sessionData.gps.length) * 100
                  const y = 100 - ((p.heading ?? 0) / 360) * 100
                  const isCurrent = i === sessionData.gps.findIndex(g => g.time >= startTime + currentTime)
                  return (
                    <div
                      key={i}
                      className={`graph-point heading ${isCurrent ? 'current' : ''}`}
                      style={{ left: `${x}%`, bottom: `${y}%` }}
                      title={`${formatTime(p.time)}: ${p.heading?.toFixed(0)}°`}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'polar' && (
          <div className="polar-view">
            <svg viewBox="0 0 300 300" className="polar-svg">
              <circle cx={150} cy={150} r={130} fill="none" stroke="#ccc" />
              {[0, 90, 180, 270].map(deg => (
                <line key={deg} x1={150} y1={150} x2={150 + 130 * Math.cos((deg - 90) * Math.PI / 180)} y2={150 + 130 * Math.sin((deg - 90) * Math.PI / 180)} stroke="#ccc" />
              ))}
              {Object.entries(sessionData.polar).map(([heading, entry]) => {
                const angle = (parseInt(heading) - 90) * Math.PI / 180
                const maxSpeed = Math.max(...Object.values(sessionData.polar).map(e => e.maxSpeed))
                const r = (entry.maxSpeed / maxSpeed) * 130
                const color = entry.tiltDirection === 'left' ? '#ef4444' : entry.tiltDirection === 'right' ? '#3b82f6' : '#22c55e'
                return (
                  <circle
                    key={heading}
                    cx={150 + r * Math.cos(angle)}
                    cy={150 + r * Math.sin(angle)}
                    r={6}
                    fill={color}
                  />
                )
              })}
            </svg>
            <div className="polar-legend">
              <span className="red">← Left</span>
              <span className="green">Center</span>
              <span className="blue">Right →</span>
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <button onClick={() => setIsPlaying(!isPlaying)} className="play-btn">
          {isPlaying ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={totalDuration}
          value={currentTime}
          onChange={(e) => setCurrentTime(Number(e.target.value))}
          className="timeline"
        />
        <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))} className="speed-select">
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
        </select>
        <span className="time-display">
          {formatTime(startTime + currentTime)} / {formatTime(endTime)}
        </span>
      </div>
    </div>
  )
}