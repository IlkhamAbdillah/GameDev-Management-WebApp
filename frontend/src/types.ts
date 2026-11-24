export const TASK_STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'] as const
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const
export const TASK_CATEGORIES = [
  'Programming',
  'Art',
  'Design',
  'Audio',
  'Testing',
  'Documentation',
  'Other',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskCategory = (typeof TASK_CATEGORIES)[number]

export interface Task {
  taskId: string
  title: string
  description: string
  assignee: string
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  startDate: string
  dueDate: string
  createdAt: string
  updatedAt: string
}

export type TaskInput = Pick<
  Task,
  'title' | 'description' | 'assignee' | 'category' | 'priority' | 'status' | 'startDate' | 'dueDate'
>
