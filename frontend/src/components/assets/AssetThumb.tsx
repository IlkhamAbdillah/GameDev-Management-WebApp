import { useEffect, useState } from 'react'
import { getModelThumb } from '../../lib/modelThumbs'
import { TYPE_ICON } from '../../lib/assetUi'
import type { Asset } from '../../types'

/** Thumbnail: the image itself, a rendered snapshot of a .glb model, or a type icon. */
export default function AssetThumb({ asset, className = '' }: { asset: Asset; className?: string }) {
  const [failed, setFailed] = useState(false)
  const [modelThumb, setModelThumb] = useState<string | null | undefined>(undefined) // undefined = still rendering, null = failed
  const isModel = asset.previewKind === 'model'

  useEffect(() => {
    if (!isModel || !asset.previewUrl) return
    let alive = true
    void getModelThumb(asset.s3Key, asset.previewUrl).then((url) => alive && setModelThumb(url))
    return () => {
      alive = false
    }
  }, [isModel, asset.s3Key, asset.previewUrl])

  if (asset.previewKind === 'image' && asset.previewUrl && !failed) {
    return <img src={asset.previewUrl} alt={asset.assetName} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />
  }

  if (isModel && modelThumb) {
    return (
      <div className={`relative bg-bg/60 ${className}`}>
        <img src={modelThumb} alt={`3D preview of ${asset.assetName}`} className="size-full object-contain" />
        <span className="absolute top-1.5 left-1.5 rounded bg-black/50 px-1 text-[10px] font-semibold text-slate-200">3D</span>
      </div>
    )
  }

  const Icon = TYPE_ICON[asset.assetType]
  return (
    <div className={`relative grid place-items-center bg-bg/60 text-slate-500 ${isModel && modelThumb === undefined ? 'animate-pulse' : ''} ${className}`}>
      <Icon size={28} />
      {isModel && <span className="absolute top-1.5 left-1.5 rounded bg-black/50 px-1 text-[10px] font-semibold text-slate-300">3D</span>}
    </div>
  )
}
