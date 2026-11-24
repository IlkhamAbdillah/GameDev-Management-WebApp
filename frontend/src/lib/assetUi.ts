import { Box, File, Film, type LucideIcon, Mountain, Music, PanelTop, Sparkles, User } from 'lucide-react'
import type { AssetStatus, AssetType } from '../types'

/** Must match backend/asset-handler/filetypes.py (the server is the source of truth). */
export const ALLOWED_EXTENSIONS = [
  '.fbx', '.obj', '.glb', '.gltf',
  '.png', '.jpg', '.jpeg', '.webp',
  '.wav', '.mp3', '.ogg',
  '.anim', '.bvh', '.blend', '.zip', '.json',
]
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export function validateFile(file: File): string | null {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
  if (file.size === 0) return 'File is empty'
  if (file.size > MAX_UPLOAD_BYTES) return `File is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`
  return null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const TYPE_ICON: Record<AssetType, LucideIcon> = {
  Character: User,
  Environment: Mountain,
  Props: Box,
  Animation: Film,
  Audio: Music,
  UI: PanelTop,
  VFX: Sparkles,
  Other: File,
}

export const ASSET_STATUS_STYLE: Record<AssetStatus, string> = {
  Planned: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  'In Progress': 'bg-blue-500/15 text-blue-300 ring-blue-500/30',
  Review: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  Completed: 'bg-green-500/15 text-green-300 ring-green-500/30',
}

/** Client-side mirror of the server's preview rules, used to preview a file before it is uploaded. */
export function previewKindOf(fileName: string): 'image' | 'audio' | 'model' | '' {
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : ''
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return 'image'
  if (['.wav', '.mp3', '.ogg'].includes(ext)) return 'audio'
  if (ext === '.glb') return 'model'
  return ''
}
