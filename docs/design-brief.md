# GameVault — Design Brief (Week 12)

## Overview and problem
Small indie game teams lack a lightweight place to keep game assets and see development progress; enterprise tools (Jira) are heavy. GameVault combines an asset library, a Kanban task board and a derived timeline.

## Selected use case
Asset management for a game project: register assets (character, environment, audio…), track their status and owner, and later store the files in S3.

## AWS architecture
Client → Lambda Function URL → Lambda (Python 3.12) → DynamoDB / S3, with CloudWatch Logs and IAM (see diagram in README).
- **DynamoDB** `GameVaultAssets`: metadata. **S3**: private bucket for files (pre-signed URLs from Phase 4).
- **Lambda Function URL instead of API Gateway:** the Learner Lab denies creating API Gateway APIs (`apigateway:POST`). Routing is in code with the API Gateway v2 event format, so migration is trivial if permissions change.
- **LabRole** is used because IAM roles cannot be created in the lab.

## Data entity
`GameAsset`: assetId, assetName, assetType, description, assignedTo, status, s3Key, createdAt, updatedAt (see `database-design.md`).

## CRUD endpoints
`POST /assets`, `GET /assets`, `GET /assets/{assetId}`, `PUT /assets/{assetId}`, `DELETE /assets/{assetId}` (+ `GET /health`). Details in `api-documentation.md`.

## Security considerations
Private S3 bucket (Block Public Access, SSE-S3); no credentials in code or frontend (`.aws/` git-ignored); payload validation with whitelisted fields; conditional writes; generic 500 errors with details only in CloudWatch. **Known limitation:** no authentication and public Function URL; CORS `*` — acceptable for the academic MVP only.

## Roadmap
Phase 2 Tasks + Kanban · Phase 3 Timeline/Gantt · Phase 4 S3 upload/download/previews · Phase 5 polish, tests, docs. Then authentication (e.g. Cognito) and API Gateway if available.
