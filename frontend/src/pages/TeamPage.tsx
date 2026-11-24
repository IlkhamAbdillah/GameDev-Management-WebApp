import { KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { usersApi } from '../api/auth'
import PageHeader from '../components/PageHeader'
import UserModal from '../components/team/UserModal'
import { useAuth } from '../lib/authContext'
import { ROLE_LABEL } from '../lib/roles'
import { ROLES, type Role, type User } from '../types'

export default function TeamPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ user: User | null } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await usersApi.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the team')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function changeRole(target: User, role: Role) {
    setError('')
    try {
      const saved = await usersApi.update(target.userId, { role })
      setUsers((all) => all.map((u) => (u.userId === saved.userId ? saved : u)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change the role')
    }
  }

  async function remove(target: User) {
    setError('')
    try {
      await usersApi.remove(target.userId)
      setUsers((all) => all.filter((u) => u.userId !== target.userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the account')
    } finally {
      setConfirmId(null)
    }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Team"
        subtitle={`${users.length} accounts`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => void load()} aria-label="Refresh" className="rounded-lg border border-line bg-surface p-2 text-slate-300 hover:bg-surface-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setModal({ user: null })} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:brightness-110">
              <Plus size={16} /> Add member
            </button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError('')} className="text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.userId === me?.userId
              return (
                <tr key={u.userId} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{u.name}{self && <span className="ml-2 text-xs text-slate-500">(you)</span>}</td>
                  <td className="px-4 py-3 text-slate-300">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.role === 'project_manager' ? (
                      <span className="text-xs text-slate-300" title="A project manager cannot be changed back to a member">{ROLE_LABEL.project_manager}</span>
                    ) : (
                      <select
                        aria-label={`Role of ${u.name}`}
                        value={u.role}
                        onChange={(e) => {
                          const next = e.target.value as Role
                          if (next === 'project_manager' && !window.confirm(`Make ${u.name} a project manager? This cannot be undone.`)) return
                          void changeRole(u, next)
                        }}
                        className="rounded-lg border border-line bg-bg px-2 py-1 text-xs outline-none focus:border-accent"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setModal({ user: u })} aria-label={`Reset password of ${u.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-2 hover:text-slate-200">
                        <KeyRound size={15} />
                      </button>
                      {!self &&
                        (confirmId === u.userId ? (
                          <span className="flex items-center gap-1 text-xs">
                            <button onClick={() => void remove(u)} className="rounded-lg bg-red-600 px-2.5 py-1 font-medium hover:bg-red-500">Delete</button>
                            <button onClick={() => setConfirmId(null)} className="px-2 py-1 text-slate-300">Cancel</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmId(u.userId)} aria-label={`Delete ${u.name}`} className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10">
                            <Trash2 size={15} />
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!loading && users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">No accounts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Role changes and deleted accounts take full effect when the person’s current sign-in expires (up to 8 hours) or they sign in again.
      </p>

      {modal && (
        <UserModal
          key={modal.user?.userId ?? 'new'}
          user={modal.user}
          onClose={() => setModal(null)}
          onCreate={async (input) => {
            const created = await usersApi.create(input)
            setUsers((all) => [...all, created].sort((a, b) => a.name.localeCompare(b.name)))
            setModal(null)
          }}
          onResetPassword={async (userId, password) => {
            await usersApi.update(userId, { password })
            setModal(null)
          }}
        />
      )}
    </div>
  )
}
