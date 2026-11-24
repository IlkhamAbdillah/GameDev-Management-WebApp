const DAY_MS = 86_400_000

export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

export function todayIso(): string {
  return toIso(new Date())
}

export function addDays(iso: string, days: number): string {
  const date = parseLocalDate(iso)
  date.setDate(date.getDate() + days)
  return toIso(date)
}

/** Whole days from a to b (b - a). Rounds to absorb DST shifts. */
export function diffDays(a: string, b: string): number {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / DAY_MS)
}

/** Monday of the week containing the given date. */
export function startOfWeek(iso: string): string {
  const day = parseLocalDate(iso).getDay() // 0 = Sunday
  return addDays(iso, -((day + 6) % 7))
}
