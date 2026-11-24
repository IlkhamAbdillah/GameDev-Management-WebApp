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
  /** Account the task is assigned to; absent/empty for unassigned or free-text assignees. */
  assigneeId?: string
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
  'title' | 'description' | 'assignee' | 'assigneeId' | 'category' | 'priority' | 'status' | 'startDate' | 'dueDate'
>

/** Members may not send dates or assignees; the server rejects those fields with 403. */
export type MemberTaskInput = Pick<TaskInput, 'title' | 'description' | 'category' | 'priority' | 'status'>

export interface TimelineEntry {
  taskId: string
  title: string
  assignee: string
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  startDate: string
  dueDate: string
  /** Effective bar range (a task with a single date is a one-day bar). */
  start: string
  end: string
}

export interface TimelineStats {
  total: number
  done: number
  completionRate: number
  byStatus: Record<TaskStatus, number>
  overdue: number
  dueSoon: number
  unscheduled: number
}

export interface Timeline {
  tasks: TimelineEntry[]
  stats: TimelineStats
}

export interface TimelineQuery {
  startDate?: string
  endDate?: string
  status?: string
  category?: string
  assignee?: string
}

export const ASSET_TYPES = ['Character', 'Environment', 'Props', 'Animation', 'Audio', 'UI', 'VFX', 'Other'] as const
export const ASSET_STATUSES = ['Planned', 'In Progress', 'Review', 'Completed'] as const

export type AssetType = (typeof ASSET_TYPES)[number]
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export interface Asset {
  assetId: string
  assetName: string
  assetType: AssetType
  description: string
  assignedTo: string
  status: AssetStatus
  s3Key: string
  createdAt: string
  updatedAt: string
  // computed by the API (short-lived pre-signed URLs, never stored)
  fileName: string
  downloadUrl: string
  previewUrl: string
  previewKind: 'image' | 'audio' | 'model' | ''
  folderId: string // '' = root
}

export type AssetInput = Pick<Asset, 'assetName' | 'assetType' | 'description' | 'assignedTo' | 'status' | 'folderId'>

export interface Folder {
  folderId: string
  name: string
  parentId: string // '' = root
  createdAt: string
  updatedAt: string
}

export interface UploadTicket {
  uploadUrl: string
  method: 'PUT'
  headers: Record<string, string>
  s3Key: string
  expiresIn: number
}

export const ROLES = ['project_manager', 'member'] as const
export type Role = (typeof ROLES)[number]

export interface User {
  userId: string
  name: string
  email: string
  role: Role
  createdAt: string
  updatedAt: string
}

export interface LoginResult {
  token: string
  /** Unix seconds. */
  expiresAt: number
  user: User
}
