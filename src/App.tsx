import { useState } from 'react'
import './index.css'

type Theme = 'light' | 'dark'
type Layout = '2s' | '4q' | '4s' | '6q' | '6s'

export default function App() {
  const [theme, setTheme] = useState<Theme>('light')
  const [layout, setLayout] = useState<Layout>('2s')
  const [recording, setRecording] = useState(false)

  if (theme === 'dark') document.documentElement.classList.add('theme-dark')
  else document.documentElement.classList.remove('theme-dark')

  if (!recording) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 p-4">
        <h1 className="text-3xl font-bold">Settings</h1>
        <button className="p-4 border-2 border-current rounded" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
          Theme: {theme.toUpperCase()}
        </button>
        <button className="p-4 border-2 border-current rounded" onClick={() => setLayout(l => l === '2s' ? '4q' : l === '4q' ? '4s' : l === '4s' ? '6q' : l === '6q' ? '6s' : '2s')}>
          Layout: {layout}-data
        </button>
        <button className="p-4 border-2 border-current rounded font-bold" onClick={() => setRecording(true)}>
          START
        </button>
      </div>
    )
  }

  const data = layout === '2s' 
    ? [['Speed', '12.5'], ['Heading', '180°']]
    : layout === '4q' || layout === '4s'
    ? [['Speed', '12.5'], ['VMG', '9.2'], ['Heading', '180°'], ['Wind', '45°']]
    : layout === '6q' || layout === '6s'
    ? [['Speed', '12.5'], ['VMG', '9.2'], ['Heading', '180°'], ['Wind', '45°'], ['Tacking', '2.1'], // speed during last tack
    ['Polar', '95%']]
    : [['Speed', '12.5'], ['Heading', '180°']]

  return (
    <div className={`grid h-[calc(100vh-10px)] w-[calc(100vw-10px)] p-1 gap-1 ${layout === '2s' ? 'grid-rows-2' : layout === '4q' ? 'grid-cols-2 grid-rows-2' : layout === '4s' ? 'grid-rows-4' : layout === '6q' ? 'grid-cols-2 grid-rows-3' : 'grid-rows-6'}`}>
      {data.map(([label, value], i) => (
        <div key={i} className="flex flex-col items-center justify-center h-full w-full border-2 border-current p-1 overflow-hidden">
          <span className="text-[clamp(1rem,5vw,2rem)] font-bold uppercase tracking-wider">{label}</span>
          <span className="text-[clamp(2rem,25vw,50vh)] font-black leading-none">{value}</span>
        </div>
      ))}
      <button className="absolute top-0 right-0 w-12 h-12 border-2 border-current rounded-bl-lg font-bold text-xs" onClick={() => setRecording(false)}>
        EXIT
      </button>
    </div>
  )
}
