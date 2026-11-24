import { CalendarDays, User } from 'lucide-react'
import type { Task } from '../../types'
import { DUE_STYLE, PRIORITY_STYLE, dueState, formatDate } from '../../lib/taskUi'

interface Props {
  task: Task
  onOpen: (task: Task) => void
}

export default function TaskCard({ task, onOpen }: Props) {
  const due = dueState(task)
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.taskId)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(task)}
      className="cursor-grab rounded-xl border border-line bg-surface-2 p-3 shadow-sm transition-colors hover:border-accent/50 active:cursor-grabbing"
    >
      <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-md bg-slate-700/40 px-1.5 py-0.5 text-slate-300">{task.category}</span>
        <span className={`rounded-md px-1.5 py-0.5 ring-1 ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="flex min-w-0 items-center gap-1 text-slate-400">
          <User size={12} className="shrink-0" />
          <span className="truncate">{task.assignee || 'Unassigned'}</span>
        </span>
        <span className={`flex shrink-0 items-center gap-1 ${DUE_STYLE[due]}`}>
          <CalendarDays size={12} />
          {task.dueDate ? formatDate(task.dueDate) : '—'}
          {due === 'overdue' && ' · overdue'}
        </span>
      </div>
    </article>
  )
}
