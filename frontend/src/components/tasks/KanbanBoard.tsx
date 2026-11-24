import { useState } from 'react'
import { STATUS_DOT } from '../../lib/taskUi'
import { TASK_STATUSES, type Task, type TaskStatus } from '../../types'
import TaskCard from './TaskCard'

interface Props {
  tasks: Task[]
  visibleStatuses: readonly TaskStatus[]
  onOpen: (task: Task) => void
  onMove: (taskId: string, status: TaskStatus) => void
}

export default function KanbanBoard({ tasks, visibleStatuses, onOpen, onMove }: Props) {
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)
  const columns = TASK_STATUSES.filter((s) => visibleStatuses.includes(s))

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]" style={{ '--cols': columns.length } as React.CSSProperties}>
      {columns.map((status) => {
        const items = tasks.filter((t) => t.status === status)
        return (
          <section
            key={status}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(status)
            }}
            onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const id = e.dataTransfer.getData('text/plain')
              const task = tasks.find((t) => t.taskId === id)
              if (task && task.status !== status) onMove(id, status)
            }}
            className={`flex min-h-48 flex-col rounded-2xl border bg-surface p-3 transition-colors ${
              dragOver === status ? 'border-accent' : 'border-line'
            }`}
          >
            <header className="mb-3 flex items-center gap-2 px-1 text-sm font-medium">
              <span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
              {status}
              <span className="ml-auto rounded-md bg-surface-2 px-1.5 text-xs text-slate-400">{items.length}</span>
            </header>
            <div className="flex flex-1 flex-col gap-2.5">
              {items.map((task) => (
                <TaskCard key={task.taskId} task={task} onOpen={onOpen} />
              ))}
              {items.length === 0 && (
                <p className="m-auto text-xs text-slate-500">No tasks. Drop one here.</p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
