import { ChevronRight, FolderPlus, Home, LayoutGrid, List, Plus, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { assetsApi } from '../api/assets'
import { foldersApi } from '../api/folders'
import AssetCard from '../components/assets/AssetCard'
import AssetModal from '../components/assets/AssetModal'
import FolderCard, { ASSET_DRAG_TYPE } from '../components/assets/FolderCard'
import FolderModal from '../components/assets/FolderModal'
import PageHeader from '../components/PageHeader'
import { folderChain, folderPath } from '../lib/folders'
import { ASSET_STATUSES, ASSET_TYPES, type Asset, type Folder } from '../types'

const select = 'rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

export default function AssetsPage() {
  const [params, setParams] = useSearchParams()
  const [assets, setAssets] = useState<Asset[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ asset: Asset | null } | null>(null)
  const [folderModal, setFolderModal] = useState<{ folder: Folder | null } | null>(null)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('assetView') === 'list' ? 'list' : 'grid'))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [a, f] = await Promise.all([assetsApi.list(), foldersApi.list()])
      setAssets(a)
      setFolders(f)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The open folder lives in the URL (?folder=id) so back/forward and links work.
  const requested = params.get('folder') ?? ''
  const currentId = !loaded || folders.some((f) => f.folderId === requested) ? requested : ''
  const chain = useMemo(() => folderChain(folders, currentId), [folders, currentId])
  const openFolder = (id: string) => setParams(id ? { folder: id } : {})

  const searching = Boolean(search.trim() || type || status)
  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return assets.filter(
      (a) => (!needle || a.assetName.toLowerCase().includes(needle)) && (!type || a.assetType === type) && (!status || a.status === status),
    )
  }, [assets, search, type, status])
  const visibleAssets = searching ? matching : matching.filter((a) => a.folderId === currentId)
  const subfolders = useMemo(() => folders.filter((f) => f.parentId === currentId).sort(byName), [folders, currentId])
  const itemCount = (id: string) => assets.filter((a) => a.folderId === id).length + folders.filter((f) => f.parentId === id).length

  function changeView(next: 'grid' | 'list') {
    setView(next)
    localStorage.setItem('assetView', next)
  }

  function assetSaved(asset: Asset) {
    setAssets((all) => (all.some((a) => a.assetId === asset.assetId) ? all.map((a) => (a.assetId === asset.assetId ? asset : a)) : [asset, ...all]))
  }

  function folderSaved(folder: Folder) {
    setFolders((all) => (all.some((f) => f.folderId === folder.folderId) ? all.map((f) => (f.folderId === folder.folderId ? folder : f)) : [...all, folder]))
    setFolderModal(null)
  }

  function folderDeleted(folderId: string) {
    setFolders((all) => all.filter((f) => f.folderId !== folderId))
    setFolderModal(null)
    if (currentId === folderId) openFolder('')
  }

  async function moveAsset(assetId: string, folderId: string) {
    const before = assets.find((a) => a.assetId === assetId)
    if (!before || before.folderId === folderId) return
    setAssets((all) => all.map((a) => (a.assetId === assetId ? { ...a, folderId } : a)))
    try {
      assetSaved(await assetsApi.update(assetId, { folderId }))
    } catch (err) {
      setAssets((all) => all.map((a) => (a.assetId === assetId ? before : a))) // roll back
      setError(err instanceof Error ? err.message : 'Failed to move asset')
    }
  }

  const dropOnCrumb = (folderId: string) => ({
    onDragOver: (e: React.DragEvent) => e.dataTransfer.types.includes(ASSET_DRAG_TYPE) && e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const id = e.dataTransfer.getData(ASSET_DRAG_TYPE)
      if (id) void moveAsset(id, folderId)
    },
  })

  const viewBtn = (v: 'grid' | 'list') => `p-2 ${view === v ? 'bg-accent/20 text-white' : 'text-slate-400 hover:bg-surface-2'}`
  const crumb = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-surface-2'
  const nothingHere = !searching && subfolders.length === 0 && visibleAssets.length === 0

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Assets"
        subtitle={searching ? `${matching.length} of ${assets.length} assets (all folders)` : `${visibleAssets.length} assets here · ${assets.length} total`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => void load()} aria-label="Refresh" className="rounded-lg border border-line bg-surface p-2 text-slate-300 hover:bg-surface-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setFolderModal({ folder: null })} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm text-slate-200 hover:bg-surface-2">
              <FolderPlus size={16} /> New folder
            </button>
            <button onClick={() => setModal({ asset: null })} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:brightness-110">
              <Plus size={16} /> New asset
            </button>
          </div>
        }
      />

      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-0.5 text-sm text-slate-300">
        <button onClick={() => openFolder('')} className={crumb} {...dropOnCrumb('')}>
          <Home size={14} /> Assets
        </button>
        {chain.map((f) => (
          <span key={f.folderId} className="flex items-center gap-0.5">
            <ChevronRight size={14} className="text-slate-600" />
            <button onClick={() => openFolder(f.folderId)} aria-current={f.folderId === currentId ? 'page' : undefined} className={`${crumb} ${f.folderId === currentId ? 'font-medium text-white' : ''}`} {...dropOnCrumb(f.folderId)}>
              {f.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1 md:max-w-xs">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all folders by name" className={`${select} w-full pl-9`} />
        </div>
        <select className={select} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {ASSET_TYPES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={select} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {ASSET_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex overflow-hidden rounded-lg border border-line bg-surface">
          <button className={viewBtn('grid')} onClick={() => changeView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}><LayoutGrid size={16} /></button>
          <button className={viewBtn('list')} onClick={() => changeView('list')} aria-label="List view" aria-pressed={view === 'list'}><List size={16} /></button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => void load()} className="text-xs underline">Retry</button>
        </div>
      )}

      {loading && !loaded ? (
        <p className="py-16 text-center text-sm text-slate-400">Loading assets…</p>
      ) : (
        <>
          {!searching && subfolders.length > 0 && (
            <section aria-label="Folders" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {subfolders.map((f) => (
                <FolderCard key={f.folderId} folder={f} itemCount={itemCount(f.folderId)} onOpen={openFolder} onEdit={(folder) => setFolderModal({ folder })} onDropAsset={(id, to) => void moveAsset(id, to)} />
              ))}
            </section>
          )}

          {visibleAssets.length > 0 && (
            <section aria-label="Assets" className={view === 'grid' ? 'grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4' : 'space-y-2'}>
              {visibleAssets.map((a) => (
                <AssetCard key={a.assetId} asset={a} view={view} path={searching ? folderPath(folders, a.folderId) || 'Assets' : undefined} onOpen={(asset) => setModal({ asset })} />
              ))}
            </section>
          )}

          {searching && visibleAssets.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-slate-400">No assets match these filters.</div>
          )}
          {nothingHere && (
            <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-slate-400">
              {currentId ? 'This folder is empty. Create a subfolder or add an asset.' : 'No assets yet. Create a folder or the first asset.'}
            </div>
          )}
        </>
      )}

      {modal && (
        <AssetModal
          key={modal.asset?.assetId ?? 'new'}
          asset={modal.asset}
          folders={folders}
          defaultFolderId={currentId}
          onClose={() => setModal(null)}
          onSaved={assetSaved}
          onDeleted={(id) => {
            setAssets((all) => all.filter((a) => a.assetId !== id))
            setModal(null)
          }}
        />
      )}
      {folderModal && (
        <FolderModal
          key={folderModal.folder?.folderId ?? 'new'}
          folder={folderModal.folder}
          folders={folders}
          defaultParentId={currentId}
          onClose={() => setFolderModal(null)}
          onSaved={folderSaved}
          onDeleted={folderDeleted}
        />
      )}
    </div>
  )
}
