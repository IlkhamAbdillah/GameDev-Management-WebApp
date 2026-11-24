"""Input validation for the Auth/User API. Pure functions, no AWS dependencies."""
import re

from auth import ROLES

MAX_NAME = 100
MAX_EMAIL = 254
MIN_PASSWORD = 8
MAX_PASSWORD = 128
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ValidationError(ValueError):
    """Raised when a request payload is invalid. Message is safe to show to clients."""


def _object(payload):
    if not isinstance(payload, dict):
        raise ValidationError("Request body must be a JSON object")
    return payload


def _email(value):
    if not isinstance(value, str):
        raise ValidationError("email must be a string")
    value = value.strip().lower()
    if len(value) > MAX_EMAIL or not EMAIL_PATTERN.match(value):
        raise ValidationError("email must be a valid email address")
    return value


def _name(value):
    if not isinstance(value, str):
        raise ValidationError("name must be a string")
    value = value.strip()
    if not value:
        raise ValidationError("name cannot be empty")
    if len(value) > MAX_NAME:
        raise ValidationError(f"name must be at most {MAX_NAME} characters")
    return value


def validate_password(value, field="password"):
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be a string")
    if not MIN_PASSWORD <= len(value) <= MAX_PASSWORD:
        raise ValidationError(f"{field} must be {MIN_PASSWORD}-{MAX_PASSWORD} characters")
    return value


def _role(value):
    if value not in ROLES:
        raise ValidationError(f"role must be one of: {', '.join(ROLES)}")
    return value


def validate_login(payload):
    """Credentials are only checked for shape here; wrong values are a 401, not a 400."""
    payload = _object(payload)
    email, password = payload.get("email"), payload.get("password")
    if not isinstance(email, str) or not isinstance(password, str) or not email or not password:
        raise ValidationError("email and password are required")
    return email.strip().lower(), password


def validate_user_payload(payload, partial=False):
    """Whitelist name/email/password/role. Email is fixed after creation (not updatable)."""
    payload = _object(payload)
    clean = {}
    if "name" in payload:
        clean["name"] = _name(payload["name"])
    if "role" in payload:
        clean["role"] = _role(payload["role"])
    if "password" in payload:
        clean["password"] = validate_password(payload["password"])
    if partial:
        if not clean:
            raise ValidationError("No valid fields to update")
        return clean
    for field in ("name", "email", "password", "role"):
        if field not in payload:
            raise ValidationError(f"{field} is required")
    clean["email"] = _email(payload["email"])
    return clean


def validate_password_change(payload):
    payload = _object(payload)
    current = payload.get("currentPassword")
    if not isinstance(current, str) or not current:
        raise ValidationError("currentPassword is required")
    if "newPassword" not in payload:
        raise ValidationError("newPassword is required")
    return current, validate_password(payload["newPassword"], "newPassword")
