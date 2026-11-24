"""Asset Handler Lambda: routes Function URL (payload v2) requests to asset operations."""
import json
import logging
import os
import re

from database import AssetNotFound, AssetRepository
from storage import AssetStorage
from validation import ValidationError, validate_asset_payload

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ASSET_PATH = re.compile(r"^/assets/(?P<asset_id>[^/]+)$")
_deps = None


def _response(status, body=None):
    response = {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
    }
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


def handle(event, repo, storage):
    """Pure routing function; dependencies are injected so it can be unit tested."""
    http = event.get("requestContext", {}).get("http", {})
    method = http.get("method", "")
    path = event.get("rawPath", "").rstrip("/") or "/"
    query = event.get("queryStringParameters") or {}

    try:
        if path == "/health" and method == "GET":
            repo.ping()
            storage.ping()
            return _ok({"status": "ok", "dynamodb": "ok", "s3": "ok"})

        if path == "/assets":
            if method == "POST":
                fields = validate_asset_payload(_parse_body(event))
                return _ok(repo.create(fields), 201)
            if method == "GET":
                return _ok(
                    repo.list(
                        search=query.get("search"),
                        asset_type=query.get("assetType"),
                        status=query.get("status"),
                    )
                )

        match = ASSET_PATH.match(path)
        if match:
            asset_id = match.group("asset_id")
            if method == "GET":
                return _ok(repo.get(asset_id))
            if method == "PUT":
                fields = validate_asset_payload(_parse_body(event), partial=True)
                return _ok(repo.update(asset_id, fields))
            if method == "DELETE":
                repo.delete(asset_id)
                return _response(204)

        return _error(404, "Route not found")
    except ValidationError as err:
        return _error(400, str(err))
    except AssetNotFound:
        return _error(404, "Asset not found")
    except Exception:  # never leak internals; details go to CloudWatch
        logger.exception("Unhandled error for %s %s", method, path)
        return _error(500, "Internal server error")


def _get_dependencies():
    global _deps
    if _deps is None:
        _deps = (
            AssetRepository.from_table_name(os.environ["ASSETS_TABLE"]),
            AssetStorage.from_bucket_name(os.environ["ASSET_BUCKET"]),
        )
    return _deps


def lambda_handler(event, context):
    repo, storage = _get_dependencies()
    return handle(event, repo, storage)
