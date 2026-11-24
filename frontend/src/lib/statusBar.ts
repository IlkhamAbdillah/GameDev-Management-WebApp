import type { ConnectivityState } from './connectivityStore'
import type { NodeId } from './flowModel'

// The six things the health checks prove.
export const CHECK_NODES: NodeId[] = ['assetUrl', 'assetsTable', 'foldersTable', 's3', 'taskUrl', 'tasksTable']

export type BarTone = 'neutral' | 'running' | 'ok' | 'fail' | 'warn'

export interface StatusBarModel {
  tone: BarTone
  text: string
  detail?: string
  /** The round-trip step list can be opened (a round-trip test is running or was the last test run). */
  expandable: boolean
  progress?: { done: number; total: number }
}

type Input = Pick<ConnectivityState, 'statuses' | 'steps' | 'mode' | 'checked' | 'roundTripDone' | 'warning' | 'lastRun'> & { refreshing?: boolean }

/**
 * One status line for the whole page. While a round trip runs it shows the current step; when the test is
 * over it turns into the result; otherwise it summarises the latest health checks.
 */
export function deriveStatusBar(s: Input): StatusBarModel {
  const total = s.steps.length
  const done = s.steps.filter((x) => x.status === 'ok').length
  const roundTrip = s.lastRun === 'roundtrip'

  if (s.mode === 'roundtrip') {
    const running = s.steps.findIndex((x) => x.status === 'running')
    const n = running >= 0 ? running + 1 : Math.min(done + 1, total)
    return { tone: 'running', text: `Round-trip test · step ${n} of ${total}: ${s.steps[n - 1]?.label ?? ''}`, expandable: true, progress: { done, total } }
  }
  if (s.mode === 'checking') return { tone: 'running', text: 'Running checks…', expandable: false }

  if (roundTrip && s.roundTripDone) {
    const failedAt = s.steps.findIndex((x) => x.status === 'failed')
    if (failedAt >= 0) {
      return { tone: 'fail', text: `Round-trip test failed at step ${failedAt + 1} of ${total}: ${s.steps[failedAt].label}`, detail: [s.steps[failedAt].error, s.warning].filter(Boolean).join(' · ') || undefined, expandable: true, progress: { done, total } }
    }
    if (s.warning) return { tone: 'warn', text: `Round-trip test passed (${done} of ${total} steps), but cleanup needs attention`, detail: s.warning, expandable: true, progress: { done, total } }
    return { tone: 'ok', text: `Round-trip test passed · all ${total} steps completed`, expandable: true, progress: { done, total } }
  }

  if (!s.checked && s.refreshing) return { tone: 'running', text: 'Checking services…', expandable: false }
  if (!s.checked) return { tone: 'neutral', text: 'Not checked yet. Press Run test to check every service.', expandable: false }
  const failing = CHECK_NODES.filter((id) => s.statuses[id].state === 'failed').length
  const passing = CHECK_NODES.filter((id) => s.statuses[id].state === 'ok').length
  if (failing === 0 && passing === CHECK_NODES.length) return { tone: 'ok', text: `All ${CHECK_NODES.length} checks passed`, expandable: false }
  return { tone: 'fail', text: `${failing} of ${CHECK_NODES.length} checks failing`, expandable: false }
}
