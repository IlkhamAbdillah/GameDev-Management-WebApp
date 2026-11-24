# GameVault

**Manage Assets. Track Progress. Build Games.**

Lightweight game-development workspace for small indie teams: asset library (Assets), Kanban task board (Tasks) and Gantt-style schedule (Timeline). Built on an AWS serverless stack.

> Status: **All five roadmap phases implemented**: Asset CRUD + nested folders + S3 upload/download/preview (images, audio, `.glb` 3D), Task API + Kanban, Timeline API + Gantt chart, plus tests, diagram and verification tooling. See [docs/testing.md](docs/testing.md).

## Architecture

![GameVault architecture](docs/architecture.png)

Request flow: client → Lambda Function URL → Lambda → DynamoDB / S3 (files travel straight between the browser and S3 through pre-signed URLs). Regenerate the diagram with `.venv/bin/python scripts/make_architecture.py` (it also refreshes the copy shown on the Docs page).

Security boundaries: the bucket is private (Block Public Access on, SSE-S3); the browser never sees AWS credentials; only the Lambda role can reach DynamoDB/S3.

### Deviation from the original spec: Lambda Function URL instead of API Gateway
The Learner Lab account denies `apigateway:POST` (creating any API), so a Lambda **Function URL** is used as the HTTP entry point. Routing is done in `handler.py`, and the event format (payload v2) is identical to API Gateway HTTP API, so switching to API Gateway later only needs an integration, no code change.

Also in Learner Lab: IAM roles cannot be created, so `LabRole` is used. Least-privilege per function is documented as the target design but not enforced in this environment.

## Limitations (MVP)
- **No authentication.** The Function URL is public (`AuthType NONE`); anyone with the URL can call the API. Acceptable only for the academic MVP.
- CORS allows `*` for development.
- The frontend runs locally (`npm run dev`); it is not hosted on AWS, because a static-website bucket would have to be public and the Learner Lab denies CloudFront/API Gateway.
- List endpoints use DynamoDB `Scan` (fine for small datasets; add a GSI if it grows).

## Project layout
```
backend/asset-handler/   handler.py (routing) · database.py (DynamoDB) · storage.py (S3, pre-signed URLs) · validation.py · filetypes.py · folders.py (tree rules)
backend/task-handler/    handler.py · database.py · validation.py
frontend/                React + TypeScript + Vite + Tailwind (Tasks Kanban board, Timeline Gantt chart)
scripts/deploy.py        idempotent provisioning + deploy (boto3)
tests/                   pytest + moto unit tests
docs/                    design brief, database design, API docs, evidence/
```

## Run tests
```bash
python3 -m venv .venv && .venv/bin/pip install boto3 pytest moto
.venv/bin/python -m pytest tests -q
```

## Deploy
1. Start the Learner Lab and copy the CLI credentials (`aws_access_key_id`, `aws_secret_access_key`, `aws_session_token`) into `.aws/credentials` (git-ignored) and `region=us-east-1` into `.aws/config`.
2. Run:
   ```bash
   export AWS_SHARED_CREDENTIALS_FILE=$PWD/.aws/credentials AWS_CONFIG_FILE=$PWD/.aws/config
   .venv/bin/python scripts/deploy.py
   ```
   It creates/updates the DynamoDB tables, private S3 bucket, both Lambdas and their Function URLs, and writes the URLs to `.aws/outputs.json`.
   Some Learner Lab sessions deny `dynamodb:CreateTable` (it is denied for the `voclabs` role); the script then warns — create the table in the console (partition key as printed, String, on-demand) and rerun.
3. Smoke test: `curl $ASSET_URL/health` and `curl $TASK_URL/health` (or open the Connectivity page).

## Frontend
```bash
cd frontend
cp .env.example .env.local   # fill in assetApiUrl / taskApiUrl from .aws/outputs.json
npm install && npm run dev
```
Assets: nested folders (create/rename/move/delete-when-empty, breadcrumb, drag an asset onto a folder to move it), grid/list view, search (across all folders) + category/status filters, create/edit/delete, direct-to-S3 upload with progress, download, and inline preview: images (thumbnails), audio, and **`.glb` 3D models** (interactive rotate/zoom via `<model-viewer>`, loaded lazily). Clicking an asset opens a two-column dialog: a large preview on the left (a newly chosen file previews before it is uploaded) and the details (name, category, status, folder, assignee, description) on the right. In the grid, `.glb` models get a rendered thumbnail: models are rendered one at a time in the browser, captured as a PNG and cached in IndexedDB by S3 key, so each model is rendered once per browser (not stored on the server). Other 3D formats (fbx/obj/gltf) and files are download-only.

**Docs** (`/docs`): in-app documentation of the architecture (diagram and design decisions), tech stack, data model, the full API reference (collapsible endpoints with parameters and examples; data in `frontend/src/content/apiSpec.ts`) and security notes. **Connectivity** (`/connectivity`): an interactive diagram that follows the architecture (browser → Function URLs → Lambdas → DynamoDB tables / S3, plus IAM and CloudWatch). Click any component for what it is, what it does in GameVault, its latest status and latency, and a plain-language hint when it fails (e.g. an expired Learner Lab session). The app checks every service quietly in the background when it loads (no animation, no log), and the page refreshes that in place when you open it if the data is older than 30 s, so the statuses are already filled in and never flash grey; the results are kept while you move around the app and a running test keeps going. **Run test** sends the real health requests and animates a packet from the browser through the Function URL and Lambda to each dependency and back, with a live "what is happening" log; the Lambda's own steps are replayed from the per-dependency results and timings it reports. **Full round-trip test** (one button) runs the same animation for real writes: it creates and then deletes a temporary asset (with a direct browser → S3 upload/download) and task. The status bar above the diagram shows the current step and a progress line while it runs; click it to open the list of steps, one per line (done, running, not started). When the test ends the bar becomes its result (passed, or failed at step N), and a later *Run test* turns it back into the health-check summary. IAM and CloudWatch cannot be tested from the browser, so they are shown as inferred.

Timeline: simplified Gantt chart (bar position = start date, length = duration, colour = status: gray/blue/orange/green), range navigation (prev/next/today, 2 weeks to 3 months), status and category filters, red/amber highlighting for overdue and due-within-3-days tasks, and completion statistics. It calls `GET /timeline` for the visible window, so edits made on the Tasks page show up on the next load.

Kanban supports drag-and-drop between columns (optimistic update with rollback), create/edit/delete, and search/status/priority/category/assignee filters (applied client-side over the fetched list).

Credentials expire with each lab session; rerun step 1 and the script is safe to run again.

## Testing
```bash
.venv/bin/python -m pytest tests -q          # 105 backend tests (moto)
cd frontend && npm test && npm run build     # 68 unit tests + strict type-check/build
.venv/bin/python scripts/smoke_test.py       # 54 live checks against the deployed AWS stack
```
A Postman collection is in `postman/`. Details and the mapping to the specification's checklist: [docs/testing.md](docs/testing.md). CI (`.github/workflows/ci.yml`) runs the backend and frontend tests on every push.

## API
See [docs/api-documentation.md](docs/api-documentation.md). Evidence of the deployed run: [docs/evidence/](docs/evidence/).
