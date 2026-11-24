import type { Task, User } from '../types'

/** UI gating only. The Lambdas enforce the same rules; hiding a button is never the security. */
export const isManager = (user: User | null): boolean => user?.role === 'project_manager'

/** Project managers edit any task; members only tasks assigned to their account. */
export function canEditTask(user: User | null, task: Task): boolean {
  if (!user) return false
  return isManager(user) || task.assigneeId === user.userId
}

/** Deleting tasks and assets/files, managing folders and users, and setting dates/assignees. */
export const canDelete = isManager
export const canManageFolders = isManager
export const canManageUsers = isManager
export const canSchedule = isManager
