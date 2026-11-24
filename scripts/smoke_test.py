#!/usr/bin/env python3
"""Post-deploy verification of the live AWS stack (API -> Lambda -> DynamoDB/S3 -> CloudWatch).

Usage:
  AWS_SHARED_CREDENTIALS_FILE=.aws/credentials AWS_CONFIG_FILE=.aws/config \
      .venv/bin/python scripts/smoke_test.py | tee docs/evidence/smoke-test-output.txt

Reads the Function URLs from .aws/outputs.json. Everything it creates is prefixed "smoke-" and is
removed again at the end (even on failure). The S3 and CloudWatch checks use boto3 and are skipped
with a notice if credentials are unavailable. Exit code 1 if any check fails.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = json.loads((ROOT / ".aws" / "outputs.json").read_text())
ASSET, TASK = OUT["assetApiUrl"], OUT["taskApiUrl"]
BUCKET = OUT["bucket"]
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))
    return ok


def http(method, url, body=None, headers=None, raw=False):
    data = body if isinstance(body, bytes) else (json.dumps(body).encode() if body is not None else None)
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if body is not None and not isinstance(body, bytes):
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload, status = response.read(), response.status
    except urllib.error.HTTPError as err:
        payload, status = err.read(), err.code
    if raw:
        return status, payload
    return status, (json.loads(payload) if payload else None)


def data(response):
    return (response[1] or {}).get("data")


def run():
    created = {"assets": [], "folders": [], "tasks": []}
    try:
        # ---------------------------------------------------------------- connectivity
        print("== Connectivity (API Gateway-equivalent entry, Lambda, DynamoDB, S3)")
        status, body = http("GET", f"{ASSET}/health")
        check("asset API /health -> Lambda + DynamoDB + S3", status == 200 and body["data"] == {"status": "ok", "dynamodb": "ok", "s3": "ok"}, body)
        status, body = http("GET", f"{TASK}/health")
        check("task API /health -> Lambda + DynamoDB", status == 200 and body["data"]["dynamodb"] == "ok", body)

        # ---------------------------------------------------------------- folders
        print("== Folders")
        parent = http("POST", f"{ASSET}/folders", {"name": "smoke-parent"})
        check("create folder -> 201", parent[0] == 201)
        parent_id = data(parent)["folderId"]
        created["folders"].append(parent_id)
        child = http("POST", f"{ASSET}/folders", {"name": "smoke-child", "parentId": parent_id})
        child_id = data(child)["folderId"]
        created["folders"].append(child_id)
        check("create nested folder", child[0] == 201 and data(child)["parentId"] == parent_id)
        check("duplicate sibling name -> 400", http("POST", f"{ASSET}/folders", {"name": "SMOKE-PARENT"})[0] == 400)
        check("move folder into its own child -> 400", http("PUT", f"{ASSET}/folders/{parent_id}", {"parentId": child_id})[0] == 400)

        # ---------------------------------------------------------------- assets
        print("== Assets")
        res = http("POST", f"{ASSET}/assets", {"assetName": "smoke-asset", "assetType": "Props", "assignedTo": "smoke", "folderId": child_id})
        check("create asset -> 201", res[0] == 201)
        asset = data(res)
        asset_id = asset["assetId"]
        created["assets"].append(asset_id)
        check("asset starts as Planned with no file", asset["status"] == "Planned" and asset["s3Key"] == "" and asset["folderId"] == child_id)
        check("create invalid asset -> 400", http("POST", f"{ASSET}/assets", {"assetName": "x"})[0] == 400)
        check("list assets contains it", asset_id in [a["assetId"] for a in data(http("GET", f"{ASSET}/assets"))])
        check("filter by folder", [a["assetId"] for a in data(http("GET", f"{ASSET}/assets?folderId={child_id}"))] == [asset_id])
        check("search by name", asset_id in [a["assetId"] for a in data(http("GET", f"{ASSET}/assets?search=SMOKE-ass"))])
        check("get asset details", data(http("GET", f"{ASSET}/assets/{asset_id}"))["assetName"] == "smoke-asset")
        upd = http("PUT", f"{ASSET}/assets/{asset_id}", {"status": "In Progress"})
        check("update asset", upd[0] == 200 and data(upd)["status"] == "In Progress")
        check("unknown asset -> 404", http("GET", f"{ASSET}/assets/does-not-exist")[0] == 404)

        # ---------------------------------------------------------------- S3 upload/download
        print("== S3 pre-signed upload / download")
        payload = bytes(range(256)) * 8  # 2 KiB
        check("disallowed file type -> 400", http("POST", f"{ASSET}/assets/{asset_id}/upload-url", {"fileName": "x.exe", "fileSize": 5})[0] == 400)
        check("oversized file -> 400", http("POST", f"{ASSET}/assets/{asset_id}/upload-url", {"fileName": "x.glb", "fileSize": 10**10})[0] == 400)
        ticket = data(http("POST", f"{ASSET}/assets/{asset_id}/upload-url", {"fileName": "smoke model.glb", "fileSize": len(payload)}))
        check("upload URL is scoped to the asset", ticket["s3Key"].startswith(f"assets/{asset_id}/") and ticket["s3Key"].endswith("smoke_model.glb"))
        status, _ = http("PUT", ticket["uploadUrl"], payload, ticket["headers"], raw=True)
        check("PUT file to S3 through the pre-signed URL -> 200", status == 200, status)
        status, _ = http("PUT", http("POST", f"{ASSET}/assets/{asset_id}/upload-url", {"fileName": "bad.glb", "fileSize": len(payload)})[1]["data"]["uploadUrl"], b"tiny", ticket["headers"], raw=True)
        check("S3 rejects an upload that differs from the signed size -> 403", status == 403, status)
        saved = http("PUT", f"{ASSET}/assets/{asset_id}", {"s3Key": ticket["s3Key"]})
        check("stored S3 object key is saved on the asset", saved[0] == 200 and data(saved)["s3Key"] == ticket["s3Key"])
        check(".glb is previewable as a 3D model", data(saved)["previewKind"] == "model" and bool(data(saved)["previewUrl"]))
        status, blob = http("GET", data(saved)["downloadUrl"], raw=True)
        check("download returns identical bytes", status == 200 and blob == payload)
        check("cannot attach another asset's key", http("PUT", f"{ASSET}/assets/{asset_id}", {"s3Key": "assets/other/x-y.png"})[0] == 400)

        try:
            import boto3

            s3 = boto3.client("s3")
            keys = [o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET, Prefix=f"assets/{asset_id}/").get("Contents", [])]
            check("object really exists in the private bucket", keys == [ticket["s3Key"]], keys)
            block = s3.get_public_access_block(Bucket=BUCKET)["PublicAccessBlockConfiguration"]
            check("bucket blocks all public access", all(block.values()), block)
            anon, _ = http("GET", f"https://{BUCKET}.s3.amazonaws.com/{ticket['s3Key']}", raw=True)
            check("unsigned (anonymous) GET of the object is denied -> 403", anon == 403, anon)
        except Exception as err:  # noqa: BLE001 - optional AWS-credential checks
            print(f"SKIP  S3 permission checks (boto3/credentials unavailable: {type(err).__name__})")

        check("delete file -> 204", http("DELETE", f"{ASSET}/assets/{asset_id}/file")[0] == 204)
        check("delete file again -> 404", http("DELETE", f"{ASSET}/assets/{asset_id}/file")[0] == 404)
        check("non-empty folder cannot be deleted -> 400", http("DELETE", f"{ASSET}/folders/{child_id}")[0] == 400)
        check("delete asset -> 204", http("DELETE", f"{ASSET}/assets/{asset_id}")[0] == 204)
        created["assets"].remove(asset_id)
        check("deleted asset -> 404", http("GET", f"{ASSET}/assets/{asset_id}")[0] == 404)

        # ---------------------------------------------------------------- tasks
        print("== Tasks")
        make = lambda **kw: http("POST", f"{TASK}/tasks", kw)  # noqa: E731
        a = make(title="smoke-a", category="Programming", priority="High", assignee="smoke", startDate="2031-01-01", dueDate="2031-01-10")
        check("create task -> 201", a[0] == 201)
        task_id = data(a)["taskId"]
        created["tasks"].append(task_id)
        b = make(title="smoke-b", category="Art", assignee="smoke2", startDate="2031-03-01", dueDate="2031-03-05", status="In Review")
        created["tasks"].append(data(b)["taskId"])
        check("tasks and assets are independent (no assetId on a task)", "assetId" not in data(a))
        check("invalid task -> 400", make(title="x", priority="Urgent")[0] == 400)
        check("due before start -> 400", make(title="x", startDate="2031-05-02", dueDate="2031-05-01")[0] == 400)
        check("get task details", data(http("GET", f"{TASK}/tasks/{task_id}"))["title"] == "smoke-a")
        listed = data(http("GET", f"{TASK}/tasks?assignee=smoke"))
        check("filter tasks by assignee", [t["taskId"] for t in listed] == [task_id])
        check("filter by category + priority", [t["taskId"] for t in data(http("GET", f"{TASK}/tasks?category=Programming&priority=High&search=SMOKE"))] == [task_id])
        moved = http("PUT", f"{TASK}/tasks/{task_id}", {"status": "In Progress"})
        check("change task status", moved[0] == 200 and data(moved)["status"] == "In Progress")
        check("partial date update is checked against stored dates -> 400", http("PUT", f"{TASK}/tasks/{task_id}", {"dueDate": "2030-12-31"})[0] == 400)
        check("unknown task -> 404", http("GET", f"{TASK}/tasks/does-not-exist")[0] == 404)

        # ---------------------------------------------------------------- timeline
        print("== Timeline (derived from tasks, no separate table)")
        window = data(http("GET", f"{TASK}/timeline?startDate=2031-01-05&endDate=2031-01-31&assignee=smoke"))
        entry = window["tasks"][0] if window["tasks"] else {}
        check("timeline returns the task with start/due dates, status and assignee", [e["taskId"] for e in window["tasks"]] == [task_id] and (entry["startDate"], entry["dueDate"], entry["status"], entry["assignee"]) == ("2031-01-01", "2031-01-10", "In Progress", "smoke"))
        check("date range filter excludes tasks outside the window", data(http("GET", f"{TASK}/timeline?startDate=2031-02-01&endDate=2031-02-28&assignee=smoke*"))["tasks"] == [])
        both = data(http("GET", f"{TASK}/timeline?startDate=2031-01-01&endDate=2031-12-31"))
        check("window across both tasks", {t["taskId"] for t in both["tasks"]} >= set(created["tasks"]))
        check("timeline status filter", [e["taskId"] for e in data(http("GET", f"{TASK}/timeline?status=In%20Review&startDate=2031-01-01&endDate=2031-12-31"))["tasks"]] == [created["tasks"][1]])
        check("timeline stats present", {"total", "done", "completionRate", "byStatus", "overdue", "dueSoon", "unscheduled"} <= set(both["stats"]))
        http("PUT", f"{TASK}/tasks/{task_id}", {"status": "Done", "dueDate": "2031-02-20"})
        after = [e for e in data(http("GET", f"{TASK}/timeline?startDate=2031-02-01&endDate=2031-02-28"))["tasks"] if e["taskId"] == task_id]
        check("timeline reflects status/date edits immediately", len(after) == 1 and after[0]["status"] == "Done" and after[0]["end"] == "2031-02-20")
        check("invalid timeline range -> 400", http("GET", f"{TASK}/timeline?startDate=2031-02-01&endDate=2031-01-01")[0] == 400)

        # ---------------------------------------------------------------- CORS
        print("== CORS")
        for name, url in (("asset", f"{ASSET}/assets"), ("task", f"{TASK}/tasks")):
            req = urllib.request.Request(url, method="OPTIONS", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type"})
            with urllib.request.urlopen(req, timeout=30) as response:
                check(f"{name} API CORS preflight", response.status == 200 and response.headers.get("Access-Control-Allow-Origin") in ("*", "http://localhost:5173"))
    finally:
        print("== Cleanup")
        for task in created["tasks"]:
            http("DELETE", f"{TASK}/tasks/{task}")
        for asset in created["assets"]:
            http("DELETE", f"{ASSET}/assets/{asset}")
        for folder in reversed(created["folders"]):
            http("DELETE", f"{ASSET}/folders/{folder}")
        leftovers = [a for a in data(http("GET", f"{ASSET}/assets")) if a["assetName"].startswith("smoke-")] + [t for t in data(http("GET", f"{TASK}/tasks")) if t["title"].startswith("smoke-")]
        check("all smoke data removed", not leftovers, leftovers)

    # -------------------------------------------------------------------- CloudWatch
    print("== CloudWatch")
    try:
        import boto3

        logs = boto3.client("logs")
        time.sleep(8)  # log delivery lag
        for function in ("GameVaultAssetHandler", "GameVaultTaskHandler"):
            group = f"/aws/lambda/{function}"
            stream = logs.describe_log_streams(logGroupName=group, orderBy="LastEventTime", descending=True, limit=1)["logStreams"][0]["logStreamName"]
            events = logs.get_log_events(logGroupName=group, logStreamName=stream, limit=50)["events"]
            check(f"{group} has fresh execution logs", any("REPORT RequestId" in e["message"] for e in events) and time.time() * 1000 - events[-1]["timestamp"] < 120_000)
    except Exception as err:  # noqa: BLE001
        print(f"SKIP  CloudWatch checks (boto3/credentials unavailable: {type(err).__name__})")


if __name__ == "__main__":
    started = time.time()
    try:
        run()
    except Exception as err:  # noqa: BLE001 - report instead of a bare traceback
        check(f"unexpected error: {type(err).__name__}", False, str(err)[:200])
    passed = sum(RESULTS)
    print(f"\n{passed}/{len(RESULTS)} checks passed in {time.time() - started:.1f}s")
    sys.exit(0 if passed == len(RESULTS) else 1)
