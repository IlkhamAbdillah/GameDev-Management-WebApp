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

## Planned (later phases)
`POST /assets/{id}/upload-url`, `DELETE /assets/{id}/file` (Phase 4).
