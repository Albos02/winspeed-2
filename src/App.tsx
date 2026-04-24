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
  const [windDirection, setWindDirection] = useState<number | null>(null)
  const [unit, setUnit] = useState<Unit>('knots')
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null)
  const polarRef = useRef<Map<number, PolarEntry>>(new Map())

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
        setCurrentSpeed(position.coords.speed)
        setCurrentHeading(position.coords.heading)
        setRawGpsData({
          speed: position.coords.speed,
          heading: position.coords.heading,
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
      const tilt = currentTiltRef.current
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

  return (
    <div className={`relative grid h-screen w-screen p-1 gap-1 ${layout === '2s' ? 'grid-rows-2' : layout === '4q' ? 'grid-cols-2 grid-rows-2' : layout === '4s' ? 'grid-rows-4' : layout === '6q' ? 'grid-cols-2 grid-rows-3' : 'grid-rows-6'}`}>
      {data.map(([label, value], i) => (
        <div key={i} className="flex flex-col items-center justify-center h-full w-full border-2 border-current p-1 overflow-hidden">
          <span className="text-[clamp(1rem,5vw,2rem)] font-bold uppercase tracking-wider">{label}</span>
          <span className="font-black leading-none" style={{ fontSize: `calc(${baseSize + fontSize * 0.5}rem)` }}>{value}</span>
        </div>
      ))}
      <button className="absolute top-0 right-0 w-10 h-10 bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border border-current rounded-bl font-bold text-xs" onDoubleClick={() => setRecording(false)}>
        EXIT
      </button>
    </div>
  )

  if (DEBUG && debugMode) {
    const polarSize = 250
    const center = polarSize / 2
    const maxRadius = polarSize / 2 - 20
    const maxSpeed = Math.max(15, ...Array.from(polarRef.current.values()).map(e => convertSpeed(e.maxSpeed, unit)))

    const polarEntries = Array.from(polarRef.current.entries()).map(([heading, entry]) => {
      const angle = (heading - 90) * Math.PI / 180
      const radius = (convertSpeed(entry.maxSpeed, unit) / maxSpeed) * maxRadius
      return {
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
        speed: convertSpeed(entry.maxSpeed, unit).toFixed(1),
        heading,
        tiltDirection: entry.tiltDirection,
        tiltAngle: entry.tiltAngle
      }
    })

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
          <svg width={polarSize} height={polarSize} className="border border-current rounded-full">
            <circle cx={center} cy={center} r={maxRadius} fill="none" stroke="currentColor" strokeWidth="1" />
            {[0, 90, 180, 270].map(deg => {
              const angle = (deg - 90) * Math.PI / 180
              return (
                <line
                  key={deg}
                  x1={center}
                  y1={center}
                  x2={center + maxRadius * Math.cos(angle)}
                  y2={center + maxRadius * Math.sin(angle)}
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.3"
                />
              )
            })}
            {[0, 5, 10, 15].map(speed => (
              <circle
                key={speed}
                cx={center}
                cy={center}
                r={(speed / maxSpeed) * maxRadius}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.3"
              />
            ))}
            {polarEntries.map((entry, i) => (
              <circle
                key={i}
                cx={entry.x}
                cy={entry.y}
                r={6}
                fill={entry.tiltDirection === 'left' ? '#ef4444' : entry.tiltDirection === 'right' ? '#3b82f6' : '#22c55e'}
              />
            ))}
            {polarEntries.map((entry, i) => (
              <text
                key={`t-${i}`}
                x={entry.x}
                y={entry.y - 8}
                fontSize="8"
                textAnchor="middle"
                fill="currentColor"
              >
                {entry.heading}°
              </text>
            ))}
          </svg>
          <div className="text-xs mt-1">Entries: {polarEntries.length} | Max Speed: {maxSpeed.toFixed(1)} {unit}</div>
        </div>
      </div>
    )
  }
}
