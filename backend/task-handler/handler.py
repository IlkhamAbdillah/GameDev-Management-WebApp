"""Task Handler Lambda: routes Function URL (payload v2) requests to task operations."""
import json
import logging
import os
import re
import time
from datetime import datetime, timezone

from auth import PROJECT_MANAGER, AuthError, Forbidden, authenticate, require_role
from database import TaskNotFound, TaskRepository
from timeline import build_timeline
from validation import (
    ValidationError,
    validate_date_order,
    validate_task_payload,
    validate_timeline_query,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TASK_PATH = re.compile(r"^/tasks/(?P<task_id>[^/]+)$")
# Scheduling and assignment belong to the project manager; members edit the content and status
# of the tasks assigned to them.
MANAGER_ONLY_FIELDS = ("startDate", "dueDate", "assignee", "assigneeId")
_repo = None


def _response(status, body=None):
    response = {"statusCode": status, "headers": {"Content-Type": "application/json"}}
    if body is not None:
        response["body"] = json.dumps(body)
    return response


def _ok(data, status=200):
    return _response(status, {"success": True, "data": data})


def _error(status, message):
    return _response(status, {"success": False, "message": message})


def _probe(check):
    """Run one dependency check; report ok/latency, and only the AWS error *code* on failure."""
    started = time.perf_counter()
    try:
        check()
        return {"ok": True, "ms": round((time.perf_counter() - started) * 1000)}
    except Exception as err:  # noqa: BLE001 - a health check must never raise
        logger.warning("Health check failed: %s", err)
        code = getattr(err, "response", {}).get("Error", {}).get("Code") or type(err).__name__
        return {"ok": False, "ms": round((time.perf_counter() - started) * 1000), "error": code}


def _health(checks):
    """200 when every dependency is reachable, otherwise 503 with the per-dependency results."""
    results = {name: _probe(check) for name, check in checks.items()}
    if all(r["ok"] for r in results.values()):
        return _ok({"status": "ok", "checks": results})
    return _response(
        503,
        {
            "success": False,
            "message": "One or more dependencies are unavailable",
            "data": {"status": "degraded", "checks": results},
        },
    )


def _parse_body(event):
    raw = event.get("body")
    if not raw:
        raise ValidationError("Request body is required")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as err:
        raise ValidationError("Request body must be valid JSON") from err


def _forbid_manager_only_fields(body):
    if isinstance(body, dict) and any(field in body for field in MANAGER_ONLY_FIELDS):
        raise Forbidden("Only a project manager can set dates or assignees")


def _create(repo, principal, event):
    body = _parse_body(event)
    if not principal.is_manager:
        _forbid_manager_only_fields(body)
    fields = validate_task_payload(body)
    if not principal.is_manager:  # a member's own task is assigned to them
        fields["assignee"], fields["assigneeId"] = principal.name, principal.user_id
    return repo.create(fields)


def _update(repo, principal, task_id, event):
    body = _parse_body(event)
    current = None
    if not principal.is_manager:
        current = repo.get(task_id)  # 404 first
        if current.get("assigneeId") != principal.user_id:
            raise Forbidden("Members can only edit tasks assigned to them")
        _forbid_manager_only_fields(body)
    fields = validate_task_payload(body, partial=True)
    if "assignee" in fields and "assigneeId" not in fields:
        fields["assigneeId"] = ""  # a free-text assignee is no longer linked to a user account
    if "startDate" in fields or "dueDate" in fields:
        # A partial update may change only one date: check order against the stored record.
        current = current or repo.get(task_id)
        validate_date_order(
            fields.get("startDate", current.get("startDate", "")),
            fields.get("dueDate", current.get("dueDate", "")),
        )
    return repo.update(task_id, fields)


def handle(event, repo, secret, today=None):
    """Pure routing function; the repository, JWT secret (and today) are injected for unit tests."""
    http = event.get("requestContext", {}).get("http", {})
    method = http.get("method", "")
    path = event.get("rawPath", "").rstrip("/") or "/"
    query = event.get("queryStringParameters") or {}

    try:
        if path == "/health" and method == "GET":
            return _health({"tasksTable": repo.ping})  # public: used by /connectivity

        principal = authenticate(event, secret)

        if path == "/timeline" and method == "GET":
            q = validate_timeline_query(query)
            tasks = repo.list(
                status=q.get("status"), category=q.get("category"), assignee=q.get("assignee")
            )
            today = today or datetime.now(timezone.utc).date()
            return _ok(build_timeline(tasks, q.get("startDate", ""), q.get("endDate", ""), today))

        if path == "/tasks":
            if method == "POST":
                return _ok(_create(repo, principal, event), 201)
            if method == "GET":
                return _ok(
                    repo.list(
                        search=query.get("search"),
                        status=query.get("status"),
                        priority=query.get("priority"),
                        category=query.get("category"),
                        assignee=query.get("assignee"),
                    )
                )

        match = TASK_PATH.match(path)
        if match:
            task_id = match.group("task_id")
            if method == "GET":
                return _ok(repo.get(task_id))
            if method == "PUT":
                return _ok(_update(repo, principal, task_id, event))
            if method == "DELETE":
                require_role(principal, PROJECT_MANAGER)
                repo.delete(task_id)
                return _response(204)

        return _error(404, "Route not found")
    except AuthError as err:
        return _error(401, str(err))
    except Forbidden as err:
        return _error(403, str(err))
    except ValidationError as err:
        return _error(400, str(err))
    except TaskNotFound:
        return _error(404, "Task not found")
    except Exception:  # never leak internals; details go to CloudWatch
        logger.exception("Unhandled error for %s %s", method, path)
        return _error(500, "Internal server error")


def lambda_handler(event, context):
    global _repo
    if _repo is None:
        _repo = TaskRepository.from_table_name(os.environ["TASKS_TABLE"])
    return handle(event, _repo, os.environ["JWT_SECRET"])
