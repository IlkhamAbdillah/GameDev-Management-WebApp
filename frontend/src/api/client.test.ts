import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client'

const reply = (status: number, body?: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })))

afterEach(() => vi.unstubAllGlobals())

describe('request', () => {
  it('unwraps the success envelope', async () => {
    reply(200, { success: true, data: { id: 1 } })
    await expect(request('https://api', '/x')).resolves.toEqual({ id: 1 })
  })

  it('returns undefined for 204 No Content', async () => {
    reply(204)
    await expect(request('https://api', '/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('turns an error envelope into an ApiError with status and message', async () => {
    reply(404, { success: false, message: 'Task not found' })
    const error = await request('https://api', '/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ message: 'Task not found', status: 404 })
  })

  it('handles non-JSON error bodies and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })))
    await expect(request('https://api', '/x')).rejects.toMatchObject({ status: 502 })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(request('https://api', '/x')).rejects.toThrow(/Cannot reach the server/)
  })

  it('fails clearly when the API URL is not configured', async () => {
    await expect(request(undefined, '/x')).rejects.toThrow(/not configured/)
  })

  it('sends JSON content-type only when there is a body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await request('https://api', '/x', { method: 'POST', body: '{}' })
    await request('https://api', '/x')
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][1].headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(calls[1][1].headers).toBeUndefined()
  })
})
