import { Folder as FolderIcon, Paperclip, User } from 'lucide-react'
import { ASSET_STATUS_STYLE } from '../../lib/assetUi'
import type { Asset } from '../../types'
import AssetThumb from './AssetThumb'
import { ASSET_DRAG_TYPE } from './FolderCard'

interface Props {
  asset: Asset
  view: 'grid' | 'list'
  onOpen: (asset: Asset) => void
  path?: string // shown when results come from several folders (search/filter)
}

export default function AssetCard({ asset, view, onOpen, path }: Props) {
  const drag = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.assetId)
      e.dataTransfer.effectAllowed = 'move'
    },
  }
  const where = path ? <span className="flex items-center gap-1 truncate text-[11px] text-slate-500"><FolderIcon size={11} />{path}</span> : null
  const badge = <span className={`rounded-md px-1.5 py-0.5 text-[11px] ring-1 ${ASSET_STATUS_STYLE[asset.status]}`}>{asset.status}</span>

  if (view === 'list') {
    return (
      <button {...drag} onClick={() => onOpen(asset)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left hover:border-accent/50">
        <AssetThumb asset={asset} className="size-12 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{asset.assetName}</div>
          <div className="truncate text-xs text-slate-500">{asset.fileName || 'No file'}</div>
          {where}
        </div>
        <span className="hidden w-24 text-xs text-slate-400 sm:block">{asset.assetType}</span>
        <span className="hidden w-28 truncate text-xs text-slate-400 md:block">{asset.assignedTo || 'Unassigned'}</span>
        {badge}
      </button>
    )
  }

  return (
    <button {...drag} onClick={() => onOpen(asset)} className="overflow-hidden rounded-2xl border border-line bg-surface text-left transition-colors hover:border-accent/50">
      <AssetThumb asset={asset} className="aspect-video w-full" />
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium">{asset.assetName}</h3>
          {badge}
        </div>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="rounded-md bg-slate-700/40 px-1.5 py-0.5">{asset.assetType}</span>
          {asset.fileName && <Paperclip size={13} aria-label="Has file" />}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <User size={12} />
          <span className="truncate">{asset.assignedTo || 'Unassigned'}</span>
        </div>
        {where}
      </div>
    </button>
  )
}
