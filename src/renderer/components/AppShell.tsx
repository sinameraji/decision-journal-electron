import type { PropsWithChildren } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import CommandPalette from './CommandPalette'

export default function AppShell({ children }: PropsWithChildren) {
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
