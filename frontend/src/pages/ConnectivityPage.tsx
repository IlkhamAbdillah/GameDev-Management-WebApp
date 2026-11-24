import { Activity, CheckCircle2, CircleDashed, Info, Loader2, MinusCircle, PlayCircle, RefreshCw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { fetchHealth, type HealthResult } from '../api/health'
import PageHeader from '../components/PageHeader'
import { ROUND_TRIP_STEPS, runRoundTrip, type StepResult, type StepStatus } from '../lib/connectivityTest'

const ASSET_URL = import.meta.env.VITE_ASSET_API_URL as string | undefined
const TASK_URL = import.meta.env.VITE_TASK_API_URL as string | undefined

type RowState = 'pending' | 'ok' | 'failed' | 'skipped'
interface Row { id: string; label: string; hint: string; state: RowState; ms?: number; error?: string }

function rowsFor(result: HealthResult | undefined, loading: boolean, items: { id: string; label: string; hint: string }[]): Row[] {
  return items.map((item) => {
    if (!result) return { ...item, state: loading ? 'pending' : 'skipped' }
    if (item.id === 'reach') {
      return result.reachable
        ? { ...item, state: 'ok', ms: result.roundTripMs }
        : { ...item, state: 'failed', ms: result.roundTripMs, error: result.error }
    }
    if (!result.reachable) return { ...item, state: 'skipped', error: 'Not tested: the API is unreachable' }
    const check = result.checks[item.id]
    if (!check) return { ...item, state: 'failed', error: result.error ?? 'No result reported by the API' }
    return check.ok ? { ...item, state: 'ok', ms: check.ms } : { ...item, state: 'failed', ms: check.ms, error: check.error }
  })
}

const ASSET_ITEMS = [
  { id: 'reach', label: 'Browser → Asset API', hint: 'Lambda Function URL (HTTPS + CORS)' },
  { id: 'assetsTable', label: 'Lambda → DynamoDB', hint: 'Table GameVaultAssets' },
  { id: 'foldersTable', label: 'Lambda → DynamoDB', hint: 'Table GameVaultFolders' },
  { id: 'bucket', label: 'Lambda → Amazon S3', hint: 'Private asset bucket' },
]
const TASK_ITEMS = [
  { id: 'reach', label: 'Browser → Task API', hint: 'Lambda Function URL (HTTPS + CORS)' },
  { id: 'tasksTable', label: 'Lambda → DynamoDB', hint: 'Table GameVaultTasks (also serves the Timeline)' },
]

const ICON: Record<StepStatus | RowState, ReactNode> = {
  pending: <CircleDashed size={18} className="text-slate-500" />,
  running: <Loader2 size={18} className="animate-spin text-accent" />,
  ok: <CheckCircle2 size={18} className="text-green-400" />,
  failed: <XCircle size={18} className="text-red-400" />,
  skipped: <MinusCircle size={18} className="text-slate-500" />,
}

function RowLine({ state, label, hint, ms, error }: { state: StepStatus | RowState; label: string; hint?: string; ms?: number; error?: string }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0" aria-label={state}>{ICON[state]}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
        {error && <div role="alert" className="mt-1 text-xs text-red-300">{error}</div>}
      </div>
      {ms !== undefined && state !== 'pending' && <span className="shrink-0 text-xs tabular-nums text-slate-400">{ms} ms</span>}
    </li>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </header>
      <ul className="divide-y divide-line/60">{children}</ul>
    </section>
  )
}

export default function ConnectivityPage() {
  const [asset, setAsset] = useState<HealthResult>()
  const [task, setTask] = useState<HealthResult>()
  const [checking, setChecking] = useState(true)
  const [steps, setSteps] = useState<StepResult[]>(() => ROUND_TRIP_STEPS.map((s) => ({ ...s, status: 'pending' as const })))
  const [roundTripState, setRoundTripState] = useState<'idle' | 'running' | 'done'>('idle')
  const [warning, setWarning] = useState('')

  const runChecks = useCallback(async () => {
    setChecking(true)
    setAsset(undefined)
    setTask(undefined)
    const [a, t] = await Promise.all([fetchHealth(ASSET_URL), fetchHealth(TASK_URL)])
    setAsset(a)
    setTask(t)
    setChecking(false)
  }, [])

  useEffect(() => {
    void runChecks()
  }, [runChecks])

  async function startRoundTrip() {
    setRoundTripState('running')
    setWarning('')
    const { cleanupWarning } = await runRoundTrip(setSteps)
    if (cleanupWarning) setWarning(cleanupWarning)
    setRoundTripState('done')
  }

  const assetRows = rowsFor(asset, checking, ASSET_ITEMS)
  const taskRows = rowsFor(task, checking, TASK_ITEMS)
  const all = [...assetRows, ...taskRows]
  const failing = all.filter((r) => r.state === 'failed').length
  const passing = all.filter((r) => r.state === 'ok').length

  const summary = checking
    ? { tone: 'border-line text-slate-300', text: 'Running checks…' }
    : failing === 0 && passing === all.length
      ? { tone: 'border-green-500/30 bg-green-500/10 text-green-300', text: `All ${all.length} checks passed` }
      : { tone: 'border-red-500/30 bg-red-500/10 text-red-300', text: `${failing} of ${all.length} checks failing` }

  const roundTripFailed = steps.some((s) => s.status === 'failed')
  const roundTripOk = roundTripState === 'done' && !roundTripFailed

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <PageHeader
        title="Connectivity"
        subtitle="Checks that the app can reach every service it depends on"
        actions={
          <button onClick={() => void runChecks()} disabled={checking} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-slate-200 hover:bg-surface-2 disabled:opacity-50">
            <RefreshCw size={15} className={checking ? 'animate-spin' : ''} /> Run again
          </button>
        }
      />

      <div role="status" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${summary.tone}`}>
        <Activity size={16} /> {summary.text}
      </div>

      <Card title="Asset API" subtitle="Lambda GameVaultAssetHandler · assets, folders and files">
        {assetRows.map((r) => <RowLine key={r.id + r.hint} {...r} state={r.state} />)}
      </Card>
      <Card title="Task API" subtitle="Lambda GameVaultTaskHandler · tasks and timeline">
        {taskRows.map((r) => <RowLine key={r.id + r.hint} {...r} state={r.state} />)}
      </Card>

      <Card title="Not testable from the browser">
        <li className="flex items-start gap-3 px-4 py-3 text-sm">
          <Info size={18} className="mt-0.5 shrink-0 text-slate-400" />
          <div>
            <div>Amazon CloudWatch Logs</div>
            <div className="text-xs text-slate-500">Lambda writes logs automatically. To inspect them open the AWS Console → CloudWatch → Log groups → <code>/aws/lambda/GameVaultAssetHandler</code> or <code>…TaskHandler</code>. A passing check above has produced a fresh log entry.</div>
          </div>
        </li>
        <li className="flex items-start gap-3 px-4 py-3 text-sm">
          <Info size={18} className="mt-0.5 shrink-0 text-slate-400" />
          <div>
            <div>AWS IAM (LabRole)</div>
            <div className="text-xs text-slate-500">Verified indirectly: if the Lambdas can reach DynamoDB and S3, the role’s permissions work.</div>
          </div>
        </li>
      </Card>

      <section className="rounded-2xl border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Full round-trip test</h2>
            <p className="text-xs text-slate-500">Exercises real writes, the direct browser → S3 upload and download, and the Timeline. It creates one temporary asset and one temporary task (names start with <code>connectivity-probe-</code>) and deletes them afterwards.</p>
          </div>
          <button onClick={() => void startRoundTrip()} disabled={roundTripState === 'running' || checking} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
            <PlayCircle size={16} /> {roundTripState === 'running' ? 'Running…' : roundTripState === 'done' ? 'Run again' : 'Run test'}
          </button>
        </header>
        <ul className="divide-y divide-line/60">
          {steps.map((s) => <RowLine key={s.id} state={s.status} label={s.label} ms={s.ms} error={s.error} />)}
        </ul>
        {roundTripState === 'done' && (
          <div role="status" className={`m-3 rounded-lg px-3 py-2 text-sm ${roundTripOk ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
            {roundTripOk ? 'Round trip succeeded: browser, Lambda, DynamoDB and S3 all work end to end.' : 'Round trip failed. See the failing step above.'}
          </div>
        )}
        {warning && <div role="alert" className="m-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{warning}</div>}
      </section>
    </div>
  )
}
