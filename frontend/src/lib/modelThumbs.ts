// Thumbnails for .glb models, rendered in the browser with <model-viewer>.
//
// Rendering one live viewer per card would exceed the browser's WebGL context limit (~16), so models
// are rendered ONE AT A TIME through a queue, captured as a PNG, and cached (memory + IndexedDB,
// keyed by the immutable S3 key) so each model is only ever rendered once per browser.

type Viewer = HTMLElement & { toBlob(options?: { mimeType?: string; idealAspect?: boolean }): Promise<Blob> }

const DB_NAME = 'gamevault-thumbs'
const STORE = 'models'
const RENDER_TIMEOUT_MS = 30_000

const cache = new Map<string, Promise<string | null>>()
let queue: Promise<unknown> = Promise.resolve()

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null) // e.g. storage disabled: thumbnails still work, just uncached across reloads
    }
  })
}

async function dbGet(key: string): Promise<Blob | undefined> {
  const db = await openDb()
  if (!db) return undefined
  return new Promise((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result as Blob | undefined)
    request.onerror = () => resolve(undefined)
  })
}

async function dbPut(key: string, blob: Blob): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

async function render(url: string): Promise<Blob> {
  await import('@google/model-viewer')
  const viewer = document.createElement('model-viewer') as Viewer
  viewer.setAttribute('src', url)
  viewer.setAttribute('loading', 'eager')
  viewer.setAttribute('reveal', 'auto')
  viewer.setAttribute('environment-image', 'neutral')
  viewer.setAttribute('shadow-intensity', '0')
  // Must stay in the viewport (model-viewer skips rendering when off-screen) but invisible.
  Object.assign(viewer.style, { position: 'fixed', right: '0', bottom: '0', width: '320px', height: '240px', opacity: '0', pointerEvents: 'none', zIndex: '-1' })
  document.body.appendChild(viewer)
  try {
    await new Promise<void>((resolve, reject) => {
      viewer.addEventListener('load', () => resolve(), { once: true })
      viewer.addEventListener('error', () => reject(new Error('model failed to load')), { once: true })
    })
    // let the first frame reach the canvas before capturing
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return await viewer.toBlob({ mimeType: 'image/png', idealAspect: true })
  } finally {
    viewer.remove()
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), RENDER_TIMEOUT_MS))])
}

async function produce(key: string, url: string): Promise<string | null> {
  try {
    let blob = await dbGet(key)
    if (!blob) {
      blob = await withTimeout(render(url))
      void dbPut(key, blob)
    }
    return URL.createObjectURL(blob)
  } catch {
    return null // caller falls back to an icon
  }
}

/** Object URL of a PNG thumbnail for the model at `url`; null if it cannot be rendered. */
export function getModelThumb(key: string, url: string): Promise<string | null> {
  const existing = cache.get(key)
  if (existing) return existing
  const result = queue.then(() => produce(key, url))
  queue = result
  cache.set(key, result)
  return result
}
