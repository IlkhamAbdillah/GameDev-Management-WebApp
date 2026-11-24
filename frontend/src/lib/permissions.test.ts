import { describe, expect, it } from 'vitest'
import type { Task, User } from '../types'
import { canEditTask, canDelete, canManageFolders, canManageUsers, canSchedule, isManager } from './permissions'

const user = (role: User['role'], userId = 'u1'): User => ({ userId, name: 'N', email: 'n@x.co', role, createdAt: '', updatedAt: '' })
const task = (assigneeId?: string) => ({ taskId: 't', assigneeId }) as Task

describe('permissions', () => {
  it('lets managers do everything', () => {
    const pm = user('project_manager')
    expect([isManager(pm), canDelete(pm), canManageFolders(pm), canManageUsers(pm), canSchedule(pm)]).toEqual([true, true, true, true, true])
    expect(canEditTask(pm, task('someone-else'))).toBe(true)
    expect(canEditTask(pm, task())).toBe(true)
  })

  it('lets members edit only tasks assigned to their own account', () => {
    const member = user('member', 'u1')
    expect(canEditTask(member, task('u1'))).toBe(true)
    expect(canEditTask(member, task('u2'))).toBe(false)
    expect(canEditTask(member, task(''))).toBe(false)
    expect(canEditTask(member, task())).toBe(false)
    expect([isManager(member), canDelete(member), canManageFolders(member), canManageUsers(member), canSchedule(member)]).toEqual([false, false, false, false, false])
  })

  it('grants nothing when signed out', () => {
    expect(isManager(null)).toBe(false)
    expect(canEditTask(null, task('u1'))).toBe(false)
  })
})
