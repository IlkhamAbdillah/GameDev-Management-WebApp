import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { timelineApi } from '../api/tasks'
import PageHeader from '../components/PageHeader'
import GanttChart from '../components/timeline/GanttChart'
import StatsPanel from '../components/timeline/StatsPanel'
import { addDays, startOfWeek, todayIso } from '../lib/dates'
import { TASK_CATEGORIES, TASK_STATUSES, type Timeline } from '../types'

const SPANS = [
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: 60, label: '2 months' },
  { days: 90, label: '3 months' },
]

const select = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
const btn = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-300 hover:bg-surface-2'

export default function TimelinePage() {
  const [start, setStart] = useState(() => addDays(startOfWeek(todayIso()), -7))
  const [days, setDays] = useState(30)
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [data, setData] = useState<Timeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const end = addDays(start, days - 1)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await timelineApi.get({ startDate: start, endDate: end, status, category }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline')
    } finally {
      setLoading(false)
    }
  }, [start, end, status, category])

  useEffect(() => {
    void load()
  }, [load])

  const step = Math.max(7, Math.floor(days / 2))

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Timeline"
        subtitle={`${start} → ${end}`}
        actions={
          <button onClick={() => void load()} aria-label="Refresh" className="rounded-lg border border-line bg-surface p-2 text-slate-300 hover:bg-surface-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {data && <StatsPanel stats={data.stats} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <button aria-label="Previous" className={btn} onClick={() => setStart(addDays(start, -step))}>
            <ChevronLeft size={16} />
          </button>
          <button className={btn} onClick={() => setStart(addDays(startOfWeek(todayIso()), -7))}>
            Today
          </button>
          <button aria-label="Next" className={btn} onClick={() => setStart(addDays(start, step))}>
            <ChevronRight size={16} />
          </button>
        </div>
        <select className={select} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Range length">
          {SPANS.map((s) => <option key={s.days} value={s.days}>{s.label}</option>)}
        </select>
        <select className={select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={select} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {TASK_CATEGORIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm ring-2 ring-red-400" /> Overdue</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm ring-2 ring-amber-300" /> Due ≤ 3 days</span>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => void load()} className="text-xs underline">Retry</button>
        </div>
      )}

      {loading && !data ? (
        <p className="py-16 text-center text-sm text-slate-400">Loading timeline…</p>
      ) : data && data.tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-slate-400">
          No scheduled tasks in this range. Use the arrows to move the window, or give tasks a start/due date.
        </div>
      ) : (
        data && <GanttChart tasks={data.tasks} start={start} days={days} />
      )}
    </div>
  )
}
