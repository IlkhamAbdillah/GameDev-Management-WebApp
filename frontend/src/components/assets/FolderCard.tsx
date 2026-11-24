import { Folder as FolderIcon, Pencil } from 'lucide-react'
import { useState } from 'react'
import type { Folder } from '../../types'

interface Props {
  folder: Folder
  itemCount: number
  onOpen: (folderId: string) => void
  onEdit: (folder: Folder) => void
  onDropAsset: (assetId: string, folderId: string) => void
}

export const ASSET_DRAG_TYPE = 'application/x-gamevault-asset'

export default function FolderCard({ folder, itemCount, onOpen, onEdit, onDropAsset }: Props) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE)
        if (assetId) onDropAsset(assetId, folder.folderId)
      }}
      className={`group flex items-center gap-3 rounded-2xl border bg-surface p-3 transition-colors ${over ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/50'}`}
    >
      <button onClick={() => onOpen(folder.folderId)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <FolderIcon size={26} className="shrink-0 text-amber-300/80" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{folder.name}</span>
          <span className="block text-xs text-slate-500">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
        </span>
      </button>
      <button onClick={() => onEdit(folder)} aria-label={`Edit folder ${folder.name}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-surface-2 hover:text-slate-200">
        <Pencil size={15} />
      </button>
    </div>
  )
}
