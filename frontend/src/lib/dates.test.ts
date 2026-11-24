import { describe, expect, it } from 'vitest'
import { addDays, diffDays, startOfWeek, toIso } from './dates'

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29') // leap year
  })

  it('computes whole-day differences', () => {
    expect(diffDays('2026-11-24', '2026-11-24')).toBe(0)
    expect(diffDays('2026-11-24', '2026-12-04')).toBe(10)
    expect(diffDays('2026-12-04', '2026-11-24')).toBe(-10)
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31)
  })

  it('finds the Monday of a week', () => {
    expect(startOfWeek('2026-11-24')).toBe('2026-11-23') // Tuesday -> Monday
    expect(startOfWeek('2026-11-23')).toBe('2026-11-23')
    expect(startOfWeek('2026-11-29')).toBe('2026-11-23') // Sunday belongs to the previous Monday
  })

  it('formats local dates as YYYY-MM-DD', () => {
    expect(toIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
