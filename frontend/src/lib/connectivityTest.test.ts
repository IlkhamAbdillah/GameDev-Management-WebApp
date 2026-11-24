import { beforeEach, describe, expect, it, vi } from 'vitest'

const assets = vi.hoisted(() => ({
  create: vi.fn(),
  createUpload: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  putToS3: vi.fn(),
}))
const tasks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn(), timeline: vi.fn() }))

vi.mock('../api/assets', () => ({
  assetsApi: { create: assets.create, createUpload: assets.createUpload, update: assets.update, remove: assets.remove },
  putToS3: assets.putToS3,
}))
vi.mock('../api/tasks', () => ({
  tasksApi: { create: tasks.create, remove: tasks.remove },
  timelineApi: { get: tasks.timeline },
}))

import { runRoundTrip, type StepResult } from './connectivityTest'

const PROBE = 'gamevault-connectivity-probe'

function happyPath() {
  assets.create.mockResolvedValue({ assetId: 'a1' })
  assets.createUpload.mockResolvedValue({ s3Key: 'assets/a1/x-probe.json', uploadUrl: 'u', method: 'PUT', headers: {}, expiresIn: 300 })
  assets.putToS3.mockResolvedValue(undefined)
  assets.update.mockResolvedValue({ assetId: 'a1', downloadUrl: 'https://s3/download' })
  assets.remove.mockResolvedValue(undefined)
  tasks.create.mockResolvedValue({ taskId: 't1' })
  tasks.timeline.mockResolvedValue({ tasks: [{ taskId: 't1' }] })
  tasks.remove.mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(PROBE)))
}

const run = async () => {
  let last: StepResult[] = []
  const result = await runRoundTrip((steps) => (last = steps))
  return { steps: last, ...result }
}
const statuses = (steps: StepResult[]) => Object.fromEntries(steps.map((s) => [s.id, s.status]))

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  happyPath()
})

describe('runRoundTrip', () => {
  it('runs every step in order and deletes what it created exactly once', async () => {
    const { steps, cleanupWarning } = await run()
    expect(steps.every((s) => s.status === 'ok')).toBe(true)
    expect(cleanupWarning).toBeUndefined()
    expect(assets.remove).toHaveBeenCalledTimes(1)
    expect(tasks.remove).toHaveBeenCalledTimes(1)
    expect(assets.create.mock.calls[0][0].assetName).toMatch(/^connectivity-probe-/)
  })

  it('stops at the first failure, skips the rest and still cleans up', async () => {
    assets.putToS3.mockRejectedValue(new Error('Upload to storage failed (403)'))
    const { steps, cleanupWarning } = await run()
    expect(statuses(steps)).toMatchObject({ createAsset: 'ok', uploadUrl: 'ok', putS3: 'failed', attach: 'skipped', download: 'skipped', createTask: 'skipped', deleteTask: 'skipped' })
    expect(steps.find((s) => s.id === 'putS3')?.error).toContain('403')
    expect(assets.remove).toHaveBeenCalledTimes(1) // the temporary asset is removed in cleanup
    expect(tasks.create).not.toHaveBeenCalled()
    expect(cleanupWarning).toBeUndefined()
  })

  it('fails the download step when the bytes differ', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('something else')))
    const { steps } = await run()
    expect(steps.find((s) => s.id === 'download')).toMatchObject({ status: 'failed', error: expect.stringContaining('differs') })
  })

  it('fails when the task does not show up on the timeline, and removes the task', async () => {
    tasks.timeline.mockResolvedValue({ tasks: [] })
    const { steps } = await run()
    expect(statuses(steps)).toMatchObject({ timeline: 'failed', deleteTask: 'skipped' })
    expect(tasks.remove).toHaveBeenCalledTimes(1)
  })

  it('warns when temporary data could not be deleted', async () => {
    assets.update.mockRejectedValue(new Error('boom'))
    assets.remove.mockRejectedValue(new Error('still boom'))
    const { cleanupWarning } = await run()
    expect(cleanupWarning).toMatch(/Could not delete the temporary asset "connectivity-probe-/)
  })
})
