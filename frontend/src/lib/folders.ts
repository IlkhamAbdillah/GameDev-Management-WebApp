import type { Folder } from '../types'

/** Chain of folders from the top level down to folderId (empty for the root). */
export function folderChain(folders: Folder[], folderId: string): Folder[] {
  const byId = new Map(folders.map((f) => [f.folderId, f]))
  const chain: Folder[] = []
  const seen = new Set<string>()
  let current = byId.get(folderId)
  while (current && !seen.has(current.folderId)) {
    seen.add(current.folderId)
    chain.unshift(current)
    current = byId.get(current.parentId)
  }
  return chain
}

export const folderPath = (folders: Folder[], folderId: string) =>
  folderChain(folders, folderId).map((f) => f.name).join(' / ')

/** The folder itself plus everything below it. */
export function subtreeIds(folders: Folder[], folderId: string): Set<string> {
  const ids = new Set([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (!ids.has(f.folderId) && ids.has(f.parentId)) {
        ids.add(f.folderId)
        grew = true
      }
    }
  }
  return ids
}

/** Options for a folder <select>: every folder labelled by its full path, sorted by path. */
export function folderOptions(folders: Folder[], exclude?: Set<string>) {
  return folders
    .filter((f) => !exclude?.has(f.folderId))
    .map((f) => ({ id: f.folderId, label: folderPath(folders, f.folderId) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
