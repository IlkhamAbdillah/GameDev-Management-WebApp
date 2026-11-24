import { describe, expect, it } from 'vitest'
import { dueState, formatDate } from './taskUi'

const now = new Date(2026, 10, 24, 15, 30) // 24 Nov 2026

describe('dueState', () => {
  it('flags overdue, due soon (<= 3 days) and normal tasks', () => {
    expect(dueState({ dueDate: '2026-11-23', status: 'To Do' }, now)).toBe('overdue')
    expect(dueState({ dueDate: '2026-11-24', status: 'To Do' }, now)).toBe('soon') // today
    expect(dueState({ dueDate: '2026-11-27', status: 'In Progress' }, now)).toBe('soon')
    expect(dueState({ dueDate: '2026-11-28', status: 'In Progress' }, now)).toBe('normal')
  })

  it('never flags finished tasks and handles missing dates', () => {
    expect(dueState({ dueDate: '2026-01-01', status: 'Done' }, now)).toBe('done')
    expect(dueState({ dueDate: '', status: 'To Do' }, now)).toBe('none')
  })
})

describe('formatDate', () => {
  it('formats a date and handles empty values', () => {
    expect(formatDate('2026-12-05')).toContain('2026')
    expect(formatDate('')).toBe('No due date')
  })
})
