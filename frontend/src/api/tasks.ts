import type { MemberTaskInput, Task, TaskInput, Timeline, TimelineQuery } from '../types'
import { request } from './client'

const BASE = import.meta.env.VITE_TASK_API_URL as string | undefined
const json = (body: unknown) => JSON.stringify(body)

export const tasksApi = {
  list: () => request<Task[]>(BASE, '/tasks'),
  create: (input: TaskInput | MemberTaskInput) => request<Task>(BASE, '/tasks', { method: 'POST', body: json(input) }),
  update: (taskId: string, input: Partial<TaskInput | MemberTaskInput>) =>
    request<Task>(BASE, `/tasks/${encodeURIComponent(taskId)}`, { method: 'PUT', body: json(input) }),
  remove: (taskId: string) =>
    request<void>(BASE, `/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
}

export const timelineApi = {
  get: (query: TimelineQuery) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
    const qs = params.toString()
    return request<Timeline>(BASE, `/timeline${qs ? `?${qs}` : ''}`)
  },
}
