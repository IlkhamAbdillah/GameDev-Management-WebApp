import { Activity, BookOpen, Boxes, CalendarRange, KanbanSquare, Vault } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { refreshStatuses } from '../lib/connectivityStore'

const NAV = [
  { to: '/assets', label: 'Assets', icon: Boxes },
  { to: '/tasks', label: 'Tasks', icon: KanbanSquare },
  { to: '/timeline', label: 'Timeline', icon: CalendarRange },
]

const SYSTEM_NAV = [
  { to: '/docs', label: 'Docs', icon: BookOpen },
  { to: '/connectivity', label: 'Connectivity', icon: Activity },
]

export default function Layout() {
  // Quiet health check when the app loads, so the Connectivity page already has its statuses.
  useEffect(() => {
    void refreshStatuses()
  }, [])

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 items-center gap-4 border-b border-line bg-surface px-4 py-3 md:w-60 md:flex-col md:items-stretch md:gap-6 md:border-r md:border-b-0 md:p-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-accent/20 text-accent">
            <Vault size={20} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">GameVault</div>
            <div className="hidden text-[11px] text-slate-400 md:block">Manage. Track. Build.</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-wrap gap-1 md:flex-col md:flex-nowrap">
          {[...NAV, null, ...SYSTEM_NAV].map((item) =>
            item === null ? (
              <div key="system" className="hidden px-3 pt-4 pb-1 text-[11px] font-medium tracking-wide text-slate-500 uppercase md:block">System</div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? 'bg-accent/15 text-white' : 'text-slate-400 hover:bg-surface-2 hover:text-slate-200'
                  }`
                }
              >
                <item.icon size={17} />
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="hidden rounded-xl border border-line bg-bg/40 p-3 text-xs text-slate-400 md:block">
          <div className="font-medium text-slate-200">Indie Workspace</div>
          <div>us-east-1 · Serverless</div>
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
