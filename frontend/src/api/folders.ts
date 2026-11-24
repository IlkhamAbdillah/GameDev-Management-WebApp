import type { Folder } from '../types'
import { request } from './client'

const BASE = import.meta.env.VITE_ASSET_API_URL as string | undefined // folders are part of the Assets module
const json = (body: unknown) => JSON.stringify(body)
const id = encodeURIComponent

export const foldersApi = {
  list: () => request<Folder[]>(BASE, '/folders'),
  create: (name: string, parentId: string) =>
    request<Folder>(BASE, '/folders', { method: 'POST', body: json({ name, parentId }) }),
  update: (folderId: string, input: { name?: string; parentId?: string }) =>
    request<Folder>(BASE, `/folders/${id(folderId)}`, { method: 'PUT', body: json(input) }),
  remove: (folderId: string) => request<void>(BASE, `/folders/${id(folderId)}`, { method: 'DELETE' }),
}
