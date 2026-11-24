import { Info } from 'lucide-react'
import { NODE_INFO, hintFor } from '../../content/archNodes'
import { STATE_COLOR, type NodeId, type NodeStatus } from '../../lib/flowModel'

const STATE_LABEL: Record<NodeStatus['state'], string> = {
  unknown: 'Not checked yet',
  running: 'Checking…',
  ok: 'Reachable',
  failed: 'Failing',
  inferred: 'Looks fine (inferred)',
}

export default function NodePanel({ id, status }: { id: NodeId | null; status?: NodeStatus }) {
  if (!id || !status) {
    return (
      <div className="flex h-full items-start gap-2 text-sm text-slate-400">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>Select any component in the diagram to see what it is, what it does in GameVault and its latest check result. Press <strong className="text-slate-200">Run test</strong> to watch a request travel through the architecture.</p>
      </div>
    )
  }
  const info = NODE_INFO[id]
  const hint = status.state === 'failed' ? hintFor(status.error) : undefined
  return (
    <div className="space-y-3 text-sm">
      <div>
        <h3 className="font-semibold">{info.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-md px-2 py-0.5 ring-1" style={{ color: STATE_COLOR[status.state], boxShadow: `inset 0 0 0 1px ${STATE_COLOR[status.state]}55` }}>
            <span className="size-2 rounded-full" style={{ background: STATE_COLOR[status.state] }} />
            {STATE_LABEL[status.state]}
          </span>
          {status.ms !== undefined && <span className="tabular-nums text-slate-400">{status.ms} ms</span>}
        </div>
        {status.note && <p className="mt-1 text-xs text-slate-500">{status.note}</p>}
      </div>
      {status.error && (
        <div role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <div className="font-medium">{status.error}</div>
          {hint && <p className="mt-1 text-red-200/80">{hint}</p>}
        </div>
      )}
      <p className="leading-relaxed text-slate-300">{info.what}</p>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-400">In GameVault</div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-300">{info.inGameVault.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-400">How it is checked</div>
        <p className="text-xs text-slate-300">{info.howChecked}</p>
      </div>
    </div>
  )
}
