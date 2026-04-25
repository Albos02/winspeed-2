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

export default function App() {
  const [theme, setTheme] = useState<Theme>('light')
  const [layout, setLayout] = useState<Layout>('2s')
  const [fontSize, setFontSize] = useState<FontSize>(0)
  const [recording, setRecording] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
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
  const recordingRef = useRef(false)

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
    setRecording(true)
    recordingRef.current = true
  }

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('theme-dark')
    else document.documentElement.classList.remove('theme-dark')
  }, [theme])

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
      currentTiltRef.current = e.gamma ?? 0
      setRawOrientationData({
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma
      })
    }

    window.addEventListener('deviceorientation', handleOrientation)
    
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
      clearInterval(interval)
    }
  }, [recording, currentSpeed, currentHeading])

  if (!recording) {
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
        <button className="bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border-2 border-current rounded-xl font-bold py-4 px-6" onClick={handleStart}>
          START
        </button>
      </div>
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
      <button className="absolute top-0 right-0 w-10 h-10 bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border border-current rounded-bl font-bold text-xs" onDoubleClick={() => {
          if (gpsPointsRef.current.length > 0) {
            if (confirm(`Download GPX with ${gpsPointsRef.current.length} points?`)) {
              downloadGpx(gpsPointsRef.current)
            }
          }
          recordingRef.current = false
          setRecording(false)
        }}>
        EXIT
      </button>
      {gpsPointsRef.current.length > 0 && (
        <button className="absolute top-0 right-10 w-12 h-10 bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border border-current rounded-bl font-bold text-xs" onClick={() => downloadGpx(gpsPointsRef.current)}>
          GPX
        </button>
      )}
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
