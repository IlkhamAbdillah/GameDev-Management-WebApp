import type { LoginResult, Role, User } from '../types'
import { request } from './client'

const BASE = import.meta.env.VITE_AUTH_API_URL as string | undefined
const json = (body: unknown) => JSON.stringify(body)
const id = encodeURIComponent

export interface NewUser {
  name: string
  email: string
  password: string
  role: Role
}

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResult>(BASE, '/auth/login', { method: 'POST', body: json({ email, password }) }),
  me: () => request<User>(BASE, '/auth/me'),
}

export const usersApi = {
  list: () => request<User[]>(BASE, '/users'),
  create: (input: NewUser) => request<User>(BASE, '/users', { method: 'POST', body: json(input) }),
  update: (userId: string, input: Partial<Pick<NewUser, 'name' | 'role' | 'password'>>) =>
    request<User>(BASE, `/users/${id(userId)}`, { method: 'PUT', body: json(input) }),
  remove: (userId: string) => request<void>(BASE, `/users/${id(userId)}`, { method: 'DELETE' }),
}
