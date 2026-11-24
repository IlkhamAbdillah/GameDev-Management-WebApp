# API Documentation (Phase 1)

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

## Planned (later phases)
`POST /assets/{id}/upload-url`, `DELETE /assets/{id}/file` (Phase 4); `GET /timeline` (Phase 3, served by the Task Lambda).
