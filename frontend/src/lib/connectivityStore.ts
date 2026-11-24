// State of the /connectivity page, kept at module level so it survives navigation: leaving the page
// and coming back shows the latest results, and a test that is running keeps going meanwhile.
import { fetchHealth } from '../api/health'
import { runAllChecks, type HealthFetchers } from './connectivityFlow'
import { ROUND_TRIP_STEPS, runRoundTrip, type StepResult } from './connectivityTest'
import { initialStatuses, type FlowHooks, type Statuses } from './flowModel'
import { createHopController } from './hopController'

export interface LogEntry {
  id: number
  text: string
  tone: 'info' | 'ok' | 'fail'
  at: number
}

export type Mode = 'idle' | 'checking' | 'roundtrip'

export interface ConnectivityState {
  statuses: Statuses
  log: LogEntry[]
  steps: StepResult[]
  mode: Mode
  checked: boolean // a health test has completed at least once
  roundTripDone: boolean
  warning: string
  lastRunAt: number | null // when statuses were last refreshed (by a test or a background refresh)
  refreshing: boolean // a quiet background refresh is in flight
  lastRun: 'checks' | 'roundtrip' | null // which kind of test the status bar currently reflects
}

const freshSteps = (): StepResult[] => ROUND_TRIP_STEPS.map(({ id, label }) => ({ id, label, status: 'pending' }))
const initialState = (): ConnectivityState => ({ statuses: initialStatuses(), log: [], steps: freshSteps(), mode: 'idle', checked: false, roundTripDone: false, warning: '', lastRunAt: null, refreshing: false, lastRun: null })

let state = initialState()
let logSeq = 0
const listeners = new Set<() => void>()

export const getState = () => state
export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function update(patch: Partial<ConnectivityState> | ((s: ConnectivityState) => Partial<ConnectivityState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  listeners.forEach((l) => l())
}

/** The diagram binds to this while it is on screen; animations are skipped when it is not. */
export const hopController = createHopController()

function makeHooks(animated: boolean): FlowHooks {
  return {
    hop: (from, to, options) => (animated ? hopController.hop(from, to, options) : Promise.resolve()),
    log: (entry) => update((s) => ({ log: [...s.log.slice(-199), { ...entry, id: ++logSeq, at: Date.now() }] })),
    setNode: (id, status) => update((s) => ({ statuses: { ...s.statuses, [id]: status } })),
  }
}

const ASSET_URL = import.meta.env.VITE_ASSET_API_URL as string | undefined
const TASK_URL = import.meta.env.VITE_TASK_API_URL as string | undefined
const AUTH_URL = import.meta.env.VITE_AUTH_API_URL as string | undefined
const defaultFetchers: HealthFetchers = { asset: () => fetchHealth(ASSET_URL), task: () => fetchHealth(TASK_URL), auth: () => fetchHealth(AUTH_URL) }

let refreshing: Promise<void> | null = null

/**
 * Quiet status refresh: no animation, no log, no reset to grey. The new results are applied in one go when
 * they arrive, so statuses are already filled in when the page is opened and never flicker. Concurrent calls
 * share one request; ignored while a visible test is running.
 */
export function refreshStatuses(fetchers: HealthFetchers = defaultFetchers): Promise<void> {
  if (refreshing) return refreshing
  if (state.mode !== 'idle') return Promise.resolve()
  update({ refreshing: true })
  const pending: Partial<Statuses> = {}
  const quiet: FlowHooks = { hop: async () => {}, log: () => {}, setNode: (id, status) => void (pending[id] = status) }
  refreshing = (async () => {
    try {
      await runAllChecks(fetchers, quiet)
    } finally {
      update((s) => ({ statuses: { ...s.statuses, ...pending }, checked: true, lastRunAt: Date.now(), refreshing: false }))
      refreshing = null
    }
  })()
  return refreshing
}

/** True when the statuses are missing or older than `maxAgeMs`. */
export const isStale = (maxAgeMs = 30_000) => state.lastRunAt === null || Date.now() - state.lastRunAt > maxAgeMs

/** Health test of every service. Ignored while another test is running. */
export async function startChecks(animated = true, fetchers: HealthFetchers = defaultFetchers) {
  if (refreshing) await refreshing // let a background refresh finish first
  if (state.mode !== 'idle') return
  update((s) => ({ mode: 'checking', lastRun: 'checks', log: [], statuses: { ...initialStatuses(), client: s.statuses.client } }))
  try {
    await runAllChecks(fetchers, makeHooks(animated))
  } finally {
    update({ mode: 'idle', checked: true, lastRunAt: Date.now() })
  }
}

/** Full write/upload/download test (creates and deletes temporary data). Ignored while another test is running. */
export async function startRoundTrip() {
  if (refreshing) await refreshing
  if (state.mode !== 'idle') return
  update({ mode: 'roundtrip', lastRun: 'roundtrip', roundTripDone: false, warning: '', log: [], steps: freshSteps() })
  try {
    const { cleanupWarning } = await runRoundTrip((steps) => update({ steps }), makeHooks(true))
    update({ warning: cleanupWarning ?? '' })
  } finally {
    update({ mode: 'idle', roundTripDone: true, lastRunAt: Date.now() })
  }
}

/** For tests. */
export function resetConnectivityState() {
  state = initialState()
  refreshing = null
  logSeq = 0
  listeners.forEach((l) => l())
}
