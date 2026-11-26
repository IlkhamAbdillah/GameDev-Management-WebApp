import type { Asset, Task, TaskPriority, User } from '../types'
import { addDays, startOfWeek } from './dates'

/** Monday..Sunday (local dates) of the week containing `today`. */
export function weekRange(today: string): { start: string; end: string } {
  const start = startOfWeek(today)
  return { start, end: addDays(start, 6) }
}

/** Bar range of a task: a single date is a one-day range; no dates -> null (unscheduled). */
function range(task: Pick<Task, 'startDate' | 'dueDate'>): { start: string; end: string } | null {
  const start = task.startDate || task.dueDate
  const end = task.dueDate || task.startDate
  return start && end ? { start, end } : null
}

const OPEN = new Set<Task['status']>(['To Do', 'In Progress'])
const PRIORITY_RANK: Record<TaskPriority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

const byDueThenPriority = (a: Task, b: Task) =>
  (range(a)?.end ?? '').localeCompare(range(b)?.end ?? '') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]

/** Open (To Do / In Progress) tasks that run during the week of `today`, plus overdue ones. */
export function tasksThisWeek(tasks: Task[], today: string): Task[] {
  const week = weekRange(today)
  return tasks
    .filter((t) => {
      const r = range(t)
      if (!OPEN.has(t.status) || !r) return false
      return r.end < today || (r.start <= week.end && r.end >= week.start)
    })
    .sort(byDueThenPriority)
}

/** Open tasks that run during next week (not already shown in this week's list). */
export function tasksNextWeek(tasks: Task[], today: string): Task[] {
  const next = weekRange(addDays(weekRange(today).end, 1))
  const current = new Set(tasksThisWeek(tasks, today).map((t) => t.taskId))
  return tasks
    .filter((t) => {
      const r = range(t)
      return OPEN.has(t.status) && r && !current.has(t.taskId) && r.start <= next.end && r.end >= next.start
    })
    .sort(byDueThenPriority)
}

export type ReviewItem =
  | { kind: 'task'; id: string; title: string; who: string; since: string; task: Task }
  | { kind: 'asset'; id: string; title: string; who: string; since: string; asset: Asset }

/** Tasks "In Review" and assets "Review", longest waiting first. */
export function reviewItems(tasks: Task[], assets: Asset[]): ReviewItem[] {
  const items: ReviewItem[] = [
    ...tasks
      .filter((t) => t.status === 'In Review')
      .map((t) => ({ kind: 'task' as const, id: t.taskId, title: t.title, who: t.assignee, since: t.updatedAt, task: t })),
    ...assets
      .filter((a) => a.status === 'Review')
      .map((a) => ({ kind: 'asset' as const, id: a.assetId, title: a.assetName, who: a.assignedTo, since: a.updatedAt, asset: a })),
  ]
  return items.sort((a, b) => a.since.localeCompare(b.since))
}

/** What belongs to a member: tasks linked to their account, assets whose assignee is their name. */
export function ownTasks(tasks: Task[], user: User): Task[] {
  return tasks.filter((t) => t.assigneeId === user.userId)
}

export function ownAssets(assets: Asset[], user: User): Asset[] {
  const name = user.name.trim().toLowerCase()
  return assets.filter((a) => a.assignedTo.trim().toLowerCase() === name)
}

export interface Summary {
  open: number
  overdue: number
  completionRate: number
}

export function summarize(tasks: Task[], today: string): Summary {
  const done = tasks.filter((t) => t.status === 'Done').length
  return {
    open: tasks.filter((t) => t.status !== 'Done').length,
    overdue: tasks.filter((t) => t.status !== 'Done' && t.dueDate && t.dueDate < today).length,
    completionRate: tasks.length ? Math.round((done * 100) / tasks.length) : 0,
  }
}

export interface Workload {
  userId: string
  name: string
  open: number
  overdue: number
}

/** Open and overdue tasks per account (members first, then by load). Unlinked tasks are not counted. */
export function workload(tasks: Task[], users: User[], today: string): Workload[] {
  return users
    .map((u) => {
      const mine = tasks.filter((t) => t.assigneeId === u.userId && t.status !== 'Done')
      return {
        userId: u.userId,
        name: u.name,
        open: mine.length,
        overdue: mine.filter((t) => t.dueDate && t.dueDate < today).length,
        member: u.role === 'member',
      }
    })
    .sort((a, b) => Number(b.member) - Number(a.member) || b.open - a.open || a.name.localeCompare(b.name))
    .map(({ member: _member, ...rest }) => rest)
}
