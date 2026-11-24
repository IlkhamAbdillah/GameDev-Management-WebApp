export interface HealthCheck {
  ok: boolean
  ms: number
  error?: string // AWS error code only
}

export interface HealthResult {
  /** The browser got an HTTP response (so the URL, network and CORS all work). */
  reachable: boolean
  httpStatus?: number
  roundTripMs: number
  status?: 'ok' | 'degraded'
  checks: Record<string, HealthCheck>
  error?: string
}

const TIMEOUT_MS = 15_000

/** Calls GET {base}/health. Unlike the normal client it keeps the body of a 503 (degraded) reply. */
export async function fetchHealth(baseUrl: string | undefined, fetchImpl: typeof fetch = fetch): Promise<HealthResult> {
  if (!baseUrl) return { reachable: false, roundTripMs: 0, checks: {}, error: 'API URL is not configured (see .env.example)' }

  const started = performance.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${baseUrl}/health`, { signal: controller.signal })
    const roundTripMs = Math.round(performance.now() - started)
    let body: { message?: string; data?: { status?: 'ok' | 'degraded'; checks?: Record<string, HealthCheck> } } | undefined
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    const checks = body?.data?.checks ?? {}
    const hasChecks = Object.keys(checks).length > 0
    return {
      reachable: true,
      httpStatus: response.status,
      roundTripMs,
      status: body?.data?.status,
      checks,
      error: hasChecks ? undefined : (body?.message ?? `Unexpected response (HTTP ${response.status})`),
    }
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    return {
      reachable: false,
      roundTripMs: Math.round(performance.now() - started),
      checks: {},
      error: timedOut ? 'Timed out after 15 s' : 'Cannot reach the server (network error, wrong URL or CORS)',
    }
  } finally {
    clearTimeout(timer)
  }
}
