import { AlertTriangle, ArrowRight, CheckCircle2, ListTodo, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { assetsApi } from '../api/assets'
import { usersApi } from '../api/auth'
import { tasksApi } from '../api/tasks'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../lib/authContext'
import {
  ownAssets,
  ownTasks,
  reviewItems,
  summarize,
  tasksNextWeek,
  tasksThisWeek,
  weekRange,
  workload,
  type ReviewItem,
} from '../lib/dashboard'
import { diffDays, parseLocalDate, todayIso } from '../lib/dates'
import { DUE_STYLE, PRIORITY_STYLE, STATUS_DOT, dueState } from '../lib/taskUi'
import type { Asset, Task, User } from '../types'

const shortDate = (iso: string) => parseLocalDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function Card({ title, count, link, wide = false, children }: { title: string; count?: number; link?: { to: string; label: string }; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-line bg-surface ${wide ? 'lg:col-span-2' : ''}`}>
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          {title}
          {count !== undefined && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-slate-400 tabular-nums">{count}</span>}
        </h2>
        {link && (
          <Link to={link.to} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
            {link.label} <ArrowRight size={12} />
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-center text-sm text-slate-500">{text}</p>
}

function Stat({ icon, label, value, tone = '' }: { icon: ReactNode; label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

function TaskRow({ task, showAssignee, today }: { task: Task; showAssignee: boolean; today: string }) {
  const due = dueState(task)
  const date = task.dueDate || task.startDate
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[task.status]}`} title={task.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{task.title}</div>
        <div className="truncate text-xs text-slate-500">
          {task.status}
          {showAssignee && ` · ${task.assignee || 'Unassigned'}`}
        </div>
      </div>
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] ring-1 ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
      <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${DUE_STYLE[due]}`}>
        {due === 'overdue' ? `${diffDays(task.dueDate, today)}d late` : date ? shortDate(date) : ''}
      </span>
    </li>
  )
}

function ReviewRow({ item, showWho, today }: { item: ReviewItem; showWho: boolean; today: string }) {
  const waiting = item.since ? diffDays(item.since.slice(0, 10), today) : 0
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-11 shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-center text-[11px] text-slate-400">
        {item.kind === 'task' ? 'Task' : 'Asset'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{item.title}</div>
        {showWho && <div className="truncate text-xs text-slate-500">{item.who || 'Unassigned'}</div>}
      </div>
      <span className="shrink-0 text-xs text-slate-500 tabular-nums">{waiting > 0 ? `${waiting}d` : 'today'}</span>
    </li>
  )
}

export default function DashboardPage() {
  const { user, isManager } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const today = todayIso()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [t, a, u] = await Promise.all([
        tasksApi.list(),
        assetsApi.list(),
        isManager ? usersApi.list() : Promise.resolve<User[]>([]),
      ])
      setTasks(t)
      setAssets(a)
      setUsers(u)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the dashboard')
    } finally {
      setLoading(false)
    }
  }, [isManager])

  useEffect(() => {
    void load()
  }, [load])

  const view = useMemo(() => {
    if (!user) return null
    const scopeTasks = isManager ? tasks : ownTasks(tasks, user)
    const scopeAssets = isManager ? assets : ownAssets(assets, user)
    return {
      summary: summarize(scopeTasks, today),
      thisWeek: tasksThisWeek(scopeTasks, today),
      nextWeek: tasksNextWeek(scopeTasks, today),
      review: reviewItems(scopeTasks, scopeAssets),
      team: isManager ? workload(tasks, users, today) : [],
    }
  }, [user, isManager, tasks, assets, users, today])

  if (!user || !view) return null
  const week = weekRange(today)
  const maxOpen = Math.max(1, ...view.team.map((w) => w.open))

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Week of ${shortDate(week.start)} – ${shortDate(week.end)}`}
        actions={
          <button onClick={() => void load()} aria-label="Refresh" className="rounded-lg border border-line bg-surface p-2 text-slate-300 hover:bg-surface-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError('')} className="text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<ListTodo size={14} />} label={isManager ? 'Open tasks' : 'My open tasks'} value={view.summary.open} />
        <Stat
          icon={<AlertTriangle size={14} />}
          label="Overdue"
          value={view.summary.overdue}
          tone={view.summary.overdue ? 'text-red-400' : ''}
        />
        <Stat icon={<CheckCircle2 size={14} />} label="Completion" value={`${view.summary.completionRate}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="To do this week" count={view.thisWeek.length} link={{ to: '/tasks', label: 'Tasks' }}>
          {view.thisWeek.length ? (
            <ul className="divide-y divide-line">
              {view.thisWeek.map((t) => <TaskRow key={t.taskId} task={t} showAssignee={isManager} today={today} />)}
            </ul>
          ) : (
            <Empty text={loading ? 'Loading…' : 'Nothing due this week.'} />
          )}
        </Card>

        <Card title={isManager ? 'Needs review' : 'Being reviewed'} count={view.review.length}>
          {view.review.length ? (
            <ul className="divide-y divide-line">
              {view.review.map((item) => <ReviewRow key={`${item.kind}-${item.id}`} item={item} showWho={isManager} today={today} />)}
            </ul>
          ) : (
            <Empty text={loading ? 'Loading…' : 'Nothing waiting for review.'} />
          )}
        </Card>

        {isManager ? (
          <Card title="Team workload" link={{ to: '/team', label: 'Team' }} wide>
            {view.team.length ? (
              <ul className="divide-y divide-line">
                {view.team.map((w) => (
                  <li key={w.userId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-32 shrink-0 truncate text-sm">{w.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(w.open * 100) / maxOpen}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs text-slate-400 tabular-nums">{w.open} open</span>
                    <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${w.overdue ? 'text-red-400' : 'text-slate-600'}`}>
                      {w.overdue} overdue
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text={loading ? 'Loading…' : 'No accounts yet.'} />
            )}
          </Card>
        ) : (
          <Card title="Next week" count={view.nextWeek.length} link={{ to: '/timeline', label: 'Timeline' }} wide>
            {view.nextWeek.length ? (
              <ul className="divide-y divide-line">
                {view.nextWeek.map((t) => <TaskRow key={t.taskId} task={t} showAssignee={false} today={today} />)}
              </ul>
            ) : (
              <Empty text={loading ? 'Loading…' : 'Nothing planned for next week.'} />
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
