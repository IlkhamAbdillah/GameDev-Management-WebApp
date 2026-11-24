"""Input validation for the Asset API. Pure functions, no AWS dependencies."""

ASSET_TYPES = ("Character", "Environment", "Props", "Animation", "Audio", "UI", "VFX", "Other")
ASSET_STATUSES = ("Planned", "In Progress", "Review", "Completed")
DEFAULT_STATUS = "Planned"

# Fields a client may set. assetId / createdAt / updatedAt are server-controlled.
MUTABLE_FIELDS = ("assetName", "assetType", "description", "assignedTo", "status", "s3Key")

MAX_LENGTHS = {
    "assetName": 100,
    "description": 1000,
    "assignedTo": 100,
    "s3Key": 1024,
}


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
    else:
        if not clean:
            raise ValidationError("No valid fields to update")
        if "assetName" in clean and not clean["assetName"]:
            raise ValidationError("assetName cannot be empty")

    return clean
