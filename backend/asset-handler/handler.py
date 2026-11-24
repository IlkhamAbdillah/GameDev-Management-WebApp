"""Asset Handler Lambda: routes Function URL (payload v2) requests to asset operations."""
import json
import logging
import os
import re
import time

from auth import PROJECT_MANAGER, AuthError, Forbidden, authenticate, require_role
from database import AssetNotFound, AssetRepository, FolderNotFound, FolderRepository
from filetypes import DEFAULT_MAX_UPLOAD_BYTES, asset_prefix, file_name_from_key, preview_kind
from folders import MAX_DEPTH, depth_of, height_of, is_self_or_descendant, name_taken
from storage import AssetStorage
from validation import (
    ValidationError,
    validate_asset_payload,
    validate_folder_payload,
    validate_upload_request,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ASSET_PATH = re.compile(r"^/assets/(?P<asset_id>[^/]+)$")
UPLOAD_PATH = re.compile(r"^/assets/(?P<asset_id>[^/]+)/upload-url$")
FILE_PATH = re.compile(r"^/assets/(?P<asset_id>[^/]+)/file$")
FOLDER_PATH = re.compile(r"^/folders/(?P<folder_id>[^/]+)$")


class NoFile(Exception):
    pass

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


def _present(asset, storage):
    """Add computed, short-lived file fields (never stored): fileName, downloadUrl, previewUrl."""
    key = asset.get("s3Key")
    asset = {"folderId": "", **asset}  # assets created before folders existed have no folderId
    if not key:
        return {**asset, "fileName": "", "downloadUrl": "", "previewUrl": "", "previewKind": ""}
    name = file_name_from_key(key)
    kind = preview_kind(name)
    return {
        **asset,
        "fileName": name,
        "downloadUrl": storage.download_url(key, name),
        "previewUrl": storage.preview_url(key) if kind else "",
        "previewKind": kind or "",
    }


def _require_folder(folders, folder_id):
    if folder_id and not folders.exists(folder_id):
        raise ValidationError("Folder does not exist")


def _check_placement(all_folders, parent_id, subtree_height, moving_id=None):
    """Parent must exist, must not be inside the moved folder, and the tree must stay shallow."""
    if parent_id and parent_id not in {f["folderId"] for f in all_folders}:
        raise ValidationError("Parent folder does not exist")
    if moving_id and is_self_or_descendant(all_folders, moving_id, parent_id):
        raise ValidationError("A folder cannot be moved into itself or one of its subfolders")
    if depth_of(all_folders, parent_id) + subtree_height > MAX_DEPTH:
        raise ValidationError(f"Folders can be nested at most {MAX_DEPTH} levels deep")


def _create_folder(folders, event):
    fields = validate_folder_payload(_parse_body(event))
    everything = folders.list()
    _check_placement(everything, fields["parentId"], 1)
    if name_taken(everything, fields["parentId"], fields["name"]):
        raise ValidationError("A folder with this name already exists here")
    return folders.create(fields)


def _update_folder(folders, folder_id, event):
    fields = validate_folder_payload(_parse_body(event), partial=True)
    everything = folders.list()
    current = next((f for f in everything if f["folderId"] == folder_id), None)
    if current is None:
        raise FolderNotFound(folder_id)
    parent_id = fields.get("parentId", current.get("parentId", ""))
    if "parentId" in fields:
        _check_placement(everything, parent_id, height_of(everything, folder_id), moving_id=folder_id)
    if name_taken(everything, parent_id, fields.get("name", current["name"]), ignore_id=folder_id):
        raise ValidationError("A folder with this name already exists here")
    return folders.update(folder_id, fields)


def _delete_folder(repo, folders, folder_id):
    folders.get(folder_id)  # 404 if missing
    if any(f.get("parentId", "") == folder_id for f in folders.list()) or repo.list(folder_id=folder_id):
        raise ValidationError("Folder is not empty. Move or delete its contents first")
    folders.delete(folder_id)


def _update_asset(repo, storage, folders, asset_id, event):
    fields = validate_asset_payload(_parse_body(event), partial=True)
    if "folderId" in fields:
        _require_folder(folders, fields["folderId"])
    if "s3Key" not in fields:
        return repo.update(asset_id, fields)

    current = repo.get(asset_id)
    old_key, new_key = current.get("s3Key", ""), fields["s3Key"]
    if new_key == old_key:
        fields.pop("s3Key")
        return repo.update(asset_id, fields) if fields else current
    if not new_key:
        raise ValidationError("Use DELETE /assets/{assetId}/file to remove the file")
    if not new_key.startswith(asset_prefix(asset_id)):
        raise ValidationError("s3Key does not belong to this asset")
    if not storage.object_exists(new_key):
        raise ValidationError("No uploaded file found for this s3Key")

    updated = repo.update(asset_id, fields)
    if old_key:  # file was replaced: drop the previous object
        storage.delete_object(old_key)
    return updated


def handle(event, repo, storage, folders, secret):
    """Pure routing function; dependencies (and the JWT secret) are injected for unit tests.

    Everyone signed in can read and add/edit assets and upload files. Deleting assets or files and
    managing folders is project-manager only.
    """
    http = event.get("requestContext", {}).get("http", {})
    method = http.get("method", "")
    path = event.get("rawPath", "").rstrip("/") or "/"
    query = event.get("queryStringParameters") or {}

    try:
        if path == "/health" and method == "GET":
            return _health(
                {"assetsTable": repo.ping, "foldersTable": folders.ping, "bucket": storage.ping}
            )  # public: used by /connectivity

        principal = authenticate(event, secret)

        if path.startswith("/folders") and method in ("POST", "PUT", "DELETE"):
            require_role(principal, PROJECT_MANAGER)

        if path == "/folders":
            if method == "POST":
                return _ok(_create_folder(folders, event), 201)
            if method == "GET":
                return _ok(folders.list())

        match = FOLDER_PATH.match(path)
        if match:
            folder_id = match.group("folder_id")
            if method == "GET":
                return _ok(folders.get(folder_id))
            if method == "PUT":
                return _ok(_update_folder(folders, folder_id, event))
            if method == "DELETE":
                _delete_folder(repo, folders, folder_id)
                return _response(204)

        if path == "/assets":
            if method == "POST":
                fields = validate_asset_payload(_parse_body(event))
                if fields.get("s3Key"):
                    raise ValidationError("s3Key cannot be set on create; upload a file after creating")
                _require_folder(folders, fields.get("folderId", ""))
                return _ok(_present(repo.create(fields), storage), 201)
            if method == "GET":
                assets = repo.list(
                    search=query.get("search"),
                    asset_type=query.get("assetType"),
                    status=query.get("status"),
                    folder_id=query.get("folderId"),
                )
                return _ok([_present(a, storage) for a in assets])

        match = UPLOAD_PATH.match(path)
        if match and method == "POST":
            asset_id = match.group("asset_id")
            repo.get(asset_id)  # 404 if the asset does not exist
            upload = validate_upload_request(_parse_body(event), _max_upload_bytes())
            return _ok(
                storage.create_upload(
                    asset_id, upload["fileName"], upload["contentType"], upload["fileSize"]
                )
            )

        match = FILE_PATH.match(path)
        if match and method == "DELETE":
            require_role(principal, PROJECT_MANAGER)
            asset_id = match.group("asset_id")
            key = repo.get(asset_id).get("s3Key")
            if not key:
                raise NoFile()
            repo.update(asset_id, {"s3Key": ""})
            storage.delete_object(key)
            return _response(204)

        match = ASSET_PATH.match(path)
        if match:
            asset_id = match.group("asset_id")
            if method == "GET":
                return _ok(_present(repo.get(asset_id), storage))
            if method == "PUT":
                return _ok(_present(_update_asset(repo, storage, folders, asset_id, event), storage))
            if method == "DELETE":
                require_role(principal, PROJECT_MANAGER)
                repo.get(asset_id)  # 404 first, so we only ever clean up an existing asset's prefix
                storage.delete_asset_files(asset_id)
                repo.delete(asset_id)
                return _response(204)

        return _error(404, "Route not found")
    except AuthError as err:
        return _error(401, str(err))
    except Forbidden as err:
        return _error(403, str(err))
    except ValidationError as err:
        return _error(400, str(err))
    except AssetNotFound:
        return _error(404, "Asset not found")
    except FolderNotFound:
        return _error(404, "Folder not found")
    except NoFile:
        return _error(404, "Asset has no file")
    except Exception:  # never leak internals; details go to CloudWatch
        logger.exception("Unhandled error for %s %s", method, path)
        return _error(500, "Internal server error")


def _max_upload_bytes():
    return int(os.environ.get("MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES))


def _get_dependencies():
    global _deps
    if _deps is None:
        _deps = (
            AssetRepository.from_table_name(os.environ["ASSETS_TABLE"]),
            AssetStorage.from_bucket_name(os.environ["ASSET_BUCKET"]),
            FolderRepository.from_table_name(os.environ["FOLDERS_TABLE"]),
        )
    return _deps


def lambda_handler(event, context):
    repo, storage, folders = _get_dependencies()
    return handle(event, repo, storage, folders, os.environ["JWT_SECRET"])
