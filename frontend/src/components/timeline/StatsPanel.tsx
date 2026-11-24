import { AlertTriangle, CheckCircle2, Clock, ListTodo } from 'lucide-react'
import type { ReactNode } from 'react'
import { STATUS_BAR } from '../../lib/taskUi'
import { TASK_STATUSES, type TimelineStats } from '../../types'

function Tile({ icon, label, value, tone = '' }: { icon: ReactNode; label: string; value: ReactNode; tone?: string }) {
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

export default function StatsPanel({ stats }: { stats: TimelineStats }) {
  return (
    <section aria-label="Task statistics" className="grid gap-3 lg:grid-cols-[2fr_repeat(3,1fr)]">
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex items-baseline justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Completion
          </span>
          <span>
            {stats.done} / {stats.total} done
          </span>
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{stats.completionRate}%</div>
        <div
          className="mt-2 flex h-2 overflow-hidden rounded-full bg-bg"
          role="img"
          aria-label={TASK_STATUSES.map((s) => `${s}: ${stats.byStatus[s]}`).join(', ')}
        >
          {stats.total > 0 &&
            TASK_STATUSES.map((s) => (
              <div key={s} className={STATUS_BAR[s]} style={{ width: `${(stats.byStatus[s] * 100) / stats.total}%` }} title={`${s}: ${stats.byStatus[s]}`} />
            ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
          {TASK_STATUSES.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${STATUS_BAR[s]}`} />
              {s} {stats.byStatus[s]}
            </span>
          ))}
        </div>
      </div>
      <Tile icon={<AlertTriangle size={14} />} label="Overdue" value={stats.overdue} tone={stats.overdue ? 'text-red-400' : ''} />
      <Tile icon={<Clock size={14} />} label="Due in ≤ 3 days" value={stats.dueSoon} tone={stats.dueSoon ? 'text-amber-300' : ''} />
      <Tile icon={<ListTodo size={14} />} label="Unscheduled" value={stats.unscheduled} />
    </section>
  )
}
