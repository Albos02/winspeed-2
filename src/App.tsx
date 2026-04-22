import { useState, useEffect, useRef } from 'react'
import './index.css'

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

  const headings = Array.from(polar.keys()).sort((a, b) => a - b)
  const bestAxis: { axis: number; score: number } = { axis: 0, score: 0 }

  for (const h1 of headings) {
    const entry1 = polar.get(h1)
    if (!entry1) continue

    const opposite1 = (h1 + 180) % 360
    const entry2 = polar.get(opposite1)
    if (!entry2) continue

    const speedDiff = Math.abs(entry1.maxSpeed - entry2.maxSpeed)
    const tiltOpposite = (entry1.tiltDirection === 'left' && entry2.tiltDirection === 'right') ||
                        (entry1.tiltDirection === 'right' && entry2.tiltDirection === 'left')

    let score = 0
    if (tiltOpposite) score += 50
    score += Math.max(0, 30 - speedDiff * 2)
    score += (entry1.maxSpeed + entry2.maxSpeed) / 4

    if (score > bestAxis.score) {
      bestAxis.axis = (h1 + 180) % 360
      bestAxis.score = score
    }
  }

  return bestAxis.score > 20 ? bestAxis.axis : null
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('light')
  const [layout, setLayout] = useState<Layout>('2s')
  const [fontSize, setFontSize] = useState<FontSize>(0)
  const [recording, setRecording] = useState(false)
  const [currentSpeed, setCurrentSpeed] = useState<number | null>(null)
  const [currentHeading, setCurrentHeading] = useState<number | null>(null)
  const [currentTilt, setCurrentTilt] = useState<number>(0)
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
      const gamma = e.gamma ?? 0
      setCurrentTilt(gamma)
    }

    if (DeviceOrientationEvent.requestPermission) {
      DeviceOrientationEvent.requestPermission()
        .then(permission => {
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation)
          }
        })
    } else {
      window.addEventListener('deviceorientation', handleOrientation)
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [recording])

  useEffect(() => {
    if (!recording || currentSpeed === null || currentHeading === null || currentSpeed < 1) return

    const heading = normalizeHeading(currentHeading)
    const existing = polarRef.current.get(heading)

    const tiltDirection: TiltDirection = currentTilt < -5 ? 'left' : currentTilt > 5 ? 'right' : 'center'

    if (!existing || currentSpeed > existing.maxSpeed) {
      polarRef.current.set(heading, {
        maxSpeed: currentSpeed,
        tiltDirection,
        tiltAngle: Math.abs(currentTilt)
      })
    }

    const wind = calculateWindDirection(polarRef.current)
    setWindDirection(wind)
  }, [recording, currentSpeed, currentHeading, currentTilt])

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
        <button className="bg-[var(--inverted-bg-color)] text-[var(--inverted-text-color)] border-2 border-current rounded-xl font-bold py-4 px-6" onClick={() => setRecording(true)}>
          START
        </button>
      </div>
    )
  }

  const baseSize = layout === '2s' ? 10 : layout === '4s' ? 8 : layout === '6s' ? 6 : 5

  const data = layout === '2s' 
    ? [['Speed', currentSpeed !== null ? convertSpeed(currentSpeed, unit).toFixed(1) : '0.0'], ['Heading', currentHeading !== null ? `${currentHeading.toFixed(0)}°` : '0°']]
    : layout === '4q' || layout === '4s'
    ? [['Speed', currentSpeed !== null ? convertSpeed(currentSpeed, unit).toFixed(1) : '0.0'], ['VMG', '9.2'], ['Heading', currentHeading !== null ? `${currentHeading.toFixed(0)}°` : '0°'], ['Wind', windDirection !== null ? `${windDirection.toFixed(0)}°` : '---']]
    : layout === '6q' || layout === '6s'
    ? [['Speed', currentSpeed !== null ? convertSpeed(currentSpeed, unit).toFixed(1) : '0.0'], ['VMG', '9.2'], ['Heading', currentHeading !== null ? `${currentHeading.toFixed(0)}°` : '0°'], ['Wind', windDirection !== null ? `${windDirection.toFixed(0)}°` : '---'], ['Tacking', '2.1'], // speed during last tack
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
}
