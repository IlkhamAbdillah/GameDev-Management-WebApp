import { Play, PlayCircle } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import ActivityLog from '../components/connectivity/ActivityLog'
import ArchitectureDiagram from '../components/connectivity/ArchitectureDiagram'
import NodePanel from '../components/connectivity/NodePanel'
import StatusBar from '../components/connectivity/StatusBar'
import PageHeader from '../components/PageHeader'
import { getState, hopController, isStale, refreshStatuses, startChecks, startRoundTrip, subscribe } from '../lib/connectivityStore'
import type { NodeId } from '../lib/flowModel'
import { deriveStatusBar } from '../lib/statusBar'

export default function ConnectivityPage() {
  // Statuses are already there when the page opens (the app checks quietly in the background). If they are
  // older than 30 s they are refreshed in place: no animation, no reset to grey.
  const state = useSyncExternalStore(subscribe, getState)
  const { statuses, log, steps, mode, lastRunAt } = state
  const [selected, setSelected] = useState<NodeId | null>(null)
  useEffect(() => {
    if (isStale()) void refreshStatuses()
  }, [])
  const busy = mode !== 'idle'
  const bar = deriveStatusBar(state)

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <PageHeader
        title="Connectivity"
        subtitle="Click a component to inspect it, or run a test and watch the request travel through the architecture"
        actions={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void startChecks(true)} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
              <Play size={15} /> {mode === 'checking' ? 'Running…' : 'Run test'}
            </button>
            <button onClick={() => void startRoundTrip()} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-slate-200 hover:bg-surface-2 disabled:opacity-50">
              <PlayCircle size={15} /> {mode === 'roundtrip' ? 'Running…' : 'Full round-trip test'}
            </button>
          </div>
        }
      />

      <StatusBar model={bar} steps={steps} lastRunAt={lastRunAt} busy={busy} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Architecture diagram" className="overflow-x-auto rounded-2xl border border-line bg-surface p-3">
          <div className="min-w-[680px]">
            <ArchitectureDiagram statuses={statuses} selected={selected} onSelect={(id) => setSelected((cur) => (cur === id ? null : id))} controller={hopController} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[11px] text-slate-500">
            <Legend color="#4fbf8b" label="reachable" />
            <Legend color="#ff7a7a" label="failing" />
            <Legend color="#7fb8a3" label="inferred" />
            <Legend color="#3a4660" label="not checked" />
            <span>Dots travelling the lines are the request (blue) and its answers (green/red).</span>
          </div>
        </section>
        <aside aria-label="Component details" className="rounded-2xl border border-line bg-surface p-4">
          <NodePanel id={selected} status={selected ? statuses[selected] : undefined} />
        </aside>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">What is happening</h2>
        <ActivityLog entries={log} />
        <p className="mt-3 text-[11px] text-slate-500">The request is real. The Lambda’s own steps run on the server; they are replayed here from the timings it reports in its answer.</p>
      </section>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  )
}
