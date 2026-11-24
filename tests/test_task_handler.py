import importlib
import json
from datetime import date
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

HANDLER_DIR = str(Path(__file__).resolve().parents[1] / "backend" / "task-handler")

# Both Lambdas use the module names handler/database/validation; load the task versions
# in isolation so they do not collide with the asset-handler modules.
for _name in ("handler", "database", "validation", "storage", "timeline"):
    sys.modules.pop(_name, None)
sys.path.insert(0, HANDLER_DIR)
handler = importlib.import_module("handler")
TaskRepository = importlib.import_module("database").TaskRepository
validation = importlib.import_module("validation")
sys.path.remove(HANDLER_DIR)
for _name in ("handler", "database", "validation", "timeline"):
    sys.modules.pop(_name, None)

REGION = "us-east-1"


@pytest.fixture(autouse=True)
def aws_env(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("AWS_DEFAULT_REGION", REGION)


@pytest.fixture
def repo():
    with mock_aws():
        table = boto3.resource("dynamodb", region_name=REGION).create_table(
            TableName="GameVaultTasks",
            KeySchema=[{"AttributeName": "taskId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "taskId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield TaskRepository(table)


TODAY = date(2026, 11, 24)


def call(repo, method, path, body=None, query=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
    }
    res = handler.handle(event, repo, today=TODAY)
    return res["statusCode"], json.loads(res["body"]) if "body" in res else None


def create(repo, **overrides):
    status, body = call(repo, "POST", "/tasks", {"title": "Build player controller", **overrides})
    assert status == 201
    return body["data"]


# ---- create ----
def test_create_applies_defaults(repo):
    task = create(repo)
    assert (task["status"], task["priority"], task["category"]) == ("To Do", "Medium", "Other")
    assert task["taskId"] and task["createdAt"] == task["updatedAt"]
    assert "assetId" not in task  # tasks and assets are independent


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": "  "},
        {"title": 3},
        {"title": "x" * 121},
        {"title": "x", "category": "Cooking"},
        {"title": "x", "priority": "Urgent"},
        {"title": "x", "status": "Doing"},
        {"title": "x", "startDate": "2026-13-40"},
        {"title": "x", "startDate": "20260101"},
        {"title": "x", "dueDate": 5},
        {"title": "x", "startDate": "2026-05-10", "dueDate": "2026-05-01"},
    ],
)
def test_create_rejects_invalid_payload(repo, payload):
    status, body = call(repo, "POST", "/tasks", payload)
    assert status == 400 and body["success"] is False


def test_create_ignores_server_controlled_fields(repo):
    task = create(repo, taskId="HACK", createdAt="1999")
    assert task["taskId"] != "HACK" and task["createdAt"] != "1999"


# ---- read ----
def test_get_task_and_missing(repo):
    task = create(repo)
    assert call(repo, "GET", f"/tasks/{task['taskId']}")[0] == 200
    status, body = call(repo, "GET", "/tasks/nope")
    assert status == 404 and body == {"success": False, "message": "Task not found"}


def test_list_filters_and_search(repo):
    create(repo, title="Fix jump bug", category="Programming", priority="High", assignee="Rina", status="In Progress")
    create(repo, title="Boss concept", category="Art", priority="Low", assignee="Dimas")
    create(repo, title="Jump sound", category="Audio", priority="High", assignee="Rina")

    def titles(**q):
        return sorted(t["title"] for t in call(repo, "GET", "/tasks", query=q)[1]["data"])

    assert len(titles()) == 3
    assert titles(search="JUMP") == ["Fix jump bug", "Jump sound"]
    assert titles(status="In Progress") == ["Fix jump bug"]
    assert titles(priority="High") == ["Fix jump bug", "Jump sound"]
    assert titles(category="Art") == ["Boss concept"]
    assert titles(assignee="Rina", priority="High") == ["Fix jump bug", "Jump sound"]
    assert titles(assignee="Rina", category="Audio") == ["Jump sound"]


def test_list_sorted_by_due_date_undated_last(repo):
    create(repo, title="undated")
    create(repo, title="late", dueDate="2026-12-01")
    create(repo, title="soon", dueDate="2026-11-01")
    order = [t["title"] for t in call(repo, "GET", "/tasks")[1]["data"]]
    assert order == ["soon", "late", "undated"]


# ---- update ----
def test_change_status_keeps_other_fields(repo):
    task = create(repo, assignee="Rina", dueDate="2026-12-01")
    status, body = call(repo, "PUT", f"/tasks/{task['taskId']}", {"status": "Done"})
    data = body["data"]
    assert status == 200 and data["status"] == "Done" and data["assignee"] == "Rina"
    assert data["createdAt"] == task["createdAt"] and data["updatedAt"] >= task["updatedAt"]


def test_update_checks_date_order_against_stored_value(repo):
    task = create(repo, startDate="2026-05-10", dueDate="2026-05-20")
    path = f"/tasks/{task['taskId']}"
    assert call(repo, "PUT", path, {"dueDate": "2026-05-01"})[0] == 400
    assert call(repo, "PUT", path, {"startDate": "2026-06-01"})[0] == 400
    assert call(repo, "PUT", path, {"dueDate": "2026-05-30"})[0] == 200


def test_update_missing_does_not_create(repo):
    assert call(repo, "PUT", "/tasks/ghost", {"status": "Done"})[0] == 404
    assert call(repo, "PUT", "/tasks/ghost", {"dueDate": "2026-01-01"})[0] == 404
    assert call(repo, "GET", "/tasks")[1]["data"] == []


def test_update_rejects_invalid_and_empty(repo):
    task = create(repo)
    path = f"/tasks/{task['taskId']}"
    assert call(repo, "PUT", path, {"status": "Bad"})[0] == 400
    assert call(repo, "PUT", path, {"nothing": 1})[0] == 400
    assert call(repo, "PUT", path, {"title": ""})[0] == 400


# ---- delete / misc ----
def test_delete_task(repo):
    task = create(repo)
    event = {"rawPath": f"/tasks/{task['taskId']}", "requestContext": {"http": {"method": "DELETE"}}}
    res = handler.handle(event, repo)
    assert res["statusCode"] == 204 and "body" not in res
    assert call(repo, "GET", f"/tasks/{task['taskId']}")[0] == 404
    assert call(repo, "DELETE", "/tasks/ghost")[0] == 404


def test_health_unknown_route_and_hidden_errors(repo):
    health = call(repo, "GET", "/health")[1]["data"]
    assert health["status"] == "ok" and health["checks"]["tasksTable"]["ok"] is True
    assert call(repo, "GET", "/nothing")[0] == 404

    class Broken:
        def list(self, **_):
            raise RuntimeError("secret internals")

    event = {"rawPath": "/tasks", "requestContext": {"http": {"method": "GET"}}}
    res = handler.handle(event, Broken())
    assert res["statusCode"] == 500 and "secret" not in res["body"]


def test_validation_helpers():
    assert validation.validate_task_payload({"title": " A "})["title"] == "A"
    with pytest.raises(validation.ValidationError):
        validation.validate_task_payload({}, partial=True)


# ---- timeline ----
def seed_timeline(repo):
    create(repo, title="Movement", category="Programming", assignee="Rina", status="Done",
           startDate="2026-11-01", dueDate="2026-11-10")
    create(repo, title="Enemy AI", category="Programming", assignee="Rina", status="In Progress",
           startDate="2026-11-20", dueDate="2026-11-26")
    create(repo, title="Boss art", category="Art", assignee="Dimas", status="In Review",
           startDate="2026-12-01", dueDate="2026-12-15")
    create(repo, title="Old bug", category="Testing", status="To Do", dueDate="2026-11-10")
    create(repo, title="Someday")  # no dates


def timeline(repo, **query):
    status, body = call(repo, "GET", "/timeline", query=query or None)
    assert status == 200
    return body["data"]


def test_timeline_returns_dates_status_and_assignee(repo):
    seed_timeline(repo)
    entries = {e["title"]: e for e in timeline(repo)["tasks"]}
    ai = entries["Enemy AI"]
    assert (ai["startDate"], ai["dueDate"], ai["status"], ai["assignee"]) == (
        "2026-11-20", "2026-11-26", "In Progress", "Rina")
    assert "Someday" not in entries  # unscheduled tasks are not drawn
    assert (entries["Old bug"]["start"], entries["Old bug"]["end"]) == ("2026-11-10", "2026-11-10")


def test_timeline_sorted_by_start_date(repo):
    seed_timeline(repo)
    starts = [e["start"] for e in timeline(repo)["tasks"]]
    assert starts == sorted(starts)


def test_timeline_date_range_uses_overlap(repo):
    seed_timeline(repo)

    def titles(**q):
        return sorted(e["title"] for e in timeline(repo, **q)["tasks"])

    assert titles(startDate="2026-11-24", endDate="2026-11-30") == ["Enemy AI"]
    assert titles(startDate="2026-11-05", endDate="2026-11-12") == ["Movement", "Old bug"]
    assert titles(startDate="2026-12-10") == ["Boss art"]       # ongoing bar overlaps window start
    assert titles(endDate="2026-11-02") == ["Movement"]
    assert titles(startDate="2027-01-01") == []


def test_timeline_filters(repo):
    seed_timeline(repo)
    assert [e["title"] for e in timeline(repo, status="Done")["tasks"]] == ["Movement"]
    assert [e["title"] for e in timeline(repo, category="Art")["tasks"]] == ["Boss art"]
    assert len(timeline(repo, assignee="Rina")["tasks"]) == 2


def test_timeline_stats_are_overall_and_flag_deadlines(repo):
    seed_timeline(repo)
    stats = timeline(repo, startDate="2026-12-01", endDate="2026-12-31")["stats"]  # window does not limit stats
    assert stats["total"] == 5 and stats["done"] == 1 and stats["completionRate"] == 20
    assert stats["byStatus"] == {"To Do": 2, "In Progress": 1, "In Review": 1, "Done": 1}
    assert stats["overdue"] == 1      # "Old bug" (due 2026-11-10, not done)
    assert stats["dueSoon"] == 1      # "Enemy AI" (due in 2 days)
    assert stats["unscheduled"] == 1


def test_timeline_reflects_updates_automatically(repo):
    seed_timeline(repo)
    ai = next(e for e in timeline(repo)["tasks"] if e["title"] == "Enemy AI")
    call(repo, "PUT", f"/tasks/{ai['taskId']}", {"status": "Done", "dueDate": "2026-12-20"})
    updated = next(e for e in timeline(repo)["tasks"] if e["taskId"] == ai["taskId"])
    assert (updated["status"], updated["end"]) == ("Done", "2026-12-20")
    stats = timeline(repo)["stats"]
    assert stats["done"] == 2 and stats["dueSoon"] == 0


def test_timeline_empty(repo):
    data = timeline(repo)
    assert data["tasks"] == [] and data["stats"]["total"] == 0 and data["stats"]["completionRate"] == 0


@pytest.mark.parametrize(
    "query",
    [
        {"startDate": "2026-13-01"},
        {"endDate": "nope"},
        {"startDate": "2026-12-10", "endDate": "2026-12-01"},
        {"status": "Doing"},
        {"category": "Cooking"},
    ],
)
def test_timeline_rejects_bad_query(repo, query):
    status, body = call(repo, "GET", "/timeline", query=query)
    assert status == 400 and body["success"] is False


def test_health_returns_503_when_the_table_is_unreachable(repo):
    class Down:
        def ping(self):
            raise RuntimeError("boom")

    event = {"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}
    res = handler.handle(event, Down())
    body = json.loads(res["body"])
    assert res["statusCode"] == 503 and body["data"]["checks"]["tasksTable"]["error"] == "RuntimeError"
