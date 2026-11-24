import { useEffect, useRef, useState } from 'react'
import type { HopController } from '../../lib/hopController'
import {
  BOUNDARY, EDGES, NODES, STATE_COLOR, VIEWBOX, edgePath, findEdge,
  type HopOptions, type HopTone, type NodeDef, type NodeId, type Statuses,
} from '../../lib/flowModel'

export const HOP_MS = 650
const TONE_COLOR: Record<HopTone, string> = { request: '#6d8cff', ok: '#4fbf8b', fail: '#ff7a7a' }
const EDGE_STYLE = {
  request: { stroke: '#2f3b55', dash: undefined },
  direct: { stroke: '#6b5aa8', dash: '7 5' },
  platform: { stroke: '#3a4660', dash: '2 5' },
} as const

interface Packet {
  id: number
  edgeId: string
  reverse: boolean
  tone: HopTone
  label?: string
  duration: number
  resolve: () => void
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function PacketView({ packet, getPath, onDone }: { packet: Packet; getPath: () => SVGPathElement | undefined; onDone: (p: Packet) => void }) {
  const group = useRef<SVGGElement>(null)
  useEffect(() => {
    const path = getPath()
    if (!path) return onDone(packet)
    const total = path.getTotalLength()
    const duration = prefersReducedMotion() ? 0 : packet.duration
    const place = (progress: number) => {
      const point = path.getPointAtLength((packet.reverse ? 1 - progress : progress) * total)
      group.current?.setAttribute('transform', `translate(${point.x} ${point.y})`)
    }
    place(0)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration)
      place(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) // ease in-out
      if (t < 1) frame = requestAnimationFrame(tick)
      else onDone(packet)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a packet is played exactly once
  }, [])

  const color = TONE_COLOR[packet.tone]
  return (
    <g ref={group} pointerEvents="none">
      <circle r="11" fill={color} opacity="0.22" />
      <circle r="6" fill={color} stroke="#0d111a" strokeWidth="1.5" />
      {packet.label && (
        <text y="-14" textAnchor="middle" fontSize="10.5" fontWeight="600" fill={color} stroke="#0d111a" strokeWidth="3" paintOrder="stroke">
          {packet.label}
        </text>
      )}
    </g>
  )
}

interface Props {
  statuses: Statuses
  selected: NodeId | null
  onSelect: (id: NodeId) => void
  controller: HopController
}

export default function ArchitectureDiagram({ statuses, selected, onSelect, controller }: Props) {
  const [packets, setPackets] = useState<Packet[]>([])
  const pathRefs = useRef(new Map<string, SVGPathElement>())
  const live = useRef(new Set<Packet>())
  const seq = useRef(0)

  useEffect(() => {
    const pending = live.current
    controller.bind((from: NodeId, to: NodeId, options?: HopOptions) =>
      new Promise<void>((resolve) => {
        const found = findEdge(from, to)
        if (!found) return resolve() // unknown route: skip rather than hang
        const packet: Packet = { id: ++seq.current, edgeId: found.edge.id, reverse: found.reverse, tone: options?.tone ?? 'request', label: options?.label, duration: options?.duration ?? HOP_MS, resolve }
        pending.add(packet)
        setPackets((all) => [...all, packet])
      }),
    )
    return () => {
      controller.bind(null)
      pending.forEach((p) => p.resolve()) // never leave a test waiting on an unmounted diagram
      pending.clear()
    }
  }, [controller])

  const finish = (packet: Packet) => {
    live.current.delete(packet)
    setPackets((all) => all.filter((p) => p.id !== packet.id))
    packet.resolve()
  }

  const activeEdges = new Set(packets.map((p) => p.edgeId))
  const touchesSelected = (a: NodeId, b: NodeId) => selected !== null && (a === selected || b === selected)

  return (
    <svg viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`} role="group" aria-label="GameVault architecture. Select a component for details." className="h-auto w-full select-none">
      <defs>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <rect x={BOUNDARY.x} y={BOUNDARY.y} width={BOUNDARY.w} height={BOUNDARY.h} rx="18" fill="none" stroke="#f0a04b" strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="8 6" />
      <text x={BOUNDARY.x + 14} y={BOUNDARY.y + 18} fontSize="11" fill="#f0a04b" fillOpacity="0.85">AWS account · us-east-1</text>

      {EDGES.map((edge) => {
        const style = EDGE_STYLE[edge.kind]
        const active = activeEdges.has(edge.id)
        const highlight = touchesSelected(edge.a, edge.b)
        return (
          <path
            key={edge.id}
            ref={(el) => {
              if (el) pathRefs.current.set(edge.id, el)
              else pathRefs.current.delete(edge.id)
            }}
            d={edgePath(edge)}
            fill="none"
            stroke={active || highlight ? '#8fa6ff' : style.stroke}
            strokeWidth={active || highlight ? 2.6 : 1.8}
            strokeDasharray={style.dash}
            strokeLinecap="round"
          />
        )
      })}
      <text x="225" y="518" fontSize="10" fill="#8a78d0">direct upload / download (pre-signed URL)</text>

      {NODES.map((node) => (
        <NodeBox key={node.id} node={node} status={statuses[node.id]} selected={selected === node.id} onSelect={onSelect} />
      ))}

      {packets.map((packet) => (
        <PacketView key={packet.id} packet={packet} getPath={() => pathRefs.current.get(packet.edgeId)} onDone={finish} />
      ))}
    </svg>
  )
}

function NodeBox({ node, status, selected, onSelect }: { node: NodeDef; status: Statuses[NodeId]; selected: boolean; onSelect: (id: NodeId) => void }) {
  const color = STATE_COLOR[status.state]
  const running = status.state === 'running'
  const label = `${node.title} ${node.subtitle}: ${status.state}${status.ms !== undefined ? `, ${status.ms} milliseconds` : ''}`
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(node.id)
        }
      }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      {selected && <rect x={node.x - 5} y={node.y - 5} width={node.w + 10} height={node.h + 10} rx="15" fill="none" stroke="#e6eaf2" strokeOpacity="0.8" strokeWidth="1.6" />}
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx="12" fill="#151b27" stroke={color} strokeWidth={status.state === 'unknown' ? 1.6 : 2.2} filter={status.state === 'ok' || status.state === 'failed' ? 'url(#glow)' : undefined}>
        {running && <animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.1s" repeatCount="indefinite" />}
      </rect>
      <text x={node.x + node.w / 2} y={node.y + node.h / 2 - (status.ms !== undefined ? 8 : 3)} textAnchor="middle" fontSize="13" fontWeight="700" fill="#e6eaf2">{node.title}</text>
      <text x={node.x + node.w / 2} y={node.y + node.h / 2 + (status.ms !== undefined ? 8 : 13)} textAnchor="middle" fontSize="10" fill="#8b97ad">{node.subtitle}</text>
      {status.ms !== undefined && <text x={node.x + node.w / 2} y={node.y + node.h / 2 + 23} textAnchor="middle" fontSize="10" fontWeight="600" fill={color}>{status.ms} ms</text>}
      <circle cx={node.x + node.w - 12} cy={node.y + 12} r="4.5" fill={color} />
    </g>
  )
}
