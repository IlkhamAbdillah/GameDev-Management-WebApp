import { assetsApi, putToS3 } from '../api/assets'
import { authApi } from '../api/auth'
import { tasksApi, timelineApi } from '../api/tasks'
import type { Asset, Task, UploadTicket } from '../types'
import { todayIso } from './dates'
import { noopHooks, type FlowHooks, type NodeId } from './flowModel'

export type StepStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped'

export interface StepResult {
  id: string
  label: string
  status: StepStatus
  ms?: number
  error?: string
}

/** One hop of a step's journey through the architecture diagram: [from, to, label]. */
export type Leg = [from: NodeId, to: NodeId, label?: string]

export const ROUND_TRIP_STEPS: { id: string; label: string; legs: Leg[] }[] = [
  { id: 'session', label: 'Check the signed-in session (Lambda verifies the token and reads the user)', legs: [['client', 'authUrl', 'GET /auth/me'], ['authUrl', 'authLambda', 'invoke'], ['authLambda', 'usersTable', 'GetItem']] },
  { id: 'createAsset', label: 'Create a temporary asset (Lambda → DynamoDB write)', legs: [['client', 'assetUrl', 'POST /assets'], ['assetUrl', 'assetLambda', 'invoke'], ['assetLambda', 'assetsTable', 'PutItem']] },
  { id: 'uploadUrl', label: 'Request a pre-signed upload URL (Lambda signs for S3)', legs: [['client', 'assetUrl', 'POST /upload-url'], ['assetUrl', 'assetLambda', 'invoke'], ['assetLambda', 'assetsTable', 'GetItem']] },
  { id: 'putS3', label: 'Upload a tiny file straight from the browser to S3 (CORS + signature)', legs: [['client', 's3', 'PUT (pre-signed)']] },
  { id: 'attach', label: 'Save the S3 key on the asset (Lambda checks the object exists)', legs: [['client', 'assetUrl', 'PUT /assets/{id}'], ['assetUrl', 'assetLambda', 'invoke'], ['assetLambda', 's3', 'HeadObject'], ['assetLambda', 'assetsTable', 'UpdateItem']] },
  { id: 'download', label: 'Download it through a pre-signed URL and compare the bytes', legs: [['client', 's3', 'GET (pre-signed)']] },
  { id: 'deleteAsset', label: 'Delete the asset (also removes its file from S3)', legs: [['client', 'assetUrl', 'DELETE /assets/{id}'], ['assetUrl', 'assetLambda', 'invoke'], ['assetLambda', 's3', 'delete files'], ['assetLambda', 'assetsTable', 'DeleteItem']] },
  { id: 'createTask', label: 'Create a temporary task (Lambda → DynamoDB write)', legs: [['client', 'taskUrl', 'POST /tasks'], ['taskUrl', 'taskLambda', 'invoke'], ['taskLambda', 'tasksTable', 'PutItem']] },
  { id: 'timeline', label: 'Find the task on the Timeline (derived from tasks)', legs: [['client', 'taskUrl', 'GET /timeline'], ['taskUrl', 'taskLambda', 'invoke'], ['taskLambda', 'tasksTable', 'Scan']] },
  { id: 'deleteTask', label: 'Delete the task', legs: [['client', 'taskUrl', 'DELETE /tasks/{id}'], ['taskUrl', 'taskLambda', 'invoke'], ['taskLambda', 'tasksTable', 'DeleteItem']] },
]

const PROBE_TEXT = 'gamevault-connectivity-probe'

/**
 * Real round trip through every layer: browser → Lambda → DynamoDB / S3 → browser.
 * It creates one temporary asset (with a tiny file) and one temporary task and removes them again,
 * even if a step fails. Reports progress through `onUpdate`; returns a cleanup warning if needed.
 */
export async function runRoundTrip(onUpdate: (steps: StepResult[]) => void, hooks: FlowHooks = noopHooks): Promise<{ cleanupWarning?: string }> {
  const steps: StepResult[] = ROUND_TRIP_STEPS.map(({ id, label }) => ({ id, label, status: 'pending' }))
  const publish = () => onUpdate(steps.map((s) => ({ ...s })))
  publish()

  const name = `connectivity-probe-${Date.now()}`
  const file = new File([PROBE_TEXT], 'connectivity-probe.json', { type: 'application/json' })
  let asset: Asset | undefined
  let assetDeleted = false
  let ticket: UploadTicket | undefined
  let task: Task | undefined
  let taskDeleted = false
  let failed = false
  let cleanupWarning: string | undefined

  async function step(id: string, action: () => Promise<void>) {
    const entry = steps.find((s) => s.id === id)!
    const { legs } = ROUND_TRIP_STEPS.find((s) => s.id === id)!
    if (failed) {
      entry.status = 'skipped'
      return publish()
    }
    entry.status = 'running'
    publish()
    hooks.log({ tone: 'info', text: entry.label })
    const started = performance.now()

    // The request travels along the diagram while it is really in flight; the step ends when both are done.
    const outbound = (async () => {
      for (const [from, to, label] of legs) await hooks.hop(from, to, { label })
    })()
    const [result] = await Promise.allSettled([action(), outbound])

    const ok = result.status === 'fulfilled'
    const touched = [...new Set(legs.map(([, to]) => to))]
    const ms = Math.round(performance.now() - started)
    if (ok) {
      for (const node of touched) hooks.setNode(node, { state: 'ok', ms })
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : 'Unknown error'
      entry.error = reason
      hooks.setNode(legs[legs.length - 1][1], { state: 'failed', error: reason })
      hooks.log({ tone: 'fail', text: `${entry.label} → FAILED: ${reason}` })
    }
    for (const [from, to] of [...legs].reverse()) await hooks.hop(to, from, { tone: ok ? 'ok' : 'fail' })
    if (ok) hooks.log({ tone: 'ok', text: `${entry.label} → ok (${ms} ms)` })

    entry.status = ok ? 'ok' : 'failed'
    if (!ok) failed = true
    entry.ms = ms
    publish()
  }

  try {
    await step('session', async () => {
      await authApi.me()
    })
    await step('createAsset', async () => {
      asset = await assetsApi.create({ assetName: name, assetType: 'Other', description: 'Temporary asset created by the Connectivity page', assignedTo: '', status: 'Planned', folderId: '' })
    })
    await step('uploadUrl', async () => {
      ticket = await assetsApi.createUpload(asset!.assetId, file)
    })
    await step('putS3', () => putToS3(ticket!, file, () => {}))
    await step('attach', async () => {
      asset = await assetsApi.update(asset!.assetId, { s3Key: ticket!.s3Key })
    })
    await step('download', async () => {
      const response = await fetch(asset!.downloadUrl)
      if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`)
      if ((await response.text()) !== PROBE_TEXT) throw new Error('Downloaded content differs from what was uploaded')
    })
    await step('deleteAsset', async () => {
      await assetsApi.remove(asset!.assetId)
      assetDeleted = true
    })
    await step('createTask', async () => {
      const today = todayIso()
      task = await tasksApi.create({ title: name, description: 'Temporary task created by the Connectivity page', assignee: '', category: 'Other', priority: 'Low', status: 'To Do', startDate: today, dueDate: today })
    })
    await step('timeline', async () => {
      const today = todayIso()
      const { tasks } = await timelineApi.get({ startDate: today, endDate: today })
      if (!tasks.some((t) => t.taskId === task!.taskId)) throw new Error('The new task did not appear on the timeline')
    })
    await step('deleteTask', async () => {
      await tasksApi.remove(task!.taskId)
      taskDeleted = true
    })
  } finally {
    // Never leave probe data behind, whatever failed above.
    const leftovers: string[] = []
    if (asset && !assetDeleted) await assetsApi.remove(asset.assetId).catch(() => leftovers.push(`asset "${name}"`))
    if (task && !taskDeleted) await tasksApi.remove(task.taskId).catch(() => leftovers.push(`task "${name}"`))
    if (leftovers.length) cleanupWarning = `Could not delete the temporary ${leftovers.join(' and ')}. Remove it manually.`
  }
  return { cleanupWarning }
}
