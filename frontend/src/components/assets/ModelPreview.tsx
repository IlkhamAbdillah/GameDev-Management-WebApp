import { useEffect, useRef, useState, type ElementType } from 'react'

// <model-viewer> is a web component (Google), registered lazily so the ~1 MB viewer is only
// downloaded when a .glb is actually opened.
const ModelViewer = 'model-viewer' as ElementType

export default function ModelPreview({ src, name, height = 'min(62vh, 560px)' }: { src: string; name: string; height?: string }) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    import('@google/model-viewer').catch(() => !cancelled && setState('error'))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onLoad = () => setState('ready')
    const onError = () => setState('error')
    el.addEventListener('load', onLoad)
    el.addEventListener('error', onError)
    return () => {
      el.removeEventListener('load', onLoad)
      el.removeEventListener('error', onError)
    }
  }, [])

  if (state === 'error') {
    return <p className="rounded-lg bg-bg px-3 py-6 text-center text-xs text-slate-400">This 3D model cannot be previewed. You can still download it.</p>
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-bg">
      <ModelViewer
        ref={ref}
        src={src}
        alt={`3D preview of ${name}`}
        camera-controls=""
        auto-rotate=""
        shadow-intensity="1"
        touch-action="pan-y"
        environment-image="neutral"
        style={{ width: '100%', height, background: 'transparent' }}
      />
      {state === 'loading' && <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-slate-400">Loading 3D model…</div>}
      {state === 'ready' && <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-500">Drag to rotate · scroll to zoom</p>}
    </div>
  )
}
