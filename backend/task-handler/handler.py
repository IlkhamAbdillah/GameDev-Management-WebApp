"""Task Handler Lambda: routes Function URL (payload v2) requests to task operations."""
import json
import logging
import os
import re

from database import TaskNotFound, TaskRepository
from validation import ValidationError, validate_date_order, validate_task_payload

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TASK_PATH = re.compile(r"^/tasks/(?P<task_id>[^/]+)$")
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


def _parse_body(event):
    raw = event.get("body")
    if not raw:
        raise ValidationError("Request body is required")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as err:
        raise ValidationError("Request body must be valid JSON") from err


def _update(repo, task_id, event):
    fields = validate_task_payload(_parse_body(event), partial=True)
    if "startDate" in fields or "dueDate" in fields:
        # A partial update may change only one date: check order against the stored record.
        current = repo.get(task_id)
        validate_date_order(
            fields.get("startDate", current.get("startDate", "")),
            fields.get("dueDate", current.get("dueDate", "")),
        )
    return repo.update(task_id, fields)


def handle(event, repo):
    """Pure routing function; the repository is injected so it can be unit tested."""
    http = event.get("requestContext", {}).get("http", {})
    method = http.get("method", "")
    path = event.get("rawPath", "").rstrip("/") or "/"
    query = event.get("queryStringParameters") or {}

    try:
        if path == "/health" and method == "GET":
            repo.ping()
            return _ok({"status": "ok", "dynamodb": "ok"})

        if path == "/tasks":
            if method == "POST":
                return _ok(repo.create(validate_task_payload(_parse_body(event))), 201)
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
                return _ok(_update(repo, task_id, event))
            if method == "DELETE":
                repo.delete(task_id)
                return _response(204)

        return _error(404, "Route not found")
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
    return handle(event, _repo)
