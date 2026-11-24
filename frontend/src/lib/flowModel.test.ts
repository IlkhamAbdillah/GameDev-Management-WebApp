import { describe, expect, it } from 'vitest'
import { API_FLOWS } from './connectivityFlow'
import { ROUND_TRIP_STEPS } from './connectivityTest'
import { BOUNDARY, EDGES, NODES, NODE_BY_ID, VIEWBOX, anchor, edgePath, findEdge, initialStatuses } from './flowModel'

const overlap = (a: (typeof NODES)[number], b: (typeof NODES)[number]) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('diagram layout', () => {
  it('keeps every node inside the viewBox and never overlaps two nodes', () => {
    for (const n of NODES) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.x + n.w).toBeLessThanOrEqual(VIEWBOX.w)
      expect(n.y + n.h).toBeLessThanOrEqual(VIEWBOX.h)
    }
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) expect(overlap(NODES[i], NODES[j]), `${NODES[i].id} / ${NODES[j].id}`).toBe(false)
    }
  })

  it('places everything except the browser inside the AWS boundary', () => {
    for (const n of NODES.filter((n) => n.id !== 'client')) {
      expect(n.x).toBeGreaterThanOrEqual(BOUNDARY.x)
      expect(n.y).toBeGreaterThanOrEqual(BOUNDARY.y)
      expect(n.x + n.w).toBeLessThanOrEqual(BOUNDARY.x + BOUNDARY.w)
      expect(n.y + n.h).toBeLessThanOrEqual(BOUNDARY.y + BOUNDARY.h)
    }
    expect(NODE_BY_ID.client.x + NODE_BY_ID.client.w).toBeLessThan(BOUNDARY.x)
  })

  it('has unique ids and edges that reference real nodes', () => {
    expect(new Set(NODES.map((n) => n.id)).size).toBe(NODES.length)
    expect(new Set(EDGES.map((e) => e.id)).size).toBe(EDGES.length)
    for (const e of EDGES) expect([NODE_BY_ID[e.a], NODE_BY_ID[e.b]].every(Boolean)).toBe(true)
  })

  it('starts and ends each edge path exactly on the node borders', () => {
    for (const edge of EDGES) {
      const nums = edgePath(edge).match(/-?\d+(\.\d+)?/g)!.map(Number)
      const from = anchor(NODE_BY_ID[edge.a], edge.aSide)
      const to = anchor(NODE_BY_ID[edge.b], edge.bSide)
      expect([nums[0], nums[1]]).toEqual([from.x, from.y])
      expect([nums.at(-2), nums.at(-1)]).toEqual([to.x, to.y])
      expect(nums.every(Number.isFinite)).toBe(true)
    }
  })

  it('finds edges in both directions', () => {
    expect(findEdge('client', 'assetUrl')).toMatchObject({ reverse: false })
    expect(findEdge('assetUrl', 'client')).toMatchObject({ reverse: true })
    expect(findEdge('client', 'tasksTable')).toBeUndefined()
  })

  it('starts with only the browser marked reachable', () => {
    const s = initialStatuses()
    expect(s.client.state).toBe('ok')
    expect(Object.values(s).filter((x) => x.state === 'unknown')).toHaveLength(NODES.length - 1)
  })
})

describe('every animated hop follows a real edge of the architecture', () => {
  it('health flows', () => {
    for (const flow of Object.values(API_FLOWS)) {
      expect(findEdge('client', flow.url)).toBeDefined()
      expect(findEdge(flow.url, flow.lambda)).toBeDefined()
      for (const [, node] of flow.probes) expect(findEdge(flow.lambda, node), `${flow.lambda} -> ${node}`).toBeDefined()
    }
  })

  it('round-trip steps', () => {
    for (const step of ROUND_TRIP_STEPS) {
      expect(step.legs.length).toBeGreaterThan(0)
      for (const [from, to] of step.legs) expect(findEdge(from, to), `${step.id}: ${from} -> ${to}`).toBeDefined()
    }
  })
})
