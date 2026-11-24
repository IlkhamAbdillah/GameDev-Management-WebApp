import { describe, expect, it } from 'vitest'
import type { HealthResult } from '../api/health'
import { runAllChecks, runHealthFlow } from './connectivityFlow'
import type { FlowHooks, NodeId, NodeStatus } from './flowModel'

function recorder() {
  const hops: string[] = []
  const logs: { text: string; tone: string }[] = []
  const nodes: Partial<Record<NodeId, NodeStatus>> = {}
  const hooks: FlowHooks = {
    hop: async (from, to, o) => void hops.push(`${from}>${to}${o?.tone ? `:${o.tone}` : ''}`),
    log: (e) => void logs.push(e),
    setNode: (id, status) => void (nodes[id] = status),
  }
  return { hops, logs, nodes, hooks }
}

const healthy = (checks: HealthResult['checks'], status: 'ok' | 'degraded' = 'ok', httpStatus = 200): HealthResult => ({ reachable: true, httpStatus, roundTripMs: 240, status, checks })
const assetOk = healthy({ assetsTable: { ok: true, ms: 166 }, foldersTable: { ok: true, ms: 104 }, bucket: { ok: true, ms: 100 } })
const taskOk = healthy({ tasksTable: { ok: true, ms: 148 } })
const authOk = healthy({ usersTable: { ok: true, ms: 120 } })

describe('runHealthFlow', () => {
  it('walks client → URL → Lambda → each dependency → back to the client', async () => {
    const r = recorder()
    await runHealthFlow('asset', async () => assetOk, r.hooks)
    expect(r.hops).toEqual([
      'client>assetUrl', 'assetUrl>assetLambda',
      'assetLambda>assetsTable', 'assetsTable>assetLambda:ok',
      'assetLambda>foldersTable', 'foldersTable>assetLambda:ok',
      'assetLambda>s3', 's3>assetLambda:ok',
      'assetLambda>assetUrl:ok', 'assetUrl>client:ok',
    ])
    expect(r.nodes.assetsTable).toEqual({ state: 'ok', ms: 166 })
    expect(r.nodes.s3).toEqual({ state: 'ok', ms: 100 })
    expect(r.nodes.assetLambda).toEqual({ state: 'ok' })
    expect(r.nodes.assetUrl).toMatchObject({ state: 'ok', ms: 240 })
    expect(r.logs.every((l) => l.tone !== 'fail')).toBe(true)
  })

  it('sends the real request when the first hop starts, before the animation finishes', async () => {
    const order: string[] = []
    const r = recorder()
    const hooks = { ...r.hooks, hop: async (from: NodeId, to: NodeId) => void order.push(`hop ${from}>${to}`) }
    await runHealthFlow('task', async () => (order.push('request sent'), taskOk), hooks)
    expect(order[0]).toBe('request sent')
  })

  it('shows a failing dependency in red and a degraded answer', async () => {
    const r = recorder()
    const degraded = healthy({ assetsTable: { ok: true, ms: 10 }, foldersTable: { ok: false, ms: 20, error: 'AccessDeniedException' }, bucket: { ok: true, ms: 30 } }, 'degraded', 503)
    await runHealthFlow('asset', async () => degraded, r.hooks)
    expect(r.nodes.foldersTable).toEqual({ state: 'failed', ms: 20, error: 'AccessDeniedException' })
    expect(r.nodes.assetLambda).toMatchObject({ state: 'failed' })
    expect(r.hops).toContain('foldersTable>assetLambda:fail')
    expect(r.hops.at(-1)).toBe('assetUrl>client:fail')
    expect(r.logs.some((l) => l.tone === 'fail' && /Learner Lab/.test(l.text))).toBe(true) // includes the plain-language hint
  })

  it('stops at the Function URL when the server cannot be reached', async () => {
    const r = recorder()
    await runHealthFlow('task', async () => ({ reachable: false, roundTripMs: 15000, checks: {}, error: 'Cannot reach the server (network error, wrong URL or CORS)' }), r.hooks)
    expect(r.nodes.taskUrl).toMatchObject({ state: 'failed' })
    expect(r.nodes.tasksTable).toMatchObject({ state: 'unknown' })
    expect(r.hops.some((h) => h.includes('tasksTable'))).toBe(false)
    expect(r.hops.at(-1)).toBe('taskUrl>client:fail')
  })

  it('marks the Lambda failing when it answers without health details', async () => {
    const r = recorder()
    await runHealthFlow('task', async () => ({ reachable: true, httpStatus: 500, roundTripMs: 90, checks: {}, error: 'Internal server error' }), r.hooks)
    expect(r.nodes.taskLambda).toMatchObject({ state: 'failed', error: 'Internal server error' })
    expect(r.nodes.taskUrl).toMatchObject({ state: 'ok' })
  })
})

describe('runAllChecks', () => {
  it('runs the asset, task and auth flows in that order and infers IAM and CloudWatch', async () => {
    const r = recorder()
    await runAllChecks({ asset: async () => assetOk, task: async () => taskOk, auth: async () => authOk }, r.hooks)
    expect(r.hops.indexOf('client>assetUrl')).toBeLessThan(r.hops.indexOf('client>taskUrl'))
    expect(r.hops.indexOf('client>taskUrl')).toBeLessThan(r.hops.indexOf('client>authUrl'))
    expect(r.nodes.usersTable).toMatchObject({ state: 'ok', ms: 120 })
    expect(r.nodes.iam?.state).toBe('inferred')
    expect(r.nodes.cloudwatch?.state).toBe('inferred')
  })

  it('points at IAM when the Lambdas are denied access', async () => {
    const r = recorder()
    const denied = (name: string) => healthy({ [name]: { ok: false, ms: 5, error: 'AccessDeniedException' } }, 'degraded', 503)
    await runAllChecks({ asset: async () => denied('assetsTable'), task: async () => denied('tasksTable'), auth: async () => denied('usersTable') }, r.hooks)
    expect(r.nodes.iam).toMatchObject({ state: 'failed', error: 'AccessDeniedException' })
  })

  it('leaves IAM and CloudWatch unknown when nothing is reachable', async () => {
    const r = recorder()
    const down: HealthResult = { reachable: false, roundTripMs: 0, checks: {}, error: 'Cannot reach the server' }
    await runAllChecks({ asset: async () => down, task: async () => down, auth: async () => down }, r.hooks)
    expect(r.nodes.iam?.state).toBe('unknown')
    expect(r.nodes.cloudwatch?.state).toBe('unknown')
  })
})
