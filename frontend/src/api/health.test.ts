import { describe, expect, it } from 'vitest'
import { fetchHealth } from './health'

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('fetchHealth', () => {
  it('parses a healthy response', async () => {
    const result = await fetchHealth('https://api', reply(200, { success: true, data: { status: 'ok', checks: { tasksTable: { ok: true, ms: 12 } } } }))
    expect(result).toMatchObject({ reachable: true, httpStatus: 200, status: 'ok', checks: { tasksTable: { ok: true, ms: 12 } } })
    expect(result.error).toBeUndefined()
  })

  it('keeps per-dependency details from a 503 degraded response', async () => {
    const result = await fetchHealth('https://api', reply(503, { success: false, message: 'down', data: { status: 'degraded', checks: { bucket: { ok: false, ms: 5, error: 'AccessDenied' } } } }))
    expect(result.reachable).toBe(true)
    expect(result.status).toBe('degraded')
    expect(result.checks.bucket).toEqual({ ok: false, ms: 5, error: 'AccessDenied' })
  })

  it('reports an unexpected reply without checks', async () => {
    const result = await fetchHealth('https://api', reply(500, { success: false, message: 'Internal server error' }))
    expect(result).toMatchObject({ reachable: true, httpStatus: 500, error: 'Internal server error' })
  })

  it('reports unreachable servers and missing configuration', async () => {
    const offline = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    expect(await fetchHealth('https://api', offline)).toMatchObject({ reachable: false, error: expect.stringContaining('Cannot reach') })
    expect(await fetchHealth(undefined)).toMatchObject({ reachable: false, error: expect.stringContaining('not configured') })
  })
})
