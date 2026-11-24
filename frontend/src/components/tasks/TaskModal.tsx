import { Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type MemberTaskInput,
  type Task,
  type TaskInput,
  type User,
} from '../../types'
import { useAuth } from '../../lib/authContext'
import { canEditTask } from '../../lib/permissions'
import { useEscapeKey } from '../../lib/useEscapeKey'

interface Props {
  task: Task | null // null => create
  onClose: () => void
  /** Project managers send everything; members only the fields the server lets them change. */
  onSave: (input: TaskInput | MemberTaskInput) => Promise<void>
  onDelete?: () => Promise<void>
  /** Accounts to pick an assignee from (project managers only). */
  users?: User[]
}

const UNLINKED = '__unlinked__' // a free-text assignee that is not an account

const EMPTY: TaskInput = {
  title: '',
  description: '',
  assignee: '',
  assigneeId: '',
  category: 'Programming',
  priority: 'Medium',
  status: 'To Do',
  startDate: '',
  dueDate: '',
}

const field =
  'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent'

export default function TaskModal({ task, onClose, onSave, onDelete, users = [] }: Props) {
  useEscapeKey(onClose)
  const { user, isManager } = useAuth()
  const readOnly = task !== null && !canEditTask(user, task)
  // Assignee picker: null = untouched, so it follows the task (and the user list once it has loaded).
  const [pick, setPick] = useState<string | null>(null)
  const initialPick = task?.assigneeId && users.some((u) => u.userId === task.assigneeId) ? task.assigneeId : task?.assignee ? UNLINKED : ''
  const assigneeKey = pick ?? initialPick
  const [form, setForm] = useState<TaskInput>(
    task
      ? {
          title: task.title,
          description: task.description,
          assignee: task.assignee,
          assigneeId: task.assigneeId ?? '',
          category: task.category,
          priority: task.priority,
          status: task.status,
          startDate: task.startDate,
          dueDate: task.dueDate,
        }
      : EMPTY,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Title is required')
    if (form.startDate && form.dueDate && form.dueDate < form.startDate) {
      return setError('Due date must not be before the start date')
    }
    if (!isManager) {
      const { title, description, category, priority, status } = form
      return void run(() => onSave({ title, description, category, priority, status }))
    }
    const chosen = users.find((u) => u.userId === assigneeKey)
    const assignment = chosen
      ? { assignee: chosen.name, assigneeId: chosen.userId }
      : assigneeKey === UNLINKED
        ? { assignee: task?.assignee ?? '', assigneeId: '' }
        : { assignee: '', assigneeId: '' }
    void run(() => onSave({ ...form, ...assignment }))
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-lg space-y-4 overflow-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{task ? (readOnly ? 'Task details (view only)' : 'Task details') : 'New task'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <label className="block space-y-1 text-xs text-slate-400">
          Title
          <input autoFocus disabled={readOnly} className={field} value={form.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="block space-y-1 text-xs text-slate-400">
          Description
          <textarea disabled={readOnly} className={field} rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs text-slate-400">
            Status
            <select disabled={readOnly} className={field} value={form.status} onChange={(e) => set('status', e.target.value as TaskInput['status'])}>
              {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            Priority
            <select disabled={readOnly} className={field} value={form.priority} onChange={(e) => set('priority', e.target.value as TaskInput['priority'])}>
              {TASK_PRIORITIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            Category
            <select disabled={readOnly} className={field} value={form.category} onChange={(e) => set('category', e.target.value as TaskInput['category'])}>
              {TASK_CATEGORIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            Assignee
            {isManager ? (
              <select className={field} value={assigneeKey} onChange={(e) => setPick(e.target.value)}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}
                {task?.assignee && assigneeKey === UNLINKED && <option value={UNLINKED}>{task.assignee} (no account)</option>}
              </select>
            ) : (
              <input disabled className={field} value={task ? task.assignee || 'Unassigned' : (user?.name ?? '')} readOnly />
            )}
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            Start date
            <input type="date" disabled={!isManager} className={field} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            Due date
            <input type="date" disabled={!isManager} className={field} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </label>
        </div>

        {!isManager && (
          <p className="text-[11px] text-slate-500">
            {readOnly
              ? 'You can only edit tasks assigned to you.'
              : 'Dates and assignees are set by a project manager. New tasks you create are assigned to you.'}
          </p>
        )}
        {task && (
          <p className="text-[11px] text-slate-500">
            Created {new Date(task.createdAt).toLocaleString()} · Updated {new Date(task.updatedAt).toLocaleString()}
          </p>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {task && onDelete && isManager ? (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">Delete this task?</span>
                <button type="button" disabled={busy} onClick={() => void run(onDelete)} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium hover:bg-red-500 disabled:opacity-50">
                  Delete
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-3 py-1.5 text-slate-300 hover:bg-surface-2">
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10">
                <Trash2 size={15} /> Delete
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-surface-2">
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
              {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>}
          </div>
        </div>
      </form>
    </div>
  )
}
