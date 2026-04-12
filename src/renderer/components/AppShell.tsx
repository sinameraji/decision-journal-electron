import { useEffect, type PropsWithChildren } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { NAV } from '../nav'
import CommandPalette from './CommandPalette'

export default function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.altKey || e.shiftKey) return
      const match = /^Digit([1-9])$/.exec(e.code)
      if (!match) return
      const idx = Number(match[1]) - 1
      if (idx >= NAV.length) return
      e.preventDefault()
      navigate(NAV[idx].to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="flex h-full w-full bg-bg text-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto px-12 pt-10">{children}</main>
      </div>
      <CommandPalette />
    </div>
  )
}
