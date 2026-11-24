"""Input validation for the Asset API. Pure functions, no AWS dependencies."""
from filetypes import ALLOWED_TYPES, extension_of, sanitize_filename

ASSET_TYPES = ("Character", "Environment", "Props", "Animation", "Audio", "UI", "VFX", "Other")
ASSET_STATUSES = ("Planned", "In Progress", "Review", "Completed")
DEFAULT_STATUS = "Planned"

# Fields a client may set. assetId / createdAt / updatedAt are server-controlled.
MUTABLE_FIELDS = ("assetName", "assetType", "description", "assignedTo", "status", "s3Key", "folderId")

MAX_LENGTHS = {
    "assetName": 100,
    "description": 1000,
    "assignedTo": 100,
    "s3Key": 1024,
    "folderId": 64,
}
FOLDER_NAME_MAX = 60
INVALID_FOLDER_CHARS = set("/\\")


class ValidationError(ValueError):
    """Raised when a request payload is invalid. Message is safe to show to clients."""


def _clean_string(payload, field):
    value = payload[field]
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be a string")
    value = value.strip()
    if len(value) > MAX_LENGTHS.get(field, 255):
        raise ValidationError(f"{field} must be at most {MAX_LENGTHS.get(field, 255)} characters")
    return value


def validate_asset_payload(payload, partial=False):
    """Validate and normalise an asset payload.

    partial=False: create/full update -> assetName and assetType are required.
    partial=True: only supplied fields are validated.
    Unknown fields are ignored (never persisted).
    """
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")

    clean = {}
    for field in MUTABLE_FIELDS:
        if field not in payload:
            continue
        if field in ("assetType", "status"):
            value = payload[field]
            allowed = ASSET_TYPES if field == "assetType" else ASSET_STATUSES
            if value not in allowed:
                raise ValidationError(f"{field} must be one of: {', '.join(allowed)}")
            clean[field] = value
        else:
            clean[field] = _clean_string(payload, field)

    if not partial:
        if not clean.get("assetName"):
            raise ValidationError("assetName is required")
        if "assetType" not in clean:
            raise ValidationError("assetType is required")
        clean.setdefault("status", DEFAULT_STATUS)
        clean.setdefault("description", "")
        clean.setdefault("assignedTo", "")
        clean.setdefault("s3Key", "")
        clean.setdefault("folderId", "")
    else:
        if not clean:
            raise ValidationError("No valid fields to update")
        if "assetName" in clean and not clean["assetName"]:
            raise ValidationError("assetName cannot be empty")

    return clean


def validate_upload_request(payload, max_bytes):
    """Validate a POST /assets/{id}/upload-url body: file type allow-list and size limit."""
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")
    name = payload.get("fileName")
    if not isinstance(name, str) or not name.strip():
        raise ValidationError("fileName is required")
    ext = extension_of(name.strip())
    if ext not in ALLOWED_TYPES:
        raise ValidationError(f"File type not allowed. Allowed: {', '.join(sorted(ALLOWED_TYPES))}")
    size = payload.get("fileSize")
    if isinstance(size, bool) or not isinstance(size, int) or size < 1:
        raise ValidationError("fileSize must be a positive integer (bytes)")
    if size > max_bytes:
        raise ValidationError(f"File is too large. Maximum size is {max_bytes // (1024 * 1024)} MB")
    return {
        "fileName": sanitize_filename(name),
        "contentType": ALLOWED_TYPES[ext][0],
        "fileSize": size,
    }


def validate_folder_payload(payload, partial=False):
    """Validate a folder payload: name (required on create) and parentId ('' = root)."""
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")
    clean = {}
    if "name" in payload:
        name = payload["name"]
        if not isinstance(name, str):
            raise ValidationError("name must be a string")
        name = " ".join(name.split())
        if not name:
            raise ValidationError("name cannot be empty")
        if len(name) > FOLDER_NAME_MAX:
            raise ValidationError(f"name must be at most {FOLDER_NAME_MAX} characters")
        if INVALID_FOLDER_CHARS & set(name):
            raise ValidationError("name cannot contain / or \\")
        clean["name"] = name
    if "parentId" in payload:
        parent = payload["parentId"]
        if parent is None:
            parent = ""
        if not isinstance(parent, str) or len(parent) > MAX_LENGTHS["folderId"]:
            raise ValidationError("parentId must be a folder id or empty for the root")
        clean["parentId"] = parent
    if partial:
        if not clean:
            raise ValidationError("No valid fields to update")
    else:
        if "name" not in clean:
            raise ValidationError("name is required")
        clean.setdefault("parentId", "")
    return clean
