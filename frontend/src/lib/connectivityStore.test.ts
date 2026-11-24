import { beforeEach, describe, expect, it } from 'vitest'
import type { HealthResult } from '../api/health'
import { getState, isStale, refreshStatuses, resetConnectivityState, startChecks, subscribe } from './connectivityStore'

const ok = (checks: HealthResult['checks']): HealthResult => ({ reachable: true, httpStatus: 200, roundTripMs: 100, status: 'ok', checks })
const fetchers = {
  asset: async () => ok({ assetsTable: { ok: true, ms: 5 }, foldersTable: { ok: true, ms: 6 }, bucket: { ok: true, ms: 7 } }),
  task: async () => ok({ tasksTable: { ok: true, ms: 8 } }),
}

beforeEach(() => resetConnectivityState())

describe('connectivity store', () => {
  it('starts idle with nothing checked: the store itself never auto-runs', () => {
    const s = getState()
    expect(s).toMatchObject({ mode: 'idle', checked: false, lastRunAt: null, lastRun: null, log: [] })
    expect(s.statuses.assetsTable.state).toBe('unknown')
    expect(s.statuses.client.state).toBe('ok')
  })

  it('keeps the results after the run, so they are still there when the page is reopened', async () => {
    await startChecks(false, fetchers)
    const s = getState() // what a re-mounted page reads
    expect(s.mode).toBe('idle')
    expect(s.checked).toBe(true)
    expect(s.lastRun).toBe('checks')
    expect(s.lastRunAt).toBeTypeOf('number')
    expect(s.statuses.assetsTable).toEqual({ state: 'ok', ms: 5 })
    expect(s.statuses.tasksTable).toEqual({ state: 'ok', ms: 8 })
    expect(s.log.length).toBeGreaterThan(0)
  })

  it('notifies subscribers while it runs and ignores a second start during a run', async () => {
    let notifications = 0
    const unsubscribe = subscribe(() => notifications++)
    const first = startChecks(false, fetchers)
    expect(getState().mode).toBe('checking')
    await startChecks(false, fetchers) // ignored: returns immediately, does not start a second run
    expect(getState().mode).toBe('checking')
    await first
    unsubscribe()
    expect(notifications).toBeGreaterThan(3)
    expect(getState().mode).toBe('idle')
  })

  it('returns to idle even if the check throws', async () => {
    await startChecks(false, { asset: async () => { throw new Error('boom') }, task: async () => ok({}) }).catch(() => {})
    expect(getState().mode).toBe('idle')
  })
})

describe('quiet background refresh', () => {
  const healthy = () => ({
    asset: async () => ok({ assetsTable: { ok: true, ms: 5 }, foldersTable: { ok: true, ms: 6 }, bucket: { ok: true, ms: 7 } }),
    task: async () => ok({ tasksTable: { ok: true, ms: 8 } }),
  })

  it('fills in every status without a visible run: no log, no mode change, no animation', async () => {
    await refreshStatuses(healthy())
    const s = getState()
    expect(s).toMatchObject({ mode: 'idle', checked: true, refreshing: false, lastRun: null })
    expect(s.log).toEqual([])
    expect(s.statuses.s3).toEqual({ state: 'ok', ms: 7 })
    expect(s.statuses.tasksTable).toEqual({ state: 'ok', ms: 8 })
    expect(isStale()).toBe(false)
  })

  it('never resets known statuses to grey while the refresh is in flight, then updates them in one go', async () => {
    await refreshStatuses(healthy())
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const slow = { asset: async () => (await gate, ok({ assetsTable: { ok: false, ms: 9, error: 'AccessDeniedException' }, foldersTable: { ok: true, ms: 6 }, bucket: { ok: true, ms: 7 } })), task: async () => ok({ tasksTable: { ok: true, ms: 8 } }) }
    const pending = refreshStatuses(slow)
    expect(getState().refreshing).toBe(true)
    expect(getState().statuses.assetsTable).toEqual({ state: 'ok', ms: 5 }) // old value still shown
    release()
    await pending
    expect(getState().statuses.assetsTable).toMatchObject({ state: 'failed', error: 'AccessDeniedException' })
    expect(getState().refreshing).toBe(false)
  })

  it('shares one request between concurrent callers (e.g. app load + page open)', async () => {
    let calls = 0
    const counting = { asset: async () => (calls++, ok({ assetsTable: { ok: true, ms: 1 }, foldersTable: { ok: true, ms: 1 }, bucket: { ok: true, ms: 1 } })), task: async () => ok({ tasksTable: { ok: true, ms: 1 } }) }
    await Promise.all([refreshStatuses(counting), refreshStatuses(counting)])
    expect(calls).toBe(1)
  })

  it('is considered stale only when missing or older than the limit', async () => {
    expect(isStale()).toBe(true)
    await refreshStatuses(healthy())
    expect(isStale()).toBe(false)
    expect(isStale(-1)).toBe(true)
  })

  it('waits for a refresh in flight before a visible test starts', async () => {
    const refresh = refreshStatuses(healthy())
    await startChecks(false, healthy())
    await refresh
    expect(getState()).toMatchObject({ mode: 'idle', lastRun: 'checks', refreshing: false })
  })
})
