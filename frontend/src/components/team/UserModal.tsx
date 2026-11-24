import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ROLES, type Role, type User } from '../../types'
import { ROLE_LABEL } from '../../lib/roles'
import { useEscapeKey } from '../../lib/useEscapeKey'

const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent'

interface Props {
  /** null => create a user; otherwise reset that user's password. */
  user: User | null
  onClose: () => void
  onCreate: (input: { name: string; email: string; password: string; role: Role }) => Promise<void>
  onResetPassword: (userId: string, password: string) => Promise<void>
}

export default function UserModal({ user, onClose, onCreate, onResetPassword }: Props) {
  useEscapeKey(onClose)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (!user && !name.trim()) return setError('Name is required')
    setBusy(true)
    setError('')
    try {
      if (user) await onResetPassword(user.userId, password)
      else await onCreate({ name, email, password, role })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <form onSubmit={(e) => void submit(e)} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{user ? `Reset password for ${user.name}` : 'Add team member'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-surface-2"><X size={18} /></button>
        </div>
        {!user && (
          <>
            <label className="block space-y-1 text-xs text-slate-400">
              Name
              <input autoFocus className={field} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block space-y-1 text-xs text-slate-400">
              Email
              <input type="email" autoComplete="off" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block space-y-1 text-xs text-slate-400">
              Role
              <select className={field} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="block space-y-1 text-xs text-slate-400">
          {user ? 'New password' : 'Initial password'} (min 8 characters)
          <input autoFocus={Boolean(user)} type="password" autoComplete="new-password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <p className="text-[11px] text-slate-500">Share the password securely. Only a project manager can reset it (the key icon on the Team page).</p>
        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
          {busy ? 'Saving…' : user ? 'Reset password' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
