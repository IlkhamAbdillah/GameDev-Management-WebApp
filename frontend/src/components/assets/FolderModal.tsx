import { Trash2, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { foldersApi } from '../../api/folders'
import { folderOptions, subtreeIds } from '../../lib/folders'
import type { Folder } from '../../types'

interface Props {
  folder: Folder | null // null => create
  folders: Folder[]
  defaultParentId: string
  onClose: () => void
  onSaved: (folder: Folder) => void
  onDeleted: (folderId: string) => void
}

const field = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent'

export default function FolderModal({ folder, folders, defaultParentId, onClose, onSaved, onDeleted }: Props) {
  const [name, setName] = useState(folder?.name ?? '')
  const [parentId, setParentId] = useState(folder?.parentId ?? defaultParentId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // A folder cannot be moved into itself or one of its own subfolders.
  const parents = useMemo(
    () => folderOptions(folders, folder ? subtreeIds(folders, folder.folderId) : undefined),
    [folders, folder],
  )

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Folder name is required')
    void run(async () => {
      const saved = folder
        ? await foldersApi.update(folder.folderId, { name, parentId })
        : await foldersApi.create(name, parentId)
      onSaved(saved)
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{folder ? 'Edit folder' : 'New folder'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-surface-2"><X size={18} /></button>
        </div>
        <label className="block space-y-1 text-xs text-slate-400">
          Name
          <input autoFocus className={field} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block space-y-1 text-xs text-slate-400">
          Location
          <select className={field} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Assets (top level)</option>
            {parents.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {folder ? (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-sm">
                <button type="button" disabled={busy} onClick={() => void run(async () => { await foldersApi.remove(folder.folderId); onDeleted(folder.folderId) })} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium hover:bg-red-500 disabled:opacity-50">Delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="px-2 text-slate-300">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"><Trash2 size={15} /> Delete</button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-surface-2">Cancel</button>
            <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50">{busy ? 'Saving…' : folder ? 'Save' : 'Create'}</button>
          </div>
        </div>
        {folder && <p className="text-[11px] text-slate-500">Only empty folders can be deleted.</p>}
      </form>
    </div>
  )
}
