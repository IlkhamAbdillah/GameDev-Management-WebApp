import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client'
import { getSession, setSession } from './session'
import type { User } from '../types'

const reply = (status: number, body?: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status })))

afterEach(() => {
  vi.unstubAllGlobals()
  setSession(null)
})

const user: User = { userId: 'u1', name: 'Pat', email: 'p@x.co', role: 'member', createdAt: '', updatedAt: '' }
const signIn = (expiresAt = Date.now() / 1000 + 3600) => setSession({ token: 'tok123', expiresAt, user })

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

  it('sends the bearer token when signed in and no Authorization header when not', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await request('https://api', '/x')
    signIn()
    await request('https://api', '/x')
    await request('https://api', '/x', { method: 'POST', body: '{}' })
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][1].headers).toBeUndefined()
    expect(calls[1][1].headers).toEqual({ Authorization: 'Bearer tok123' })
    expect(calls[2][1].headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok123' })
  })

  it('signs out when the server answers 401 to an authenticated request', async () => {
    signIn()
    reply(401, { success: false, message: 'Invalid or expired token' })
    await expect(request('https://api', '/x')).rejects.toMatchObject({ status: 401, message: /session has expired/ })
    expect(getSession()).toBeNull()
  })

  it('keeps the server message for a 401 without a session (wrong password)', async () => {
    reply(401, { success: false, message: 'Invalid email or password' })
    await expect(request('https://api', '/auth/login', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    })
  })

  it('does not treat an expired stored session as signed in', async () => {
    signIn(Date.now() / 1000 - 5)
    expect(getSession()).toBeNull()
  })

  it('does not sign out on a 403', async () => {
    signIn()
    reply(403, { success: false, message: 'You do not have permission to do this' })
    await expect(request('https://api', '/x')).rejects.toMatchObject({ status: 403 })
    expect(getSession()?.token).toBe('tok123')
  })
})
