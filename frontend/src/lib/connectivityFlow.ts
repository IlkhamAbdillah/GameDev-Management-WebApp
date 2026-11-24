import type { HealthResult } from '../api/health'
import { hintFor } from '../content/archNodes'
import type { FlowHooks, NodeId } from './flowModel'

interface ApiFlow {
  label: string
  url: NodeId
  lambda: NodeId
  /** health-check name reported by the API -> diagram node it probes, with what the Lambda does */
  probes: [check: string, node: NodeId, action: string][]
}

export const API_FLOWS: Record<'asset' | 'task', ApiFlow> = {
  asset: {
    label: 'Asset API',
    url: 'assetUrl',
    lambda: 'assetLambda',
    probes: [
      ['assetsTable', 'assetsTable', 'DescribeTable GameVaultAssets'],
      ['foldersTable', 'foldersTable', 'DescribeTable GameVaultFolders'],
      ['bucket', 's3', 'HeadBucket on the asset bucket'],
    ],
  },
  task: {
    label: 'Task API',
    url: 'taskUrl',
    lambda: 'taskLambda',
    probes: [['tasksTable', 'tasksTable', 'DescribeTable GameVaultTasks']],
  },
}

/**
 * One animated health check: browser → Function URL → Lambda → (each dependency → Lambda) → URL → browser.
 *
 * The request really is sent when the first hop starts. The Lambda's own steps happen on the server, so they
 * are *replayed* from the per-dependency results and latencies it reports in its answer.
 */
export async function runHealthFlow(api: 'asset' | 'task', check: () => Promise<HealthResult>, hooks: FlowHooks): Promise<HealthResult> {
  const flow = API_FLOWS[api]
  hooks.log({ tone: 'info', text: `Browser → ${flow.label}: GET /health` })
  hooks.setNode(flow.url, { state: 'running' })

  const pending = check() // the real request starts now
  await hooks.hop('client', flow.url, { label: 'GET /health' })
  hooks.log({ tone: 'info', text: `Function URL receives the request and invokes the Lambda` })
  await hooks.hop(flow.url, flow.lambda, { label: 'invoke' })
  hooks.setNode(flow.lambda, { state: 'running' })

  const result = await pending

  if (!result.reachable) {
    const error = result.error ?? 'No response'
    hooks.log({ tone: 'fail', text: `No answer from ${flow.label}: ${error}` })
    hooks.setNode(flow.url, { state: 'failed', error, ms: result.roundTripMs })
    hooks.setNode(flow.lambda, { state: 'unknown', note: 'Not reached' })
    for (const [, node] of flow.probes) hooks.setNode(node, { state: 'unknown', note: 'Not reached' })
    await hooks.hop(flow.lambda, flow.url, { tone: 'fail', label: 'no answer' })
    await hooks.hop(flow.url, 'client', { tone: 'fail', label: 'failed' })
    return result
  }

  const hasChecks = Object.keys(result.checks).length > 0
  if (!hasChecks) {
    const error = result.error ?? `HTTP ${result.httpStatus}`
    hooks.log({ tone: 'fail', text: `Lambda answered without health details: ${error}` })
    hooks.setNode(flow.url, { state: 'ok', ms: result.roundTripMs })
    hooks.setNode(flow.lambda, { state: 'failed', error })
    await hooks.hop(flow.lambda, flow.url, { tone: 'fail', label: `HTTP ${result.httpStatus}` })
    await hooks.hop(flow.url, 'client', { tone: 'fail', label: `HTTP ${result.httpStatus}` })
    return result
  }

  hooks.log({ tone: 'info', text: `Lambda checks each dependency it uses (timings are the ones it reported)` })
  for (const [check_, node, action] of flow.probes) {
    const probe = result.checks[check_]
    if (!probe) {
      hooks.setNode(node, { state: 'unknown', note: 'Not reported by the API' })
      continue
    }
    await hooks.hop(flow.lambda, node, { label: action.split(' ')[0] })
    hooks.setNode(node, probe.ok ? { state: 'ok', ms: probe.ms } : { state: 'failed', ms: probe.ms, error: probe.error })
    hooks.log({ tone: probe.ok ? 'ok' : 'fail', text: probe.ok ? `${action} → ok (${probe.ms} ms)` : `${action} → FAILED: ${probe.error ?? 'error'}${hintFor(probe.error) ? ` — ${hintFor(probe.error)}` : ''}` })
    await hooks.hop(node, flow.lambda, { tone: probe.ok ? 'ok' : 'fail', label: probe.ok ? `${probe.ms} ms` : 'error' })
  }

  const degraded = result.status === 'degraded'
  hooks.setNode(flow.lambda, degraded ? { state: 'failed', error: 'A dependency is unavailable' } : { state: 'ok' })
  hooks.log({ tone: degraded ? 'fail' : 'ok', text: `Lambda answers HTTP ${result.httpStatus} (${degraded ? 'degraded' : 'all dependencies ok'})` })
  const tone = degraded ? 'fail' : 'ok'
  await hooks.hop(flow.lambda, flow.url, { tone, label: `HTTP ${result.httpStatus}` })
  hooks.setNode(flow.url, { state: 'ok', ms: result.roundTripMs, note: 'Round trip from the browser' })
  await hooks.hop(flow.url, 'client', { tone, label: `${result.roundTripMs} ms` })
  hooks.log({ tone, text: `Browser received the answer in ${result.roundTripMs} ms` })
  return result
}

/** Runs the Asset and Task health flows one after the other, then infers IAM / CloudWatch. */
export async function runAllChecks(fetchers: { asset: () => Promise<HealthResult>; task: () => Promise<HealthResult> }, hooks: FlowHooks) {
  const asset = await runHealthFlow('asset', fetchers.asset, hooks)
  const task = await runHealthFlow('task', fetchers.task, hooks)

  const probes = [...Object.values(asset.checks), ...Object.values(task.checks)]
  const denied = probes.find((p) => !p.ok && /AccessDenied|403|Expired/i.test(p.error ?? ''))
  if (denied) {
    hooks.setNode('iam', { state: 'failed', error: denied.error, note: 'Inferred: the Lambdas were denied access' })
  } else if (probes.some((p) => p.ok)) {
    hooks.setNode('iam', { state: 'inferred', note: 'Inferred: the Lambdas could reach AWS services' })
  } else {
    hooks.setNode('iam', { state: 'unknown' })
  }
  const anyReached = asset.reachable || task.reachable
  hooks.setNode('cloudwatch', { state: anyReached ? 'inferred' : 'unknown', note: anyReached ? 'Inferred: each invocation writes a log entry (see the Console)' : 'Not testable from the browser' })
  return { asset, task }
}
