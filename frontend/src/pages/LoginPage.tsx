import { Vault } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'

const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email, password)
      void navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="grid h-full place-items-center p-4">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-accent/20 text-accent"><Vault size={22} /></div>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold tracking-tight">GameVault</h1>
            <p className="text-xs text-slate-400">Sign in to your workspace</p>
          </div>
        </div>
        <label className="block space-y-1 text-xs text-slate-400">
          Email
          <input autoFocus type="email" autoComplete="username" required className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1 text-xs text-slate-400">
          Password
          <input type="password" autoComplete="current-password" required className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-[11px] text-slate-500">Accounts are created by a project manager.</p>
      </form>
    </div>
  )
}
