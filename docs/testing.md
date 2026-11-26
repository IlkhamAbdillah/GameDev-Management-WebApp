# Testing

## Layers
| Layer | Where | What it proves | Run |
|---|---|---|---|
| Backend unit/integration (pytest + moto) | `tests/` — 170 tests | Business logic, validation, routing, authentication (password hashing, token signing/expiry/tampering, `alg: none`), role rules per route (401/403, members only edit their own tasks), error handling, S3 key/URL rules, folder tree rules, timeline maths, the real `lambda_handler` wiring (env vars → DynamoDB/S3 clients) against mocked AWS, and the demo-data seeder (`scripts/seed_data.py`: sample-assets planning, idempotent API calls) | `.venv/bin/python -m pytest tests -q` |
| Frontend unit (Vitest) | `frontend/src/**/*.test.ts` — 84 tests | Permissions, the dashboard selections (week range, this/next week, review queue, ownership, workload), bearer-token handling and sign-out on 401, date helpers, deadline highlighting, folder tree helpers, file validation/preview rules, API client envelope/error handling, the health client, the API reference data, the diagram layout (no overlapping nodes, every animated hop follows a real edge), the Connectivity health-flow (Asset, Task, Auth) and round-trip orchestrators (hop order, failing/degraded/unreachable paths, skipping after a failure, cleanup), the status bar states, and the quiet background refresh (no flicker, shared request, staleness) | `cd frontend && npm test` |
| Frontend static | `npm run build` (`tsc` strict) + `npm run lint` | Type safety across the app | `cd frontend && npm run build` |
| **Live AWS smoke test** | `scripts/smoke_test.py` — 80 checks | The deployed stack: sign-in and role rules against the real Lambdas (throw-away project manager written to the Users table, a member created through the API), Function URLs → Lambda → DynamoDB/S3, real pre-signed upload/download, S3 permissions, CORS (including the `Authorization` header), CloudWatch logs. Cleans up after itself | see below |
| REST client | `postman/gamevault.postman_collection.json` — 41 requests with assertions | Same flows for manual runs in Postman / Collection Runner | import, set `assetApi` and `taskApi` |
| CI | `.github/workflows/ci.yml` | Backend tests + frontend tests/build on every push | automatic |

```bash
export AWS_SHARED_CREDENTIALS_FILE=$PWD/.aws/credentials AWS_CONFIG_FILE=$PWD/.aws/config
# the smoke test writes its temporary project manager with the awsstudent profile (override: GV_DB_PROFILE)
.venv/bin/python scripts/smoke_test.py | tee docs/evidence/smoke-test-output.txt
```
Output is saved to `docs/evidence/smoke-test-output.txt` by the command above. It needs a running Learner Lab session: when the session ends, the lab role is denied all data access and every check fails with `AccessDeniedException` (the Connectivity page shows the same thing).

## Coverage of the specification's test list (section 9)
| Requirement | Automated checks |
|---|---|
| Assets: create / list / details / update / delete | pytest `test_asset_handler.py`; smoke "Assets"; Postman folder 2 |
| Assets: generate upload URL, upload to S3, verify stored S3 key | pytest "files" tests; smoke "S3 pre-signed upload" (real PUT, key saved and read back, bytes identical, object listed in the bucket) |
| Tasks: create / list / details / update / delete / change status / filter | pytest `test_task_handler.py`; smoke "Tasks"; Postman folder 4 |
| Timeline: data, start/due dates, status updates, date-range filtering | pytest "timeline" tests; smoke "Timeline" (edits show up immediately; window filter; reversed range → 400); Postman folder 5 |
| In-app connectivity check | The **/connectivity** page: an interactive architecture diagram with per-service health, an animated request flow, and a full round-trip test that cleans up after itself (manual, runs in the browser) |
| API Gateway integration | **Not applicable**: the Learner Lab denies `apigateway:*`, so Lambda Function URLs are the HTTP entry point (see README). The smoke test verifies the Function URLs and CORS preflight instead |
| Lambda execution | smoke "Connectivity" (`/health`) and every request; pytest `test_lambda_entrypoints.py` |
| DynamoDB connectivity | `/health` on both APIs; all CRUD checks |
| S3 permissions | smoke: bucket blocks public access, anonymous GET → 403, upload with wrong size → 403, signed upload/download works |
| CloudWatch logs | smoke "CloudWatch": both `/aws/lambda/GameVault*` groups have fresh `REPORT` lines |

## Not covered
- No browser/E2E automation: UI behaviour (drag-and-drop, 3D rendering, thumbnails, responsive layout) was checked by hand only.
- The Postman collection was written to mirror the smoke test but has not been executed in Postman/newman in this environment.
- No load/performance testing; list endpoints use DynamoDB `Scan`.
