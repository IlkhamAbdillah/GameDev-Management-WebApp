import type { Task, TaskPriority, TaskStatus } from '../types'

export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  Low: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  Medium: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  High: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  Critical: 'bg-red-500/15 text-red-300 ring-red-500/30',
}

export const STATUS_DOT: Record<TaskStatus, string> = {
  'To Do': 'bg-slate-400',
  'In Progress': 'bg-blue-400',
  'In Review': 'bg-orange-400',
  Done: 'bg-green-400',
}

const DAY_MS = 86_400_000

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(iso: string): string {
  if (!iso) return 'No due date'
  return parseLocalDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export type DueState = 'none' | 'overdue' | 'soon' | 'normal' | 'done'

/** Overdue/soon (<= 3 days) highlighting; finished tasks are never flagged. */
export function dueState(task: Pick<Task, 'dueDate' | 'status'>, now = new Date()): DueState {
  if (!task.dueDate) return 'none'
  if (task.status === 'Done') return 'done'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((parseLocalDate(task.dueDate).getTime() - today.getTime()) / DAY_MS)
  if (days < 0) return 'overdue'
  return days <= 3 ? 'soon' : 'normal'
}

export const DUE_STYLE: Record<DueState, string> = {
  none: 'text-slate-500',
  overdue: 'text-red-400',
  soon: 'text-amber-300',
  normal: 'text-slate-400',
  done: 'text-slate-500',
}
