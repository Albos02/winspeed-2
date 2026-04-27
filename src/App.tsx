import { useState, useEffect, useRef } from 'react'
import './index.css'

// DEBUG
const DEBUG = true

type Theme = 'light' | 'dark'
type Layout = '2s' | '4q' | '4s' | '6q' | '6s'
type FontSize = -5 | -2 | -1 | 0 | 1 | 2 | 5
type Unit = 'knots' | 'kph' | 'mph'
type TiltDirection = 'left' | 'right' | 'center'

interface PolarEntry {
  maxSpeed: number
  tiltDirection: TiltDirection
  tiltAngle: number
}

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

interface SavedSession {
  id: string
  startTime: number
  endTime: number
  duration: number
  maxSpeed: number | null
  avgSpeed: number | null
  gpsPointsCount: number
  windDirection: number | null
  polarEntriesCount: number
  data?: {
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
    polar: Record<number, PolarEntry>
  }
}

function normalizeHeading(h: number): number {
  h = h % 360
  if (h < 0) h += 360
  return Math.round(h)
}

function calculateWindDirection(polar: Map<number, PolarEntry>): number | null {
  if (polar.size < 10) return null

  const headings = Array.from(polar.keys())
  const bestAxis: { wind: number; score: number } = { wind: 0, score: 0 }

  for (const h1 of headings) {
    const entry1 = polar.get(h1)
    if (!entry1 || entry1.tiltDirection === 'center') continue

    const opposite1 = (h1 + 180) % 360
    const entry2 = polar.get(opposite1)
    if (!entry2 || entry2.tiltDirection === 'center') continue

    const speedDiff = Math.abs(entry1.maxSpeed - entry2.maxSpeed)
    const tiltOpposite = (entry1.tiltDirection === 'left' && entry2.tiltDirection === 'right') ||
                        (entry1.tiltDirection === 'right' && entry2.tiltDirection === 'left')

    if (!tiltOpposite) continue

    let score = 0
    score += Math.max(0, 50 - speedDiff * 5) // High penalty for speed difference
    score += Math.min(20, (entry1.maxSpeed + entry2.maxSpeed) * 2) // Cap speed contribution

    if (score > bestAxis.score) {
      // If h1 is right tilt, wind is h1 - 90. If left, h1 + 90.
      bestAxis.wind = normalizeHeading(entry1.tiltDirection === 'right' ? h1 - 90 : h1 + 90)
      bestAxis.score = score
    }
  }

  return bestAxis.score > 30 ? bestAxis.wind : null
}

function calculateVmg(speed: number, heading: number, windDirection: number): number {
  const angle = Math.abs(heading - windDirection)
  const twa = Math.min(angle, 360 - angle)
  return speed * Math.cos(twa * Math.PI / 180)
}

function calculateTiltFromGps(headingHistory: { heading: number; time: number }[]): number | null {
  if (headingHistory.length < 3) return null
  const recent = headingHistory.slice(-5)
  if (recent.length < 2) return null
  
  const timeDiff = (recent[recent.length - 1].time - recent[0].time) / 1000
  if (timeDiff < 0.5) return null

  let totalRotation = 0
  for (let i = 1; i < recent.length; i++) {
    let diff = recent[i].heading - recent[i - 1].heading
    if (diff > 180) diff -= 360
    else if (diff < -180) diff += 360
    totalRotation += diff
  }

  const rate = totalRotation / timeDiff
  return Math.max(-45, Math.min(45, rate * 30))
}

function formatGpx(points: GpsPoint[]): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="winspeed-2"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>winspeed-{points.length > 0 ? new Date(points[0].time).toISOString() : 'session'}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Sailing Session</name>
    <trkseg>
`
  const trackPoints = points.map(p => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">
        <ele>${p.altitude?.toFixed(1) ?? '0'}</ele>
        <time>${new Date(p.time).toISOString()}</time>
        <extensions>
          <speed>${p.speed ?? 0}</speed>
          <heading>${p.heading ?? 0}</heading>
          <accuracy>${p.accuracy ?? 0}</accuracy>
        </extensions>
      </trkpt>`).join('\n')
  const footer = `    </trkseg>
  </trk>
</gpx>`
  return header + trackPoints + '\n' + footer
}

const SESSIONS_KEY = 'winspeed-sessions'

function loadSessions(): SavedSession[] {
  try {
    const stored = localStorage.getItem(SESSIONS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveSession(
  sessionData: {
    startTime: number
    gpsPoints: GpsPoint[]
    orientationPoints: OrientationPoint[]
    motionPoints: MotionPoint[]
    accelerometerPoints: SensorPoint[]
    gyroscopePoints: SensorPoint[]
    linearAccelPoints: SensorPoint[]
    gravityPoints: SensorPoint[]
    magnetometerPoints: SensorPoint[]
    barometerPoints: BarometerPoint[]
    ambientLightPoints: AmbientLightPoint[]
    polarEntries: Map<number, PolarEntry>
    windDirection: number | null
  },
  includeData: boolean = false
) {
  const endTime = Date.now()
  const duration = Math.round((endTime - sessionData.startTime) / 1000)
  const maxSpeed = sessionData.gpsPoints.length > 0 
    ? Math.max(...sessionData.gpsPoints.map((p: GpsPoint) => p.speed ?? 0)) 
    : null
  const avgSpeed = sessionData.gpsPoints.length > 0 
    ? sessionData.gpsPoints.reduce((a: number, p: GpsPoint) => a + (p.speed ?? 0), 0) / sessionData.gpsPoints.length 
    : null

  const session: SavedSession = {
    id: `${sessionData.startTime}`,
    startTime: sessionData.startTime,
    endTime,
    duration,
    maxSpeed,
    avgSpeed,
    gpsPointsCount: sessionData.gpsPoints.length,
    windDirection: sessionData.windDirection,
    polarEntriesCount: sessionData.polarEntries.size,
  }

  if (includeData) {
    session.data = {
      gps: sessionData.gpsPoints,
      orientation: sessionData.orientationPoints,
      motion: sessionData.motionPoints,
      sensors: {
        accelerometer: sessionData.accelerometerPoints,
        gyroscope: sessionData.gyroscopePoints,
        linearAcceleration: sessionData.linearAccelPoints,
        gravity: sessionData.gravityPoints,
        magnetometer: sessionData.magnetometerPoints,
        barometer: sessionData.barometerPoints,
        ambientLight: sessionData.ambientLightPoints,
      },
      polar: Object.fromEntries(sessionData.polarEntries.entries()),
    }
  }

  const sessions = loadSessions()
  sessions.unshift(session)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

function deleteSession(id: string) {
  const sessions = loadSessions().filter(s => s.id !== id)
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

function downloadGpx(points: GpsPoint[]) {
  const gpx = formatGpx(points)
  const blob = new Blob([gpx], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `winspeed-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.gpx`
  a.click()
  URL.revokeObjectURL(url)
}

function downloadJson(
  startTime: number,
  gpsPoints: GpsPoint[],
  orientationPoints: OrientationPoint[],
  motionPoints: MotionPoint[],
  accelerometerPoints: SensorPoint[],
  gyroscopePoints: SensorPoint[],
  linearAccelPoints: SensorPoint[],
  gravityPoints: SensorPoint[],
  magnetometerPoints: SensorPoint[],
  barometerPoints: BarometerPoint[],
  ambientLightPoints: AmbientLightPoint[],
  polarEntries: Map<number, PolarEntry>,
  wDir: number | null
) {
  const data = {
    meta: {
      startTime: startTime > 0 ? new Date(startTime).toISOString() : null,
      endTime: new Date().toISOString(),
      duration: startTime > 0 ? Math.round((Date.now() - startTime) / 1000) : 0,
      device: navigator.userAgent,
      platform: navigator.platform,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        orientation: window.screen.orientation?.type || 'unknown',
        pixelRatio: window.devicePixelRatio
      },
      app: 'winspeed-2'
    },
    gps: gpsPoints,
    orientation: orientationPoints,
    motion: motionPoints,
    sensors: {
      accelerometer: accelerometerPoints,
      gyroscope: gyroscopePoints,
      linearAcceleration: linearAccelPoints,
      gravity: gravityPoints,
      magnetometer: magnetometerPoints,
      barometer: barometerPoints,
      ambientLight: ambientLightPoints
    },
    polar: Object.fromEntries(polarEntries.entries()),
    windDir: wDir,
    stats: {
      gpsPoints: gpsPoints.length,
      orientationPoints: orientationPoints.length,
      motionPoints: motionPoints.length,
      accelerometerPoints: accelerometerPoints.length,
      gyroscopePoints: gyroscopePoints.length,
      magnetometerPoints: magnetometerPoints.length,
      barometerPoints: barometerPoints.length,
      maxSpeed: gpsPoints.length > 0 ? Math.max(...gpsPoints.map((p: GpsPoint) => p.speed ?? 0)) : null,
      avgSpeed: gpsPoints.length > 0 ? gpsPoints.reduce((a: number, p: GpsPoint) => a + (p.speed ?? 0), 0) / gpsPoints.length : null
    }
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `winspeed-data-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

type Page = 'settings' | 'recording' | 'sessions'

function SessionsView({ 
  sessions, 
  unit, 
  onBack, 
  onDelete 
}: { 
  sessions: SavedSession[]
  unit: Unit
  onBack: () => void
  onDelete: (id: string) => void
}) {
  const convertSpeed = (speedInMps: number) => {
    switch (unit) {
      case 'knots': return speedInMps * 1.94384
      case 'kph': return speedInMps * 3.6
      case 'mph': return speedInMps * 2.23694
      default: return speedInMps * 1.94384
    }
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const downloadSessionGpx = (session: SavedSession) => {
    if (!session.data?.gps) return
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="winspeed-2"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>winspeed-session-${session.id}</name>
    <time>${new Date(session.startTime).toISOString()}</time>
  </metadata>
  <trk>
    <name>Sailing Session</name>
    <trkseg>
`
    const trackPoints = session.data.gps.map(p => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">
        <ele>${p.altitude?.toFixed(1) ?? '0'}</ele>
        <time>${new Date(p.time).toISOString()}</time>
        <extensions>
          <speed>${p.speed ?? 0}</speed>
          <heading>${p.heading ?? 0}</heading>
          <accuracy>${p.accuracy ?? 0}</accuracy>
        </extensions>
      </trkpt>`).join('\n')
    const footer = `    </trkseg>
  </trk>
</gpx>`
    const gpx = header + trackPoints + '\n' + footer
    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `winspeed-${session.id}.gpx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadSessionJson = (session: SavedSession) => {
    if (!session.data) return
    const data = {
      meta: {
        startTime: new Date(session.startTime).toISOString(),
        endTime: new Date(session.endTime).toISOString(),
        duration: session.duration,
        device: navigator.userAgent,
        platform: navigator.platform,
        app: 'winspeed-2'
      },
      gps: session.data.gps,
      orientation: session.data.orientation,
      motion: session.data.motion,
      sensors: session.data.sensors,
      polar: session.data.polar,
      windDir: session.windDirection,
      stats: {
        gpsPoints: session.gpsPointsCount,
        maxSpeed: session.maxSpeed,
        avgSpeed: session.avgSpeed
      }
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `winspeed-data-${session.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shareSession = async (session: SavedSession) => {
    const text = `Sailing Session ${formatDate(session.startTime)}
Duration: ${formatDuration(session.duration)}
Max Speed: ${session.maxSpeed !== null ? convertSpeed(session.maxSpeed).toFixed(1) + ' ' + unit : 'N/A'}
Avg Speed: ${session.avgSpeed !== null ? convertSpeed(session.avgSpeed).toFixed(1) + ' ' + unit : 'N/A'}
GPS Points: ${session.gpsPointsCount}
Wind: ${session.windDirection !== null ? session.windDirection + '°' : 'N/A'}`

    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.error('Share failed:', e)
        }
      }
    } else {
      await navigator.clipboard.writeText(text)
      alert('Session info copied to clipboard!')
    }
  }

  return (
    <div className="flex flex-col h-screen p-4 gap-4">
      <div className="flex items-center justify-between">
        <button className="p-2 border-2 border-current rounded" onClick={onBack}>
          Back
        </button>
        <h1 className="text-2xl font-bold">Sessions</h1>
        <div className="w-16" />
      </div>

      {sessions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-lg text-gray-500">
          No saved sessions
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col gap-3">
          {sessions.map(session => (
            <div key={session.id} className="border-2 border-current p-3 rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-bold">{formatDate(session.startTime)}</div>
                  <div className="text-sm opacity-70">{formatDuration(session.duration)}</div>
                </div>
                <button 
                  className="text-red-500 text-sm p-1"
                  onClick={() => {
                    if (confirm('Delete this session?')) {
                      onDelete(session.id)
                    }
                  }}
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div>Max: {session.maxSpeed !== null ? convertSpeed(session.maxSpeed).toFixed(1) + ' ' + unit : 'N/A'}</div>
                <div>Avg: {session.avgSpeed !== null ? convertSpeed(session.avgSpeed).toFixed(1) + ' ' + unit : 'N/A'}</div>
                <div>GPS: {session.gpsPointsCount} pts</div>
                <div>Wind: {session.windDirection !== null ? session.windDirection + '°' : 'N/A'}</div>
              </div>

              <div className="flex gap-2">
                {session.data && (
                  <>
                    <button 
                      className="flex-1 py-2 border border-current rounded text-sm"
                      onClick={() => downloadSessionGpx(session)}
                    >
                      GPX
                    </button>
                    <button 
                      className="flex-1 py-2 border border-current rounded text-sm"
                      onClick={() => downloadSessionJson(session)}
                    >
                      Data
                    </button>
                  </>
                )}
                <button 
                  className="flex-1 py-2 border border-current rounded text-sm"
                  onClick={() => shareSession(session)}
                >
                  Share
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('light')
  const [layout, setLayout] = useState<Layout>('2s')
  const [fontSize, setFontSize] = useState<FontSize>(0)
  const [recording, setRecording] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [page, setPage] = useState<Page>('settings')
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadSessions())
  const [rawGpsData, setRawGpsData] = useState<{ speed: number | null; heading: number | null; accuracy: number | null }>({ speed: null, heading: null, accuracy: null })
  const [rawOrientationData, setRawOrientationData] = useState<{ alpha: number | null; beta: number | null; gamma: number | null }>({ alpha: null, beta: null, gamma: null })
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null)
  const [currentHeading, setCurrentHeading] = useState<number | null>(null)
  const currentTiltRef = useRef<number>(0)
  const headingHistoryRef = useRef<{ heading: number; time: number }[]>([])
  const [windDirection, setWindDirection] = useState<number | null>(null)
  const [unit, setUnit] = useState<Unit>('knots')
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null)
  const polarRef = useRef<Map<number, PolarEntry>>(new Map())
  const gpsPointsRef = useRef<GpsPoint[]>([])
  const orientationRef = useRef<OrientationPoint[]>([])
  const motionRef = useRef<MotionPoint[]>([])
  const accelerometerRef = useRef<SensorPoint[]>([])
  const gyroscopeRef = useRef<SensorPoint[]>([])
  const linearAccelRef = useRef<SensorPoint[]>([])
  const gravityRef = useRef<SensorPoint[]>([])
  const magnetometerRef = useRef<SensorPoint[]>([])
  const barometerRef = useRef<BarometerPoint[]>([])
  const ambientLightRef = useRef<AmbientLightPoint[]>([])
  const recordingRef = useRef(false)
  const startTimeRef = useRef<number>(0)

  const convertSpeed = (speedInMps: number, targetUnit: Unit) => {
    switch (targetUnit) {
      case 'knots':
        return speedInMps * 1.94384
      case 'kph':
        return speedInMps * 3.6
      case 'mph':
        return speedInMps * 2.23694
      default:
        return speedInMps * 1.94384 // Default to knots
    }
  }

  const handleStart = async () => {
    const reqPerm = (DeviceOrientationEvent as any).requestPermission
    if (reqPerm) {
      try {
        const permission = await reqPerm()
        if (permission !== 'granted') {
          alert("Orientation permission required for wind calculation")
          return
        }
      } catch (err) {
        console.error(err)
        return
      }
    }

    const motionPerm = (DeviceMotionEvent as any).requestPermission
    if (motionPerm) {
      try {
        await motionPerm()
      } catch (err) {
        console.error("Motion permission error:", err)
      }
    }

    try {
      const permResult = await navigator.permissions?.query({ name: 'accelerometer' as PermissionName })
      console.log("Accelerometer permission:", permResult?.state)
    } catch (err) {
      console.error("Permission query error:", err)
    }

    startGenericSensors()
    setRecording(true)
    recordingRef.current = true
    startTimeRef.current = Date.now()
    setPage('recording')
  }

  const startGenericSensors = async () => {
    const freq = { frequency: 60 }

    try {
      const accel = new (window as any).Accelerometer(freq)
      accel.addEventListener('reading', () => {
        if (recordingRef.current) {
          accelerometerRef.current.push({ time: Date.now(), x: accel.x, y: accel.y, z: accel.z })
        }
      })
      accel.start()
    } catch (e) { console.error("Accelerometer not available:", e) }

    try {
      const gyro = new (window as any).Gyroscope(freq)
      gyro.addEventListener('reading', () => {
        if (recordingRef.current) {
          gyroscopeRef.current.push({ time: Date.now(), x: gyro.x, y: gyro.y, z: gyro.z })
        }
      })
      gyro.start()
    } catch (e) { console.error("Gyroscope not available:", e) }

    try {
      const linAccel = new (window as any).LinearAccelerationSensor(freq)
      linAccel.addEventListener('reading', () => {
        if (recordingRef.current) {
          linearAccelRef.current.push({ time: Date.now(), x: linAccel.x, y: linAccel.y, z: linAccel.z })
        }
      })
      linAccel.start()
    } catch (e) { console.error("LinearAcceleration not available:", e) }

    try {
      const grav = new (window as any).GravitySensor(freq)
      grav.addEventListener('reading', () => {
        if (recordingRef.current) {
          gravityRef.current.push({ time: Date.now(), x: grav.x, y: grav.y, z: grav.z })
        }
      })
      grav.start()
    } catch (e) { console.error("Gravity not available:", e) }

    try {
      const mag = new (window as any).Magnetometer(freq)
      mag.addEventListener('reading', () => {
        if (recordingRef.current) {
          magnetometerRef.current.push({ time: Date.now(), x: mag.x, y: mag.y, z: mag.z })
        }
      })
      mag.start()
    } catch (e) { console.error("Magnetometer not available:", e) }

    try {
      const baro = new (window as any).BarometricSensor({ frequency: 10 })
      baro.addEventListener('reading', () => {
        if (recordingRef.current) {
          barometerRef.current.push({ time: Date.now(), pressure: baro.pressure })
        }
      })
      baro.start()
    } catch (e) { console.error("BarometricSensor not available:", e) }

    try {
      const light = new (window as any).AmbientLightSensor({ frequency: 10 })
      light.addEventListener('reading', () => {
        if (recordingRef.current) {
          ambientLightRef.current.push({ time: Date.now(), illuminance: light.illuminance })
        }
      })
      light.start()
    } catch (e) { console.error("AmbientLightSensor not available:", e) }
  }

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('theme-dark')
    else document.documentElement.classList.remove('theme-dark')
  }, [theme])

  useEffect(() => {
    if (page === 'sessions') {
      setSessions(loadSessions())
    }
  }, [page])

  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("Geolocation is not supported by your browser")
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now()
        const newHeading = position.coords.heading
        if (newHeading !== null) {
          if (currentHeading !== null && recordingRef.current) {
            headingHistoryRef.current.push({ heading: newHeading, time: now })
            const cutoff = now - 5000
            headingHistoryRef.current = headingHistoryRef.current.filter(h => h.time > cutoff)
          }
        }
        setCurrentSpeed(position.coords.speed)
        setCurrentHeading(newHeading)
        if (recordingRef.current && position.coords.latitude && position.coords.longitude) {
          gpsPointsRef.current.push({
            time: now,
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            speed: position.coords.speed,
            heading: newHeading,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy
          })
        }
        setRawGpsData({
          speed: position.coords.speed,
          heading: newHeading,
          accuracy: position.coords.accuracy
        })
      },
      (error) => {
        console.error("Error getting geolocation:", error)
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        setWakeLock(sentinel)
        sentinel.onrelease = () => {
          setWakeLock(null)
        }
      } catch (err: any) {
        console.error(`${err.name}, ${err.message}`)
      }
    }

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }

    if (recording) {
      polarRef.current = new Map()
      setWindDirection(null)
      requestWakeLock()
      document.addEventListener('visibilitychange', handleVisibilityChange)
    } else if (wakeLock) {
      wakeLock.release()
    }

    return () => {
      if (wakeLock) {
        wakeLock.release()
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [recording, wakeLock])

  useEffect(() => {
    if (!recording) return

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const now = Date.now()
      currentTiltRef.current = e.gamma ?? 0
      setRawOrientationData({
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma
      })
      if (recordingRef.current) {
        orientationRef.current.push({
          time: now,
          alpha: e.alpha,
          beta: e.beta,
          gamma: e.gamma
        })
      }
    }

    const handleMotion = (e: DeviceMotionEvent) => {
      const now = Date.now()
      const acc = e.acceleration
      const accGrav = e.accelerationIncludingGravity
      const rot = e.rotationRate
      if (recordingRef.current) {
        let gpsTilt: number | null = null
        if (Math.abs(currentTiltRef.current) < 1) {
          gpsTilt = calculateTiltFromGps(headingHistoryRef.current)
        }
        motionRef.current.push({
          time: now,
          ax: acc?.x ?? null,
          ay: acc?.y ?? null,
          az: acc?.z ?? null,
          agx: accGrav?.x ?? null,
          agy: accGrav?.y ?? null,
          agz: accGrav?.z ?? null,
          rx: rot?.alpha ?? null,
          ry: rot?.beta ?? null,
          rz: rot?.gamma ?? null,
          tilt: gpsTilt ?? currentTiltRef.current
        })
      }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    window.addEventListener('devicemotion', handleMotion)
    
    // Periodic calculation and recording
    const interval = setInterval(() => {
      if (currentSpeed === null || currentHeading === null || currentSpeed < 1) return

      const heading = normalizeHeading(currentHeading)
      let tilt = currentTiltRef.current
      if (Math.abs(tilt) < 1) {
        const gpsTilt = calculateTiltFromGps(headingHistoryRef.current)
        if (gpsTilt !== null) tilt = gpsTilt
      }
      const tiltDirection: TiltDirection = tilt < -5 ? 'left' : tilt > 5 ? 'right' : 'center'

      const existing = polarRef.current.get(heading)
      if (!existing || currentSpeed > existing.maxSpeed) {
        polarRef.current.set(heading, {
          maxSpeed: currentSpeed,
          tiltDirection,
          tiltAngle: Math.abs(tilt)
        })
      }

      const wind = calculateWindDirection(polarRef.current)
      setWindDirection(wind)
    }, 1000)

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
      window.removeEventListener('devicemotion', handleMotion)
      clearInterval(interval)
    }
  }, [recording, currentSpeed, currentHeading])

  if (page === 'settings') {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 p-4 text-2xl">
        <h1 className="text-4xl font-bold">Settings</h1>
        <button className="p-4 border-2 border-current rounded" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
          Theme: {theme.toUpperCase()}
        </button>
        <button className="p-4 border-2 border-current rounded" onClick={() => setLayout(l => l === '2s' ? '4q' : l === '4q' ? '4s' : l === '4s' ? '6q' : l === '6q' ? '6s' : '2s')}>
          Layout: {layout}-data
        </button>
        <button className="p-4 border-2 border-current rounded" onClick={() => setFontSize(f => f === -5 ? -2 : f === -2 ? -1 : f === -1 ? 0 : f === 0 ? 1 : f === 1 ? 2 : f === 2 ? 5 : -5)}>
          Font Size: {fontSize === 0 ? 'Normal' : (fontSize > 0 ? '+' : '') + fontSize}
        </button>
        <button className="p-4 border-2 border-current rounded" onClick={() => setUnit(u => u === 'knots' ? 'kph' : u === 'kph' ? 'mph' : 'knots')}>
          Unit: {unit.toUpperCase()}
        </button>
        {DEBUG && (
          <button className="p-4 border-2 border-current rounded" onClick={() => setDebugMode(d => !d)}>
            Debug: {debugMode ? 'ON' : 'OFF'}
          </button>
        )}
        <button className="p-4 border-2 border-current rounded" onClick={() => setPage('sessions')}>
          Sessions
        </button>
        <button className="bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border-2 border-current rounded-xl font-bold py-4 px-6" onClick={handleStart}>
          START
        </button>
      </div>
    )
  }

  if (page === 'sessions') {
    return (
      <SessionsView
        sessions={sessions}
        unit={unit}
        onBack={() => setPage('settings')}
        onDelete={(id) => {
          deleteSession(id)
          setSessions(loadSessions())
        }}
      />
    )
  }

  const baseSize = layout === '2s' ? 10 : layout === '4s' ? 8 : layout === '6s' ? 6 : 5

  const vmg = currentSpeed !== null && currentHeading !== null && windDirection !== null
    ? convertSpeed(calculateVmg(currentSpeed, currentHeading, windDirection), unit).toFixed(1)
    : '0.0'

  const data = layout === '2s' 
    ? [['Speed', currentSpeed !== null ? convertSpeed(currentSpeed, unit).toFixed(1) : '0.0'], ['Heading', currentHeading !== null ? `${currentHeading.toFixed(0)}°` : '0°']]
    : layout === '4q' || layout === '4s'
    ? [['Speed', currentSpeed !== null ? convertSpeed(currentSpeed, unit).toFixed(1) : '0.0'], ['VMG', vmg], ['Heading', currentHeading !== null ? `${currentHeading.toFixed(0)}°` : '0°'], ['Wind', windDirection !== null ? `${windDirection.toFixed(0)}°` : '---']]
    : layout === '6q' || layout === '6s'
    ? [['Speed', currentSpeed !== null ? convertSpeed(currentSpeed, unit).toFixed(1) : '0.0'], ['VMG', vmg], ['Heading', currentHeading !== null ? `${currentHeading.toFixed(0)}°` : '0°'], ['Wind', windDirection !== null ? `${windDirection.toFixed(0)}°` : '---'], ['Tacking', '2.1'], // speed during last tack
    ['Polar', '95%']]
    : [['Speed', currentSpeed !== null ? convertSpeed(currentSpeed, unit).toFixed(1) : '0.0'], ['Heading', currentHeading !== null ? `${currentHeading.toFixed(0)}°` : '0°']]

  const polarEntries = Array.from(polarRef.current.entries()).map(([heading, entry]) => {
    const angle = (heading - 90) * Math.PI / 180
    const speed = convertSpeed(entry.maxSpeed, unit)
    const maxSpeed = Math.max(15, ...Array.from(polarRef.current.values()).map(e => convertSpeed(e.maxSpeed, unit)))
    const r = (speed / maxSpeed)
    return {
      rx: r * Math.cos(angle),
      ry: r * Math.sin(angle),
      speed,
      heading,
      tiltDirection: entry.tiltDirection
    }
  })

  return (
    <div className={`relative grid h-screen w-screen p-1 gap-1 ${layout === '2s' ? 'grid-rows-2' : layout === '4q' ? 'grid-cols-2 grid-rows-2' : layout === '4s' ? 'grid-rows-4' : layout === '6q' ? 'grid-cols-2 grid-rows-3' : 'grid-rows-6'}`}>
      {data.map(([label, value], i) => (
        <div key={i} className="flex flex-col items-center justify-center h-full w-full border-2 border-current p-1 overflow-hidden">
          <span className="text-[clamp(1rem,5vw,2rem)] font-bold uppercase tracking-wider">{label}</span>
          <span className="font-black leading-none" style={{ fontSize: `calc(${baseSize + fontSize * 0.5}rem)` }}>{value}</span>
        </div>
      ))}
      <button className="absolute top-0 right-0 w-10 h-10 bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border border-current rounded-bl font-bold text-xs z-50" onDoubleClick={() => {
          if (gpsPointsRef.current.length > 0) {
            if (confirm(`Download GPX and JSON with ${gpsPointsRef.current.length} GPS points?`)) {
              downloadGpx(gpsPointsRef.current)
              downloadJson(
                startTimeRef.current,
                gpsPointsRef.current,
                orientationRef.current,
                motionRef.current,
                accelerometerRef.current,
                gyroscopeRef.current,
                linearAccelRef.current,
                gravityRef.current,
                magnetometerRef.current,
                barometerRef.current,
                ambientLightRef.current,
                polarRef.current,
                windDirection
              )
            }
            saveSession({
              startTime: startTimeRef.current,
              gpsPoints: gpsPointsRef.current,
              orientationPoints: orientationRef.current,
              motionPoints: motionRef.current,
              accelerometerPoints: accelerometerRef.current,
              gyroscopePoints: gyroscopeRef.current,
              linearAccelPoints: linearAccelRef.current,
              gravityPoints: gravityRef.current,
              magnetometerPoints: magnetometerRef.current,
              barometerPoints: barometerRef.current,
              ambientLightPoints: ambientLightRef.current,
              polarEntries: polarRef.current,
              windDirection
            }, true)
            setSessions(loadSessions())
          }
          recordingRef.current = false
          setRecording(false)
          setPage('settings')
        }}>
        EXIT
      </button>
      <div className="absolute top-0 right-0 flex">
        {gpsPointsRef.current.length > 0 && (
          <button className="w-12 h-10 bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border border-current font-bold text-xs" onClick={() => downloadJson(
            startTimeRef.current,
            gpsPointsRef.current,
            orientationRef.current,
            motionRef.current,
            accelerometerRef.current,
            gyroscopeRef.current,
            linearAccelRef.current,
            gravityRef.current,
            magnetometerRef.current,
            barometerRef.current,
            ambientLightRef.current,
            polarRef.current,
            windDirection
          )}>
            DATA
          </button>
        )}
        {gpsPointsRef.current.length > 0 && (
          <button className="w-12 h-10 bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border border-current font-bold text-xs" onClick={() => downloadGpx(gpsPointsRef.current)}>
            GPX
          </button>
        )}
      </div>
      {DEBUG && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end p-1 text-xs bg-[var(--bg-color)]/80">
          <div className="font-mono">
            <div>GPS: {rawGpsData.speed?.toFixed(1) ?? 'N/A'}m/s {rawGpsData.heading?.toFixed(0) ?? 'N/A'}° acc{rawGpsData.accuracy?.toFixed(0) ?? 'N/A'}</div>
            <div>Ori: {rawOrientationData.alpha !== null ? `α${rawOrientationData.alpha?.toFixed(0)} β${rawOrientationData.beta?.toFixed(0)} γ${rawOrientationData.gamma?.toFixed(0)}` : `no sensor tilt:${currentTiltRef.current.toFixed(0)}`}</div>
          </div>
          <svg width={60} height={60} viewBox="0 0 60 60" className="border border-current rounded-full">
            <circle cx={30} cy={30} r={28} fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => {
              const angle = (deg - 90) * Math.PI / 180
              return <line key={deg} x1={30} y1={30} x2={30 + 28 * Math.cos(angle)} y2={30 + 28 * Math.sin(angle)} stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
            })}
            {polarEntries.map((entry, i) => (
              <circle key={i} cx={30 + entry.rx * 28} cy={30 + entry.ry * 28} r={2} fill={entry.tiltDirection === 'left' ? '#ef4444' : entry.tiltDirection === 'right' ? '#3b82f6' : '#22c55e'} />
            ))}
          </svg>
        </div>
      )}
    </div>
  )

  if (DEBUG && debugMode) {
    return (
      <div className="flex flex-col h-screen w-screen p-2 gap-2">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">DEBUG MODE</h2>
          <button className="px-4 py-2 border-2 border-current rounded" onClick={() => setDebugMode(false)}>Exit Debug</button>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="border-2 border-current p-2 rounded">
            <h3 className="font-bold text-sm mb-1">Raw GPS Data</h3>
            <div className="text-xs font-mono">
              <div>Speed (m/s): {rawGpsData.speed?.toFixed(2) ?? 'N/A'}</div>
              <div>Heading (°): {rawGpsData.heading?.toFixed(1) ?? 'N/A'}</div>
              <div>Accuracy (m): {rawGpsData.accuracy?.toFixed(1) ?? 'N/A'}</div>
            </div>
          </div>
          <div className="border-2 border-current p-2 rounded">
            <h3 className="font-bold text-sm mb-1">Raw Orientation Data</h3>
            <div className="text-xs font-mono">
              <div>Alpha (°): {rawOrientationData.alpha?.toFixed(1) ?? 'N/A'}</div>
              <div>Beta (°): {rawOrientationData.beta?.toFixed(1) ?? 'N/A'}</div>
              <div>Gamma (°): {rawOrientationData.gamma?.toFixed(1) ?? 'N/A'}</div>
              <div className="mt-1">Tilt: {currentTiltRef.current.toFixed(1)}°</div>
            </div>
          </div>
        </div>

        <div className="flex-1 border-2 border-current p-2 rounded flex flex-col items-center">
          <h3 className="font-bold text-sm mb-1">Polar (colored by tilt)</h3>
          <div className="flex gap-4 text-xs mb-2">
            <span className="text-red-500">Left</span>
            <span className="text-green-500">Center</span>
            <span className="text-blue-500">Right</span>
          </div>
          <svg width={250} height={250} className="border border-current rounded-full">
            <circle cx={125} cy={125} r={105} fill="none" stroke="currentColor" strokeWidth="1" />
            <line x1={125} y1={20} x2={125} y2={230} stroke="currentColor" strokeWidth="1" opacity="0.3" />
            <line x1={20} y1={125} x2={230} y2={125} stroke="currentColor" strokeWidth="1" opacity="0.3" />
            <circle cx={125} cy={125} r={52} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
            <circle cx={125} cy={125} r={105} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
            {polarEntries.map((entry, i) => (
              <circle
                key={i}
                cx={125 + entry.rx * 105}
                cy={125 + entry.ry * 105}
                r={6}
                fill={entry.tiltDirection === 'left' ? '#ef4444' : entry.tiltDirection === 'right' ? '#3b82f6' : '#22c55e'}
              />
            ))}
          </svg>
          <div className="text-xs mt-1">Entries: {polarEntries.length}</div>
        </div>
      </div>
    )
  }
}
