import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Unlock from './routes/Unlock'
import Decisions from './routes/Decisions'
import NewDecision from './routes/NewDecision'
import EditDecision from './routes/EditDecision'
import Reviews from './routes/Reviews'
import Analytics from './routes/Analytics'
import Chat from './routes/chat'
import Settings from './routes/Settings'
import AppShell from './components/AppShell'
import { useAuthStore } from './store/auth'
import { useChatStore } from './store/chat'
import { useThemeStore } from './store/theme'

export default function App() {
  const { status, unlocked, loading, refreshStatus } = useAuthStore()
  const themeReady = useThemeStore((s) => s.ready)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => {
    initTheme()
    refreshStatus()
  }, [initTheme, refreshStatus])

  useEffect(() => {
    if (!unlocked) useChatStore.getState().reset()
  }, [unlocked])

  if (loading || !status || !themeReady) {
    return <div className="h-full w-full bg-bg" />
  }

  if (!unlocked) {
    return <Unlock />
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/decisions" replace />} />
        <Route path="/decisions" element={<Decisions />} />
        <Route path="/decisions/:id/edit" element={<EditDecision />} />
        <Route path="/new" element={<NewDecision />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/decisions" replace />} />
      </Routes>
    </AppShell>
  )
}
