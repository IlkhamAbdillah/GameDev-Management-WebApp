import type { Asset, AssetInput, UploadTicket } from '../types'
import { ApiError, request } from './client'

const BASE = import.meta.env.VITE_ASSET_API_URL as string | undefined
const json = (body: unknown) => JSON.stringify(body)
const id = encodeURIComponent

export const assetsApi = {
  list: () => request<Asset[]>(BASE, '/assets'),
  create: (input: AssetInput) => request<Asset>(BASE, '/assets', { method: 'POST', body: json(input) }),
  update: (assetId: string, input: Partial<AssetInput> & { s3Key?: string }) =>
    request<Asset>(BASE, `/assets/${id(assetId)}`, { method: 'PUT', body: json(input) }),
  remove: (assetId: string) => request<void>(BASE, `/assets/${id(assetId)}`, { method: 'DELETE' }),
  createUpload: (assetId: string, file: File) =>
    request<UploadTicket>(BASE, `/assets/${id(assetId)}/upload-url`, {
      method: 'POST',
      body: json({ fileName: file.name, fileSize: file.size }),
    }),
  removeFile: (assetId: string) => request<void>(BASE, `/assets/${id(assetId)}/file`, { method: 'DELETE' }),
}

/** Direct browser -> S3 upload through the pre-signed URL (XHR for upload progress). */
function putToS3(ticket: UploadTicket, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(ticket.method, ticket.uploadUrl)
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded * 100) / e.total))
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(`Upload to storage failed (${xhr.status}). The link may have expired; try again.`, xhr.status))
    xhr.onerror = () => reject(new ApiError('Network error during upload.', 0))
    xhr.send(file)
  })
}

/** 1) ask the API for a pre-signed URL  2) upload straight to S3  3) save the key on the asset. */
export async function uploadAssetFile(assetId: string, file: File, onProgress: (percent: number) => void): Promise<Asset> {
  const ticket = await assetsApi.createUpload(assetId, file)
  await putToS3(ticket, file, onProgress)
  return assetsApi.update(assetId, { s3Key: ticket.s3Key })
}
