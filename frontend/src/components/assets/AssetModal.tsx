import { Download, FileQuestion, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { assetsApi, uploadAssetFile } from '../../api/assets'
import { ALLOWED_EXTENSIONS, TYPE_ICON, formatBytes, previewKindOf, validateFile } from '../../lib/assetUi'
import { folderOptions } from '../../lib/folders'
import { ASSET_STATUSES, ASSET_TYPES, type Asset, type AssetInput, type Folder } from '../../types'
import ModelPreview from './ModelPreview'

interface Props {
  asset: Asset | null // null => create
  folders: Folder[]
  defaultFolderId: string
  onClose: () => void
  onSaved: (asset: Asset) => void
  onDeleted: (assetId: string) => void
}

const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent'
const PANEL = 'min-h-72 lg:min-h-[28rem]'

export default function AssetModal({ asset, folders, defaultFolderId, onClose, onSaved, onDeleted }: Props) {
  const options = folderOptions(folders)
  const [current, setCurrent] = useState<Asset | null>(asset)
  const [form, setForm] = useState<AssetInput>({
    assetName: asset?.assetName ?? '',
    assetType: asset?.assetType ?? 'Character',
    description: asset?.description ?? '',
    assignedTo: asset?.assignedTo ?? '',
    status: asset?.status ?? 'Planned',
    folderId: asset?.folderId ?? defaultFolderId,
  })
  const [file, setFile] = useState<File | null>(null)
  const [localUrl, setLocalUrl] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'asset' | 'file' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // A freshly chosen file is previewed straight from the browser, before it is uploaded.
  useEffect(() => {
    if (!file) {
      setLocalUrl('')
      return
    }
    const url = URL.createObjectURL(file)
    setLocalUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const set = <K extends keyof AssetInput>(key: K, value: AssetInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  function pickFile(picked: File | undefined) {
    if (!picked) return setFile(null)
    const problem = validateFile(picked)
    if (problem) {
      setError(problem)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    setError('')
    setFile(picked)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.assetName.trim()) return setError('Asset name is required')
    void run(async () => {
      let saved = current ? await assetsApi.update(current.assetId, form) : await assetsApi.create(form)
      setCurrent(saved)
      onSaved(saved) // list is updated even if the upload below fails
      if (file) {
        try {
          setProgress(0)
          saved = await uploadAssetFile(saved.assetId, file, setProgress)
        } catch (err) {
          throw new Error(`Saved, but the file upload failed: ${err instanceof Error ? err.message : 'unknown error'}`)
        }
        setCurrent(saved)
        onSaved(saved)
      }
      onClose()
    })
  }

  const removeFile = () =>
    run(async () => {
      if (!current) return
      await assetsApi.removeFile(current.assetId)
      const refreshed = { ...current, s3Key: '', fileName: '', downloadUrl: '', previewUrl: '', previewKind: '' as const }
      setCurrent(refreshed)
      onSaved(refreshed)
      setConfirm(null)
    })

  const removeAsset = () =>
    run(async () => {
      if (!current) return
      await assetsApi.remove(current.assetId)
      onDeleted(current.assetId)
    })

  // What the big preview panel shows: the newly chosen file, else the stored one.
  const preview = file
    ? { kind: previewKindOf(file.name), url: localUrl, name: file.name }
    : current?.fileName
      ? { kind: current.previewKind, url: current.previewUrl, name: current.fileName }
      : null
  const TypeIcon = TYPE_ICON[form.assetType]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3 md:p-6" onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} className="max-h-full w-full max-w-6xl overflow-auto rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="truncate text-lg font-semibold">{current ? current.assetName : 'New asset'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          {/* ---- left: large preview + file controls ---- */}
          <section aria-label="Preview" className="min-w-0 space-y-3">
            {preview?.kind === 'model' && preview.url ? (
              <ModelPreview key={preview.url} src={preview.url} name={preview.name} />
            ) : preview?.kind === 'image' && preview.url ? (
              <div className={`grid place-items-center rounded-xl bg-bg p-2 ${PANEL}`}>
                <img src={preview.url} alt={`Preview of ${preview.name}`} className="max-h-[min(62vh,560px)] max-w-full object-contain" />
              </div>
            ) : preview?.kind === 'audio' && preview.url ? (
              <div className={`grid place-content-center gap-4 rounded-xl bg-bg p-6 ${PANEL}`}>
                <TypeIcon size={56} className="mx-auto text-slate-600" />
                <audio controls src={preview.url} className="w-full" />
              </div>
            ) : (
              <div className={`grid place-content-center justify-items-center gap-2 rounded-xl border border-dashed border-line bg-bg/50 p-6 text-center ${PANEL}`}>
                <FileQuestion size={40} className="text-slate-600" />
                <p className="text-sm text-slate-400">{preview ? 'No in-browser preview for this format.' : 'No file yet.'}</p>
                <p className="text-xs text-slate-500">{preview ? 'Download it to open.' : 'Choose a file below. Images, audio and .glb models preview here.'}</p>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-line p-3">
              {current?.fileName && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm" title={current.fileName}>{current.fileName}</span>
                  <a href={current.downloadUrl} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
                    <Download size={15} /> Download
                  </a>
                  {confirm === 'file' ? (
                    <span className="flex items-center gap-2 text-sm">
                      <button type="button" disabled={busy} onClick={() => void removeFile()} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium hover:bg-red-500 disabled:opacity-50">Remove</button>
                      <button type="button" onClick={() => setConfirm(null)} className="px-2 text-slate-300">Cancel</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirm('file')} className="rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10">Remove file</button>
                  )}
                </div>
              )}
              <input ref={fileInput} type="file" accept={ALLOWED_EXTENSIONS.join(',')} onChange={(e) => pickFile(e.target.files?.[0])} className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-slate-200" />
              {file && (
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <Upload size={12} /> {file.name} · {formatBytes(file.size)} {current?.fileName ? '· replaces the current file when saved' : '· uploaded when saved'}
                </p>
              )}
              {progress !== null && (
                <div className="h-2 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          </section>

          {/* ---- right: details ---- */}
          <section aria-label="Details" className="min-w-0 space-y-4">
            <label className="block space-y-1 text-xs text-slate-400">
              Name
              <input autoFocus className={field} maxLength={100} value={form.assetName} onChange={(e) => set('assetName', e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-slate-400">
                Category
                <select className={field} value={form.assetType} onChange={(e) => set('assetType', e.target.value as AssetInput['assetType'])}>
                  {ASSET_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-400">
                Status
                <select className={field} value={form.status} onChange={(e) => set('status', e.target.value as AssetInput['status'])}>
                  {ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-1 text-xs text-slate-400">
              Folder
              <select className={field} value={form.folderId} onChange={(e) => set('folderId', e.target.value)}>
                <option value="">Assets (top level)</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-xs text-slate-400">
              Assigned to
              <input className={field} maxLength={100} value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} />
            </label>
            <label className="block space-y-1 text-xs text-slate-400">
              Description
              <textarea className={field} rows={5} maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </label>
            {current && (
              <p className="text-[11px] text-slate-500">
                Created {new Date(current.createdAt).toLocaleString()} · Updated {new Date(current.updatedAt).toLocaleString()}
              </p>
            )}
            {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              {current ? (
                confirm === 'asset' ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400">Delete asset and file?</span>
                    <button type="button" disabled={busy} onClick={() => void removeAsset()} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium hover:bg-red-500 disabled:opacity-50">Delete</button>
                    <button type="button" onClick={() => setConfirm(null)} className="px-2 text-slate-300">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirm('asset')} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10">
                    <Trash2 size={15} /> Delete
                  </button>
                )
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-surface-2">Close</button>
                <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">
                  {busy ? (progress !== null ? `Uploading ${progress}%` : 'Saving…') : current ? 'Save changes' : 'Create asset'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </form>
    </div>
  )
}
