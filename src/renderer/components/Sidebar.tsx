import { NavLink } from 'react-router-dom'
import { Command } from 'lucide-react'
import { NAV } from '../nav'

export default function Sidebar() {
  return (
    <aside className="drag-region flex h-full w-[200px] shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Traffic-light strip (drag region, intentionally empty) */}
      <div className="h-[38px]" />

      {/* Brand row */}
      <div className="flex h-[40px] items-center px-5">
        <span className="font-serif text-[15px] font-semibold tracking-tight text-text">
          Decision Journal
        </span>
      </div>

      <nav className="no-drag mt-3 flex flex-col gap-[2px] px-3">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors',
                isActive
                  ? 'bg-nav-active text-text ring-1 ring-border'
                  : 'text-text/80 hover:bg-nav-active/60'
              ].join(' ')
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="no-drag mt-auto flex flex-col gap-1 px-5 pb-4 text-[12px] text-text-muted">
        <div className="flex items-center gap-2">
          <Command size={12} strokeWidth={2} />
          <span>Quick navigation</span>
          <span className="ml-auto flex items-center gap-0.5">
            <kbd className="rounded border border-border/80 bg-bg-elevated/60 px-1 font-mono text-[10px]">
              ⌘
            </kbd>
            <kbd className="rounded border border-border/80 bg-bg-elevated/60 px-1 font-mono text-[10px]">
              K
            </kbd>
          </span>
        </div>
        <div className="opacity-70">All data stored locally</div>
      </div>
    </aside>
  )
}
