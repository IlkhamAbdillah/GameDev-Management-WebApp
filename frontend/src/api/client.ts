import { getToken, setSession } from './session'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Calls a GameVault Lambda and unwraps the `{success, data | message}` envelope. */
export async function request<T>(baseUrl: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  if (!baseUrl) {
    throw new ApiError('API URL is not configured. Copy .env.example to .env.local and fill it in.', 0)
  }
  const token = getToken()
  const headers = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init.headers,
  }
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0)
  }
  if (response.status === 204) return undefined as T

  let body: { success?: boolean; data?: T; message?: string } | undefined
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (response.status === 401 && token) {
    setSession(null) // expired or revoked: the app returns to the sign-in page
    throw new ApiError('Your session has expired. Please sign in again.', 401)
  }
  if (!response.ok || !body?.success) {
    throw new ApiError(body?.message ?? `Request failed (${response.status})`, response.status)
  }
  return body.data as T
}
