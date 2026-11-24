# API Documentation

Base URLs: one Lambda Function URL per module, from `.aws/outputs.json` (`assetApiUrl` for `/assets`, `taskApiUrl` for `/tasks`). All bodies are JSON.

Success: `{"success": true, "data": ...}` · Error: `{"success": false, "message": "..."}`

| Method | Path | Description | Success |
|---|---|---|---|
| GET | `/health` | Checks Lambda → DynamoDB and S3 connectivity | 200 |
| POST | `/assets` | Create asset | 201 |
| GET | `/assets` | List assets. Optional query: `search` (name contains), `assetType`, `status` | 200 |
| GET | `/assets/{assetId}` | Asset details | 200 |
| PUT | `/assets/{assetId}` | Partial update of supplied fields | 200 |
| DELETE | `/assets/{assetId}` | Delete asset | 204 (no body) |

Errors: `400` invalid payload, `404` asset/route not found, `500` generic internal error (details only in CloudWatch).

## Asset fields
| Field | Rules |
|---|---|
| `assetName` | required on create, ≤100 chars |
| `assetType` | required on create: Character, Environment, Props, Animation, Audio, UI, VFX, Other |
| `status` | Planned (default), In Progress, Review, Completed |
| `description` | ≤1000 chars |
| `assignedTo` | ≤100 chars |
| `s3Key` | ≤1024 chars (set by upload flow in Phase 4) |

`assetId`, `createdAt`, `updatedAt` are server-generated; client-supplied values are ignored.

## Example
```bash
curl -X POST $URL/assets -H 'content-type: application/json' \
  -d '{"assetName":"Main Character","assetType":"Character","assignedTo":"Rina"}'
```
Real captured output: `docs/evidence/api-test-output.txt`.

## Tasks API (Phase 2) — `taskApiUrl`
| Method | Path | Description | Success |
|---|---|---|---|
| GET | `/health` | DynamoDB connectivity | 200 |
| POST | `/tasks` | Create task | 201 |
| GET | `/tasks` | List tasks. Optional query: `search` (title contains), `status`, `priority`, `category`, `assignee`. Sorted by `dueDate` (undated last) | 200 |
| GET | `/tasks/{taskId}` | Task details | 200 |
| PUT | `/tasks/{taskId}` | Partial update (also used to change status) | 200 |
| DELETE | `/tasks/{taskId}` | Delete task | 204 |

| Field | Rules |
|---|---|
| `title` | required on create, ≤120 chars |
| `category` | Programming, Art, Design, Audio, Testing, Documentation, Other (default Other) |
| `priority` | Low, Medium (default), High, Critical |
| `status` | To Do (default), In Progress, In Review, Done |
| `assignee` | ≤100 chars |
| `description` | ≤2000 chars |
| `startDate`, `dueDate` | optional, valid `YYYY-MM-DD` (or empty); `dueDate` must not be before `startDate` (also checked against the stored value on partial updates) |

Tasks never reference assets.

## Timeline API (Phase 3) — `taskApiUrl`
`GET /timeline` is served by the Task Lambda and derived entirely from task records (no Timeline table).

| Query | Description |
|---|---|
| `startDate`, `endDate` | `YYYY-MM-DD`. Returns tasks whose bar **overlaps** the window (`end >= startDate` and `start <= endDate`). `endDate` must not be before `startDate` |
| `status`, `category` | enum filters |
| `assignee` | exact match |

Response `data`:
```json
{
  "tasks": [{"taskId": "...", "title": "Enemy AI", "assignee": "Rina", "category": "Programming",
             "priority": "High", "status": "In Progress", "startDate": "2026-11-22",
             "dueDate": "2026-11-27", "start": "2026-11-22", "end": "2026-11-27"}],
  "stats": {"total": 6, "done": 1, "completionRate": 17,
            "byStatus": {"To Do": 3, "In Progress": 1, "In Review": 1, "Done": 1},
            "overdue": 1, "dueSoon": 1, "unscheduled": 0}
}
```
- `start`/`end` is the bar range. A task with only one date is a one-day bar; a task with no dates is not drawn and is counted in `stats.unscheduled`. Entries are sorted by `start`.
- `stats` is **overall** for tasks matching `status`/`category`/`assignee` — it is not limited by the date window. `overdue` = due date before today (UTC) and not Done; `dueSoon` = due within 3 days and not Done.
- 400 on an invalid date, enum, or reversed range.

Real captured output: `docs/evidence/timeline-api-test-output.txt`.

## Folders (Phase 4) — `assetApiUrl`
Folders organise assets in a tree (max 10 levels). They belong to the Assets module and are stored in `GameVaultFolders`.

| Method | Path | Description | Success |
|---|---|---|---|
| POST | `/folders` | `{"name": "Hero", "parentId": ""}` (`parentId` empty = top level) | 201 |
| GET | `/folders` | All folders, flat, sorted by name (clients build the tree from `parentId`) | 200 |
| GET | `/folders/{folderId}` | Folder details | 200 |
| PUT | `/folders/{folderId}` | Rename and/or move (`name`, `parentId`) | 200 |
| DELETE | `/folders/{folderId}` | Delete an **empty** folder | 204 |

Rules: name 1–60 chars without `/` or `\\`; sibling names are unique (case-insensitive); the parent must exist; a folder cannot be moved into itself or a descendant; a folder with subfolders or assets cannot be deleted (400). Assets carry `folderId` (`""` = top level; assets created before folders existed count as top level). Set or change it with `POST /assets` / `PUT /assets/{id}`; the folder must exist (400 otherwise). `GET /assets?folderId=<id>` filters by folder (`folderId=` for top level).

Real captured run: `docs/evidence/folders-glb-test-output.txt`.

## Asset files (Phase 4) — `assetApiUrl`
Files go **directly browser → S3** through pre-signed URLs; the Lambda never handles file bytes.

| Method | Path | Description | Success |
|---|---|---|---|
| POST | `/assets/{assetId}/upload-url` | Body `{"fileName": "hero.png", "fileSize": 2048}`. Returns a pre-signed PUT URL | 200 |
| PUT | `/assets/{assetId}` with `{"s3Key": "..."}` | Attach the uploaded file to the asset | 200 |
| DELETE | `/assets/{assetId}/file` | Delete the file from S3 and clear `s3Key` | 204 (404 if the asset has no file) |

Flow:
1. `POST /assets/{id}/upload-url` → `{uploadUrl, method: "PUT", headers: {"Content-Type": "..."}, s3Key, expiresIn: 300}`
2. `PUT uploadUrl` with the file as body and **exactly** the returned headers.
3. `PUT /assets/{id}` `{"s3Key": s3Key}`. The API checks that the key lives under `assets/{assetId}/` and that the object exists; replacing a file deletes the old object.

Rules (server-enforced):
- Allowed extensions: `.fbx .obj .glb .gltf .png .jpg .jpeg .webp .wav .mp3 .ogg .anim .bvh .blend .zip .json`; content type is chosen by the server from the extension.
- Max size 100 MB (env `MAX_UPLOAD_BYTES`). Content-Type and Content-Length are part of the signature: S3 answers 403 if the upload differs from what was requested.
- File names are sanitised (no paths, `[A-Za-z0-9._-]` only). Keys look like `assets/{assetId}/{random}-{name}`.
- `s3Key` cannot be set on create, cannot be cleared via PUT (use `DELETE .../file`) and cannot point at another asset's file.
- `DELETE /assets/{id}` also deletes every object under that asset's own prefix (including uploads that were never attached), and nothing else.

Computed fields on every asset response (not stored, URLs valid ~15 min): `fileName`, `downloadUrl` (forces download), `previewUrl` and `previewKind` (`"image"` for png/jpg/jpeg/webp, `"audio"` for wav/mp3/ogg, `"model"` for `.glb`, otherwise empty: fbx/obj/gltf/other files are download-only), and `folderId`.

Real captured run against S3: `docs/evidence/asset-files-test-output.txt`.
