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
Private S3 bucket (Block Public Access, SSE-S3); no credentials in code or frontend (`.aws/` git-ignored); payload validation with whitelisted fields; conditional writes; generic 500 errors with details only in CloudWatch. Authentication: email + password (scrypt) → HS256 JWT (8 h) verified inside every Lambda, because Function URLs have no authorizer; roles `project_manager` and `member` (global). **Known limitations:** stateless tokens (a deleted account or role change applies at token expiry), no login rate limiting, CORS `*`, one shared `LabRole`.

## Implemented scope (final)
Dashboard (per-role week view: to-do this week and the review queue), Assets (nested folders, S3 upload/download, preview of images, audio and `.glb` models), Tasks (Kanban with drag-and-drop), Timeline (Gantt chart derived from tasks, deadline highlighting, completion statistics). Sign-in with two roles and a Team page. Four DynamoDB tables: `GameVaultAssets`, `GameVaultTasks`, `GameVaultFolders` and `GameVaultUsers` (folders were added by request; Assets and Tasks remain independent and Timeline has no table). Verified by 170 backend tests, 84 frontend tests and an 80-check live smoke test (`docs/testing.md`).

## Roadmap
Completed: Phases 1–5. Next: API Gateway (and Cognito) where permitted, token revocation, login rate limiting instead of Function URLs where permitted, per-function least-privilege IAM roles, DynamoDB GSIs/queries instead of `Scan`, server-stored model thumbnails, hosting the frontend.
