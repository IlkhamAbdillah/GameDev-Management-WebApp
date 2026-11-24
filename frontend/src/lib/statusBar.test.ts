import { describe, expect, it } from 'vitest'
import { ROUND_TRIP_STEPS, type StepResult, type StepStatus } from './connectivityTest'
import { initialStatuses, type Statuses } from './flowModel'
import { CHECK_NODES, deriveStatusBar } from './statusBar'

const steps = (...states: StepStatus[]): StepResult[] =>
  ROUND_TRIP_STEPS.map(({ id, label }, i) => ({ id, label, status: states[i] ?? 'pending' }))
const base = { statuses: initialStatuses(), steps: steps(), mode: 'idle' as const, checked: false, roundTripDone: false, warning: '', lastRun: null }
const allOk = (): Statuses => {
  const s = initialStatuses()
  for (const id of CHECK_NODES) s[id] = { state: 'ok', ms: 10 }
  return s
}

describe('deriveStatusBar', () => {
  it('asks the user to run a test when nothing has run', () => {
    expect(deriveStatusBar(base)).toMatchObject({ tone: 'neutral', expandable: false })
    expect(deriveStatusBar(base).text).toMatch(/Not checked yet/)
  })

  it('says it is checking while the very first background refresh is in flight', () => {
    expect(deriveStatusBar({ ...base, refreshing: true })).toMatchObject({ tone: 'running', text: 'Checking services…' })
    // once there are results, a refresh must not flicker the bar
    expect(deriveStatusBar({ ...base, refreshing: true, checked: true, statuses: allOk() })).toMatchObject({ tone: 'ok', text: 'All 6 checks passed' })
  })

  it('summarises health checks (and is not expandable)', () => {
    expect(deriveStatusBar({ ...base, checked: true, lastRun: 'checks', statuses: allOk() })).toMatchObject({ tone: 'ok', text: 'All 6 checks passed', expandable: false })
    const failing = allOk()
    failing.s3 = { state: 'failed', error: 'AccessDenied' }
    failing.tasksTable = { state: 'failed' }
    expect(deriveStatusBar({ ...base, checked: true, lastRun: 'checks', statuses: failing })).toMatchObject({ tone: 'fail', text: '2 of 6 checks failing' })
    expect(deriveStatusBar({ ...base, mode: 'checking', lastRun: 'checks' })).toMatchObject({ tone: 'running', text: 'Running checks…' })
  })

  it('shows the current step and progress while the round trip runs, and is expandable', () => {
    const bar = deriveStatusBar({ ...base, mode: 'roundtrip', lastRun: 'roundtrip', steps: steps('ok', 'ok', 'running') })
    expect(bar).toMatchObject({ tone: 'running', expandable: true, progress: { done: 2, total: ROUND_TRIP_STEPS.length } })
    expect(bar.text).toContain('step 3 of 9')
    expect(bar.text).toContain(ROUND_TRIP_STEPS[2].label)
  })

  it('points at the next step in the moment between two steps', () => {
    const bar = deriveStatusBar({ ...base, mode: 'roundtrip', lastRun: 'roundtrip', steps: steps('ok', 'ok') })
    expect(bar.text).toContain('step 3 of 9')
  })

  it('turns into the result once the round trip is over', () => {
    const all = steps(...ROUND_TRIP_STEPS.map(() => 'ok' as const))
    expect(deriveStatusBar({ ...base, lastRun: 'roundtrip', roundTripDone: true, steps: all })).toMatchObject({ tone: 'ok', expandable: true, text: 'Round-trip test passed · all 9 steps completed' })

    const failed = steps('ok', 'ok', 'failed', 'skipped')
    failed[2].error = 'Upload to storage failed (403)'
    const bar = deriveStatusBar({ ...base, lastRun: 'roundtrip', roundTripDone: true, steps: failed })
    expect(bar).toMatchObject({ tone: 'fail', expandable: true, detail: 'Upload to storage failed (403)' })
    expect(bar.text).toContain('failed at step 3 of 9')
  })

  it('warns when the round trip passed but temporary data could not be removed', () => {
    const all = steps(...ROUND_TRIP_STEPS.map(() => 'ok' as const))
    const bar = deriveStatusBar({ ...base, lastRun: 'roundtrip', roundTripDone: true, steps: all, warning: 'Could not delete the temporary task' })
    expect(bar).toMatchObject({ tone: 'warn', detail: 'Could not delete the temporary task' })
  })

  it('goes back to the health summary after a later health test', () => {
    const bar = deriveStatusBar({ ...base, lastRun: 'checks', checked: true, roundTripDone: true, steps: steps('ok'), statuses: allOk() })
    expect(bar).toMatchObject({ tone: 'ok', text: 'All 6 checks passed', expandable: false })
  })
})
