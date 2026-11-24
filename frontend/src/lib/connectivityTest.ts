import { assetsApi, putToS3 } from '../api/assets'
import { tasksApi, timelineApi } from '../api/tasks'
import type { Asset, Task, UploadTicket } from '../types'
import { todayIso } from './dates'

export type StepStatus = 'pending' | 'running' | 'ok' | 'failed' | 'skipped'

export interface StepResult {
  id: string
  label: string
  status: StepStatus
  ms?: number
  error?: string
}

export const ROUND_TRIP_STEPS: { id: string; label: string }[] = [
  { id: 'createAsset', label: 'Create a temporary asset (Lambda → DynamoDB write)' },
  { id: 'uploadUrl', label: 'Request a pre-signed upload URL (Lambda signs for S3)' },
  { id: 'putS3', label: 'Upload a tiny file straight from the browser to S3 (CORS + signature)' },
  { id: 'attach', label: 'Save the S3 key on the asset (Lambda checks the object exists)' },
  { id: 'download', label: 'Download it through a pre-signed URL and compare the bytes' },
  { id: 'deleteAsset', label: 'Delete the asset (also removes its file from S3)' },
  { id: 'createTask', label: 'Create a temporary task (Lambda → DynamoDB write)' },
  { id: 'timeline', label: 'Find the task on the Timeline (derived from tasks)' },
  { id: 'deleteTask', label: 'Delete the task' },
]

const PROBE_TEXT = 'gamevault-connectivity-probe'

/**
 * Real round trip through every layer: browser → Lambda → DynamoDB / S3 → browser.
 * It creates one temporary asset (with a tiny file) and one temporary task and removes them again,
 * even if a step fails. Reports progress through `onUpdate`; returns a cleanup warning if needed.
 */
export async function runRoundTrip(onUpdate: (steps: StepResult[]) => void): Promise<{ cleanupWarning?: string }> {
  const steps: StepResult[] = ROUND_TRIP_STEPS.map((s) => ({ ...s, status: 'pending' }))
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
    if (failed) {
      entry.status = 'skipped'
      return publish()
    }
    entry.status = 'running'
    publish()
    const started = performance.now()
    try {
      await action()
      entry.status = 'ok'
    } catch (err) {
      entry.status = 'failed'
      entry.error = err instanceof Error ? err.message : 'Unknown error'
      failed = true
    }
    entry.ms = Math.round(performance.now() - started)
    publish()
  }

  try {
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
