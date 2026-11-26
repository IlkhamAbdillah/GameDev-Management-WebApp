import { describe, expect, it } from 'vitest'
import type { Asset, Task, User } from '../types'
import { ownAssets, ownTasks, reviewItems, summarize, tasksNextWeek, tasksThisWeek, weekRange, workload } from './dashboard'

const TODAY = '2026-11-26' // Thursday; week = Mon 23 .. Sun 29 Nov

function task(over: Partial<Task>): Task {
  return {
    taskId: over.title ?? 't', title: 't', description: '', assignee: '', assigneeId: '', category: 'Other',
    priority: 'Medium', status: 'To Do', startDate: '', dueDate: '', createdAt: '', updatedAt: '', ...over,
  }
}

function asset(over: Partial<Asset>): Asset {
  return {
    assetId: over.assetName ?? 'a', assetName: 'a', assetType: 'Props', description: '', assignedTo: '', status: 'Planned',
    s3Key: '', createdAt: '', updatedAt: '', fileName: '', downloadUrl: '', previewUrl: '', previewKind: '', folderId: '', ...over,
  }
}

const member: User = { userId: 'u1', name: 'Rina', email: 'r@x.dev', role: 'member' } as User

describe('weekRange', () => {
  it('is Monday..Sunday of the current week', () => {
    expect(weekRange(TODAY)).toEqual({ start: '2026-11-23', end: '2026-11-29' })
    expect(weekRange('2026-11-29')).toEqual({ start: '2026-11-23', end: '2026-11-29' }) // Sunday
  })
})

describe('tasksThisWeek', () => {
  const tasks = [
    task({ title: 'due friday', dueDate: '2026-11-27' }),
    task({ title: 'spans the week', startDate: '2026-11-20', dueDate: '2026-12-05', status: 'In Progress' }),
    task({ title: 'overdue', dueDate: '2026-11-10' }),
    task({ title: 'next week', startDate: '2026-12-01', dueDate: '2026-12-03' }),
    task({ title: 'done', dueDate: '2026-11-25', status: 'Done' }),
    task({ title: 'in review', dueDate: '2026-11-25', status: 'In Review' }),
    task({ title: 'undated' }),
    task({ title: 'start only', startDate: '2026-11-29', priority: 'Critical' }),
  ]

  it('keeps open tasks that touch this week, plus overdue ones, sorted by end date', () => {
    expect(tasksThisWeek(tasks, TODAY).map((t) => t.title)).toEqual(['overdue', 'due friday', 'start only', 'spans the week'])
  })

  it('next week excludes what is already in this week', () => {
    expect(tasksNextWeek(tasks, TODAY).map((t) => t.title)).toEqual(['next week'])
  })

  it('sorts equal end dates by priority', () => {
    const same = [task({ title: 'low', dueDate: '2026-11-27', priority: 'Low' }), task({ title: 'crit', dueDate: '2026-11-27', priority: 'Critical' })]
    expect(tasksThisWeek(same, TODAY).map((t) => t.title)).toEqual(['crit', 'low'])
  })
})

describe('reviewItems', () => {
  it('merges tasks In Review and assets in Review, longest waiting first', () => {
    const items = reviewItems(
      [task({ title: 'new', status: 'In Review', updatedAt: '2026-11-25T10:00:00Z' }), task({ title: 'wip', status: 'In Progress' })],
      [asset({ assetName: 'old', status: 'Review', updatedAt: '2026-11-20T10:00:00Z' }), asset({ assetName: 'done', status: 'Completed' })],
    )
    expect(items.map((i) => [i.kind, i.title])).toEqual([['asset', 'old'], ['task', 'new']])
  })
})

describe('ownership', () => {
  it('matches tasks by account id and assets by assignee name', () => {
    expect(ownTasks([task({ title: 'mine', assigneeId: 'u1', assignee: 'Someone' }), task({ title: 'other', assignee: 'Rina' })], member).map((t) => t.title)).toEqual(['mine'])
    expect(ownAssets([asset({ assetName: 'mine', assignedTo: ' rina ' }), asset({ assetName: 'other', assignedTo: 'Budi' })], member).map((a) => a.assetName)).toEqual(['mine'])
  })
})

describe('summarize and workload', () => {
  const tasks = [
    task({ title: 'a', assigneeId: 'u1', status: 'Done' }),
    task({ title: 'b', assigneeId: 'u1', dueDate: '2026-11-01' }),
    task({ title: 'c', assigneeId: 'u2' }),
    task({ title: 'd', assigneeId: 'u2', dueDate: '2026-12-30' }),
  ]

  it('counts open, overdue and completion', () => {
    expect(summarize(tasks, TODAY)).toEqual({ open: 3, overdue: 1, completionRate: 25 })
    expect(summarize([], TODAY)).toEqual({ open: 0, overdue: 0, completionRate: 0 })
  })

  it('lists members first, by open tasks', () => {
    const users = [
      { userId: 'pm', name: 'Boss', role: 'project_manager' },
      member,
      { userId: 'u2', name: 'Adi', role: 'member' },
    ] as User[]
    expect(workload(tasks, users, TODAY)).toEqual([
      { userId: 'u2', name: 'Adi', open: 2, overdue: 0 },
      { userId: 'u1', name: 'Rina', open: 1, overdue: 1 },
      { userId: 'pm', name: 'Boss', open: 0, overdue: 0 },
    ])
  })
})
