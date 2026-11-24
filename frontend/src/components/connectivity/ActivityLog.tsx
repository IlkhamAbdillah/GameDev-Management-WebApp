import { useEffect, useRef } from 'react'
import type { LogEntry } from '../../lib/connectivityStore'

const DOT = { info: 'bg-accent', ok: 'bg-green-400', fail: 'bg-red-400' } as const
const TEXT = { info: 'text-slate-300', ok: 'text-green-300', fail: 'text-red-300' } as const

export default function ActivityLog({ entries }: { entries: LogEntry[] }) {
  const box = useRef<HTMLOListElement>(null)
  // Follow new entries by scrolling only the log box. (scrollIntoView would also scroll the whole page.)
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])

  if (entries.length === 0) return <p className="text-sm text-slate-500">Nothing yet. Press Run test to see each step a request takes through the architecture.</p>
  const first = entries[0].at
  return (
    <ol ref={box} role="log" aria-live="polite" className="max-h-64 space-y-1.5 overflow-auto pr-1 text-xs">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start gap-2">
          <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${DOT[e.tone]}`} />
          <span className="w-12 shrink-0 tabular-nums text-slate-500">+{((e.at - first) / 1000).toFixed(1)}s</span>
          <span className={TEXT[e.tone]}>{e.text}</span>
        </li>
      ))}
    </ol>
  )
}
