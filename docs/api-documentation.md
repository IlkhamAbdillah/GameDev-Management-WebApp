# API Documentation (Phase 1)

Base URL: Lambda Function URL from `.aws/outputs.json` (`apiUrl`). All bodies are JSON.

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

## Planned (later phases)
`POST /assets/{id}/upload-url`, `DELETE /assets/{id}/file` (Phase 4); `/tasks` CRUD (Phase 2); `GET /timeline` (Phase 3).
