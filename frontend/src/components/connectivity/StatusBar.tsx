import { Activity, CheckCircle2, ChevronDown, CircleDashed, Loader2, MinusCircle, TriangleAlert, XCircle } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import type { StepResult, StepStatus } from '../../lib/connectivityTest'
import type { BarTone, StatusBarModel } from '../../lib/statusBar'

const TONE: Record<BarTone, string> = {
  neutral: 'border-line text-slate-300',
  running: 'border-accent/40 bg-accent/10 text-slate-100',
  ok: 'border-green-500/30 bg-green-500/10 text-green-300',
  fail: 'border-red-500/30 bg-red-500/10 text-red-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
}
const BAR_ICON: Record<BarTone, ReactNode> = {
  neutral: <Activity size={16} />,
  running: <Loader2 size={16} className="animate-spin" />,
  ok: <CheckCircle2 size={16} />,
  fail: <XCircle size={16} />,
  warn: <TriangleAlert size={16} />,
}
const STEP_ICON: Record<StepStatus, ReactNode> = {
  pending: <CircleDashed size={16} className="text-slate-500" />,
  running: <Loader2 size={16} className="animate-spin text-accent" />,
  ok: <CheckCircle2 size={16} className="text-green-400" />,
  failed: <XCircle size={16} className="text-red-400" />,
  skipped: <MinusCircle size={16} className="text-slate-500" />,
}
const STEP_LABEL: Record<StepStatus, string> = { pending: 'not started', running: 'running', ok: 'done', failed: 'failed', skipped: 'skipped' }

interface Props {
  model: StatusBarModel
  steps: StepResult[]
  lastRunAt: number | null
  busy: boolean
}

/** The page's single status line. During/after a round-trip test it opens into the step-by-step list. */
export default function StatusBar({ model, steps, lastRunAt, busy }: Props) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const expanded = model.expandable && open
  const percent = model.progress && model.progress.total ? Math.round((model.progress.done * 100) / model.progress.total) : 0

  const content = (
    <>
      <span className="shrink-0">{BAR_ICON[model.tone]}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm">{model.text}</span>
        {model.detail && <span className="block truncate text-xs opacity-80">{model.detail}</span>}
      </span>
      {lastRunAt && !busy && <span className="hidden shrink-0 text-xs opacity-70 sm:block">last checked {new Date(lastRunAt).toLocaleTimeString()}</span>}
      {model.expandable && <ChevronDown size={16} className={`shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
    </>
  )

  return (
    <div role="status" className={`overflow-hidden rounded-xl border ${TONE[model.tone]}`}>
      {model.expandable ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={expanded} aria-controls={listId} className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-white/[0.03]">
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-3">{content}</div>
      )}
      {model.progress && (model.tone === 'running') && (
        <div className="h-1 bg-black/20" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Round-trip progress">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
      )}
      {expanded && (
        <ol id={listId} className="border-t border-line/60 bg-surface px-4 py-1 text-slate-200">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-2.5 border-b border-line/40 py-2.5 last:border-b-0">
              <span className="mt-0.5 shrink-0" role="img" aria-label={STEP_LABEL[s.status]}>{STEP_ICON[s.status]}</span>
              <div className="min-w-0 flex-1 text-xs">
                <div className={s.status === 'pending' || s.status === 'skipped' ? 'text-slate-500' : 'text-slate-300'}><span className="mr-1 text-slate-500">{i + 1}.</span>{s.label}</div>
                {s.error && <div role="alert" className="mt-0.5 text-red-300">{s.error}</div>}
              </div>
              {s.ms !== undefined && <span className="shrink-0 text-xs tabular-nums text-slate-500">{s.ms} ms</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
