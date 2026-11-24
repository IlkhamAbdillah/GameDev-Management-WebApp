# Testing

## Layers
| Layer | Where | What it proves | Run |
|---|---|---|---|
| Backend unit/integration (pytest + moto) | `tests/` — 103 tests | Business logic, validation, routing, error handling, S3 key/URL rules, folder tree rules, timeline maths, and the real `lambda_handler` wiring (env vars → DynamoDB/S3 clients) against mocked AWS | `.venv/bin/python -m pytest tests -q` |
| Frontend unit (Vitest) | `frontend/src/**/*.test.ts` — 21 tests | Date helpers, deadline highlighting, folder tree helpers, file validation/preview rules, API client envelope/error handling | `cd frontend && npm test` |
| Frontend static | `npm run build` (`tsc` strict) + `npm run lint` | Type safety across the app | `cd frontend && npm run build` |
| **Live AWS smoke test** | `scripts/smoke_test.py` — 54 checks | The deployed stack: Function URLs → Lambda → DynamoDB/S3, real pre-signed upload/download, S3 permissions, CORS, CloudWatch logs. Cleans up after itself | see below |
| REST client | `postman/gamevault.postman_collection.json` — 41 requests with assertions | Same flows for manual runs in Postman / Collection Runner | import, set `assetApi` and `taskApi` |
| CI | `.github/workflows/ci.yml` | Backend tests + frontend tests/build on every push | automatic |

```bash
export AWS_SHARED_CREDENTIALS_FILE=$PWD/.aws/credentials AWS_CONFIG_FILE=$PWD/.aws/config
.venv/bin/python scripts/smoke_test.py | tee docs/evidence/smoke-test-output.txt
```
Latest recorded run: `docs/evidence/smoke-test-output.txt` (54/54 passed).

## Coverage of the specification's test list (section 9)
| Requirement | Automated checks |
|---|---|
| Assets: create / list / details / update / delete | pytest `test_asset_handler.py`; smoke "Assets"; Postman folder 2 |
| Assets: generate upload URL, upload to S3, verify stored S3 key | pytest "files" tests; smoke "S3 pre-signed upload" (real PUT, key saved and read back, bytes identical, object listed in the bucket) |
| Tasks: create / list / details / update / delete / change status / filter | pytest `test_task_handler.py`; smoke "Tasks"; Postman folder 4 |
| Timeline: data, start/due dates, status updates, date-range filtering | pytest "timeline" tests; smoke "Timeline" (edits show up immediately; window filter; reversed range → 400); Postman folder 5 |
| API Gateway integration | **Not applicable**: the Learner Lab denies `apigateway:*`, so Lambda Function URLs are the HTTP entry point (see README). The smoke test verifies the Function URLs and CORS preflight instead |
| Lambda execution | smoke "Connectivity" (`/health`) and every request; pytest `test_lambda_entrypoints.py` |
| DynamoDB connectivity | `/health` on both APIs; all CRUD checks |
| S3 permissions | smoke: bucket blocks public access, anonymous GET → 403, upload with wrong size → 403, signed upload/download works |
| CloudWatch logs | smoke "CloudWatch": both `/aws/lambda/GameVault*` groups have fresh `REPORT` lines |

## Not covered
- No browser/E2E automation: UI behaviour (drag-and-drop, 3D rendering, thumbnails, responsive layout) was checked by hand only.
- The Postman collection was written to mirror the smoke test but has not been executed in Postman/newman in this environment.
- No load/performance testing; list endpoints use DynamoDB `Scan`.
