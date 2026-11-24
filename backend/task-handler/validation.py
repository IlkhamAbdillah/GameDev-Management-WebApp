"""Input validation for the Task API. Pure functions, no AWS dependencies."""
from datetime import date

CATEGORIES = ("Programming", "Art", "Design", "Audio", "Testing", "Documentation", "Other")
PRIORITIES = ("Low", "Medium", "High", "Critical")
STATUSES = ("To Do", "In Progress", "In Review", "Done")
DEFAULT_STATUS = "To Do"
DEFAULT_PRIORITY = "Medium"
DEFAULT_CATEGORY = "Other"

# Fields a client may set. taskId / createdAt / updatedAt are server-controlled.
MUTABLE_FIELDS = (
    "title", "description", "assignee", "category", "priority", "status", "startDate", "dueDate",
)
MAX_LENGTHS = {"title": 120, "description": 2000, "assignee": 100}


class ValidationError(ValueError):
    """Raised when a request payload is invalid. Message is safe to show to clients."""


def _clean_string(payload, field):
    value = payload[field]
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be a string")
    value = value.strip()
    if len(value) > MAX_LENGTHS[field]:
        raise ValidationError(f"{field} must be at most {MAX_LENGTHS[field]} characters")
    return value


def _clean_date(payload, field):
    value = payload[field]
    if value in (None, ""):
        return ""
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be a YYYY-MM-DD string")
    try:
        date.fromisoformat(value)
    except ValueError as err:
        raise ValidationError(f"{field} must be a valid date in YYYY-MM-DD format") from err
    if len(value) != 10:
        raise ValidationError(f"{field} must be a valid date in YYYY-MM-DD format")
    return value


def validate_date_order(start_date, due_date):
    if start_date and due_date and due_date < start_date:
        raise ValidationError("dueDate must not be before startDate")


def validate_task_payload(payload, partial=False):
    """Validate and normalise a task payload (unknown fields are dropped).

    partial=False: create -> title required, defaults applied.
    partial=True: only supplied fields are validated; date order across the stored
    record is checked by the caller with validate_date_order.
    """
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")

    enums = {"category": CATEGORIES, "priority": PRIORITIES, "status": STATUSES}
    clean = {}
    for field in MUTABLE_FIELDS:
        if field not in payload:
            continue
        if field in enums:
            if payload[field] not in enums[field]:
                raise ValidationError(f"{field} must be one of: {', '.join(enums[field])}")
            clean[field] = payload[field]
        elif field in ("startDate", "dueDate"):
            clean[field] = _clean_date(payload, field)
        else:
            clean[field] = _clean_string(payload, field)

    if "title" in clean and not clean["title"]:
        raise ValidationError("title cannot be empty")

    if partial:
        if not clean:
            raise ValidationError("No valid fields to update")
    else:
        if "title" not in clean:
            raise ValidationError("title is required")
        clean.setdefault("description", "")
        clean.setdefault("assignee", "")
        clean.setdefault("category", DEFAULT_CATEGORY)
        clean.setdefault("priority", DEFAULT_PRIORITY)
        clean.setdefault("status", DEFAULT_STATUS)
        clean.setdefault("startDate", "")
        clean.setdefault("dueDate", "")

    validate_date_order(clean.get("startDate", ""), clean.get("dueDate", ""))
    return clean


def validate_timeline_query(query):
    """Validate GET /timeline query parameters; returns only the supplied, cleaned ones."""
    clean = {}
    for field in ("startDate", "endDate"):
        if query.get(field):
            clean[field] = _clean_date(query, field)
    if "status" in query and query["status"]:
        if query["status"] not in STATUSES:
            raise ValidationError(f"status must be one of: {', '.join(STATUSES)}")
        clean["status"] = query["status"]
    if "category" in query and query["category"]:
        if query["category"] not in CATEGORIES:
            raise ValidationError(f"category must be one of: {', '.join(CATEGORIES)}")
        clean["category"] = query["category"]
    if query.get("assignee"):
        if len(query["assignee"]) > MAX_LENGTHS["assignee"]:
            raise ValidationError("assignee is too long")
        clean["assignee"] = query["assignee"]
    if clean.get("startDate") and clean.get("endDate") and clean["endDate"] < clean["startDate"]:
        raise ValidationError("endDate must not be before startDate")
    return clean
