import { Plus, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usersApi } from '../api/auth'
import { tasksApi } from '../api/tasks'
import PageHeader from '../components/PageHeader'
import KanbanBoard from '../components/tasks/KanbanBoard'
import TaskModal from '../components/tasks/TaskModal'
import { useAuth } from '../lib/authContext'
import { canEditTask } from '../lib/permissions'
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type MemberTaskInput,
  type Task,
  type TaskInput,
  type TaskStatus,
  type User,
} from '../types'

const select =
  'rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent'

export default function TasksPage() {
  const { user, isManager } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ task: Task | null } | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [category, setCategory] = useState('')
  const [assignee, setAssignee] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setTasks(await tasksApi.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Only project managers pick assignees, and only they may list accounts.
  useEffect(() => {
    if (isManager) usersApi.list().then(setUsers).catch(() => setUsers([]))
  }, [isManager])

  const assignees = useMemo(
    () => [...new Set(tasks.map((t) => t.assignee).filter(Boolean))].sort(),
    [tasks],
  )

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return tasks.filter(
      (t) =>
        (!needle || t.title.toLowerCase().includes(needle)) &&
        (!priority || t.priority === priority) &&
        (!category || t.category === category) &&
        (!assignee || t.assignee === assignee),
    )
  }, [tasks, search, priority, category, assignee])

  const visibleStatuses: readonly TaskStatus[] = status ? [status as TaskStatus] : TASK_STATUSES

  async function move(taskId: string, next: TaskStatus) {
    const previous = tasks
    setTasks((all) => all.map((t) => (t.taskId === taskId ? { ...t, status: next } : t)))
    try {
      const saved = await tasksApi.update(taskId, { status: next })
      setTasks((all) => all.map((t) => (t.taskId === taskId ? saved : t)))
    } catch (err) {
      setTasks(previous) // roll back the optimistic move
      setError(err instanceof Error ? err.message : 'Failed to move task')
    }
  }

  async function save(input: TaskInput | MemberTaskInput) {
    if (modal?.task) {
      const saved = await tasksApi.update(modal.task.taskId, input)
      setTasks((all) => all.map((t) => (t.taskId === saved.taskId ? saved : t)))
    } else {
      const created = await tasksApi.create(input)
      setTasks((all) => [...all, created])
    }
    setModal(null)
  }

  async function remove() {
    if (!modal?.task) return
    await tasksApi.remove(modal.task.taskId)
    const id = modal.task.taskId
    setTasks((all) => all.filter((t) => t.taskId !== id))
    setModal(null)
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Tasks"
        subtitle={`${filtered.length} of ${tasks.length} tasks`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => void load()} aria-label="Refresh" className="rounded-lg border border-line bg-surface p-2 text-slate-300 hover:bg-surface-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setModal({ task: null })} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:brightness-110">
              <Plus size={16} /> New task
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1 md:max-w-xs">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title" className={`${select} w-full pl-9`} />
        </div>
        <select className={select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={select} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={select} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {TASK_CATEGORIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={select} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Filter by assignee">
          <option value="">All assignees</option>
          {assignees.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError('')} className="text-xs underline">Dismiss</button>
        </div>
      )}

      {loading && tasks.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400">Loading tasks…</p>
      ) : (
        <KanbanBoard tasks={filtered} visibleStatuses={visibleStatuses} onOpen={(task) => setModal({ task })} onMove={(id, s) => void move(id, s)} canMove={(task) => canEditTask(user, task)} />
      )}

      {modal && (
        <TaskModal key={modal.task?.taskId ?? 'new'} task={modal.task} onClose={() => setModal(null)} onSave={save} onDelete={modal.task && isManager ? remove : undefined} users={users} />
      )}
    </div>
  )
}
