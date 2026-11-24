import { describe, expect, it } from 'vitest'
import { API_GROUPS } from './apiSpec'

const endpoints = API_GROUPS.flatMap((g) => g.endpoints)

describe('API reference data', () => {
  it('has no duplicate method/path/api combinations', () => {
    const keys = endpoints.map((e) => `${e.api} ${e.method} ${e.path}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('documents every route the frontend calls', () => {
    const has = (method: string, path: string) => endpoints.some((e) => e.method === method && e.path === path)
    for (const [method, path] of [
      ['GET', '/assets'], ['POST', '/assets'], ['PUT', '/assets/{assetId}'], ['DELETE', '/assets/{assetId}'],
      ['POST', '/assets/{assetId}/upload-url'], ['DELETE', '/assets/{assetId}/file'],
      ['GET', '/folders'], ['POST', '/folders'], ['PUT', '/folders/{folderId}'], ['DELETE', '/folders/{folderId}'],
      ['GET', '/tasks'], ['POST', '/tasks'], ['PUT', '/tasks/{taskId}'], ['DELETE', '/tasks/{taskId}'],
      ['GET', '/timeline'], ['GET', '/health'],
      ['POST', '/auth/login'], ['GET', '/auth/me'], ['POST', '/auth/password'],
      ['GET', '/users'], ['POST', '/users'], ['PUT', '/users/{userId}'], ['DELETE', '/users/{userId}'],
    ]) expect(has(method, path), `${method} ${path}`).toBe(true)
  })

  it('uses 204 for deletes and 201 for creates', () => {
    for (const e of endpoints) {
      if (e.method === 'DELETE') expect(e.status).toBe('204')
      if (e.method === 'POST' && !/upload-url|\/auth\//.test(e.path)) expect(e.status).toBe('201')
    }
  })
})
