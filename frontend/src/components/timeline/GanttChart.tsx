import { addDays, diffDays, parseLocalDate, todayIso } from '../../lib/dates'
import { STATUS_BAR, dueState } from '../../lib/taskUi'
import type { TimelineEntry } from '../../types'

const DAY_PX = 30
const LABEL_PX = 200

interface Props {
  tasks: TimelineEntry[]
  start: string // first visible day (inclusive)
  days: number
  onOpen?: (taskId: string) => void
}

export default function GanttChart({ tasks, start, days, onOpen }: Props) {
  const today = todayIso()
  const todayIndex = diffDays(start, today)
  const width = days * DAY_PX
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i))

  // Month labels span the day cells they cover.
  const months: { label: string; span: number }[] = []
  for (const iso of dayList) {
    const label = parseLocalDate(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    const last = months[months.length - 1]
    if (last?.label === label) last.span += 1
    else months.push({ label, span: 1 })
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <div style={{ width: LABEL_PX + width }} className="relative">
        {/* header */}
        <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
          <div style={{ width: LABEL_PX }} className="sticky left-0 z-30 shrink-0 border-r border-line bg-surface px-3 py-2 text-xs text-slate-400">
            Task
          </div>
          <div style={{ width }}>
            <div className="flex border-b border-line/60">
              {months.map((m) => (
                <div key={m.label + m.span} style={{ width: m.span * DAY_PX }} className="truncate px-2 py-1 text-xs font-medium text-slate-300">
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex">
              {dayList.map((iso) => {
                const d = parseLocalDate(iso)
                const weekend = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div key={iso} style={{ width: DAY_PX }} className={`py-1 text-center text-[10px] ${iso === today ? 'font-bold text-accent' : weekend ? 'text-slate-600' : 'text-slate-400'}`}>
                    {d.getDate()}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* rows */}
        <div className="relative">
          {tasks.map((task) => {
            const from = Math.max(diffDays(start, task.start), 0)
            const to = Math.min(diffDays(start, task.end), days - 1)
            const state = dueState({ dueDate: task.dueDate, status: task.status })
            const alert = state === 'overdue' ? 'ring-2 ring-red-400' : state === 'soon' ? 'ring-2 ring-amber-300' : ''
            const clippedLeft = diffDays(start, task.start) < 0
            const clippedRight = diffDays(start, task.end) > days - 1
            const tip = `${task.title}\n${task.start} → ${task.end}\n${task.status}${task.assignee ? ` · ${task.assignee}` : ''}${state === 'overdue' ? '\nOverdue' : state === 'soon' ? '\nDue soon' : ''}`
            return (
              <div key={task.taskId} className="flex border-b border-line/40 last:border-b-0">
                <div style={{ width: LABEL_PX }} className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface px-3 py-2">
                  <div className="truncate text-sm">{task.title}</div>
                  <div className="truncate text-[11px] text-slate-500">{task.assignee || 'Unassigned'}</div>
                </div>
                <div style={{ width }} className="relative h-12">
                  <button
                    type="button"
                    title={tip}
                    aria-label={tip.replaceAll('\n', ', ')}
                    onClick={() => onOpen?.(task.taskId)}
                    style={{ left: from * DAY_PX + 2, width: (to - from + 1) * DAY_PX - 4 }}
                    className={`absolute top-2.5 h-7 truncate px-2 text-left text-xs font-medium text-white hover:brightness-110 ${STATUS_BAR[task.status]} ${alert} ${clippedLeft ? 'rounded-l-none' : 'rounded-l-md'} ${clippedRight ? 'rounded-r-none' : 'rounded-r-md'}`}
                  >
                    {(to - from + 1) * DAY_PX > 70 ? task.title : ''}
                  </button>
                </div>
              </div>
            )
          })}

          {/* day grid + today marker, overlaid behind bars */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_PX, width }}>
            {dayList.map((iso, i) => {
              const d = parseLocalDate(iso).getDay()
              return d === 0 || d === 6 ? <div key={iso} className="absolute inset-y-0 bg-white/[0.025]" style={{ left: i * DAY_PX, width: DAY_PX }} /> : null
            })}
            {todayIndex >= 0 && todayIndex < days && (
              <div className="absolute inset-y-0 w-px bg-accent" style={{ left: todayIndex * DAY_PX + DAY_PX / 2 }} aria-label="Today" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
