"""Auth Handler Lambda: login, current user, password change and user management (payload v2)."""
import json
import logging
import os
import re
import time

from auth import (
    DEFAULT_TOKEN_TTL_SECONDS,
    MEMBER,
    PROJECT_MANAGER,
    AuthError,
    Forbidden,
    authenticate,
    hash_password,
    issue_token,
    require_role,
    verify_password,
)
from database import UserNotFound, UserRepository
from validation import (
    ValidationError,
    validate_login,
    validate_password_change,
    validate_user_payload,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

USER_PATH = re.compile(r"^/users/(?P<user_id>[^/]+)$")
_repo = None
_dummy_hash = None  # verified against when the email is unknown, so timing does not reveal accounts


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


def _public(user):
    """Never expose the password hash."""
    return {k: v for k, v in user.items() if k != "passwordHash"}


def _login(repo, secret, event):
    global _dummy_hash
    email, password = validate_login(_parse_body(event))
    user = repo.get_by_email(email)
    if user is None:
        _dummy_hash = _dummy_hash or hash_password("not-a-real-password")
        verify_password(password, _dummy_hash)
        raise AuthError("Invalid email or password")
    if not verify_password(password, user.get("passwordHash", "")):
        raise AuthError("Invalid email or password")
    token, expires_at = issue_token(
        user["userId"], user["role"], user["name"], secret, ttl=_token_ttl()
    )
    return {"token": token, "expiresAt": expires_at, "user": _public(user)}


def _me(repo, principal):
    try:
        return _public(repo.get(principal.user_id))
    except UserNotFound as err:  # account was deleted after the token was issued
        raise AuthError("Invalid or expired token") from err


def _change_password(repo, principal, event):
    current, new = validate_password_change(_parse_body(event))
    user = repo.get(principal.user_id)
    if not verify_password(current, user.get("passwordHash", "")):
        raise ValidationError("currentPassword is incorrect")
    repo.update(principal.user_id, {"passwordHash": hash_password(new)})


def _create_user(repo, event):
    fields = validate_user_payload(_parse_body(event))
    if repo.get_by_email(fields["email"]):
        raise ValidationError("A user with this email already exists")
    fields["passwordHash"] = hash_password(fields.pop("password"))
    return _public(repo.create(fields))


def _update_user(repo, user_id, event):
    fields = validate_user_payload(_parse_body(event), partial=True)
    current = repo.get(user_id)
    if fields.get("role") == MEMBER and current.get("role") == PROJECT_MANAGER:
        raise ValidationError("A project manager cannot be changed to a member")  # the role is permanent
    if "password" in fields:
        fields["passwordHash"] = hash_password(fields.pop("password"))
    return _public(repo.update(user_id, fields))


def _delete_user(repo, principal, user_id):
    if user_id == principal.user_id:
        raise ValidationError("You cannot delete your own account")
    repo.get(user_id)  # 404 if missing
    repo.delete(user_id)


def handle(event, repo, secret):
    """Pure routing function; the repository and JWT secret are injected for unit tests."""
    http = event.get("requestContext", {}).get("http", {})
    method = http.get("method", "")
    path = event.get("rawPath", "").rstrip("/") or "/"

    try:
        if path == "/health" and method == "GET":
            return _health({"usersTable": repo.ping})

        if path == "/auth/login" and method == "POST":
            return _ok(_login(repo, secret, event))

        principal = authenticate(event, secret)

        if path == "/auth/me" and method == "GET":
            return _ok(_me(repo, principal))
        if path == "/auth/password" and method == "POST":
            _change_password(repo, principal, event)
            return _response(204)

        if path == "/users" or USER_PATH.match(path):
            require_role(principal, PROJECT_MANAGER)
            if path == "/users":
                if method == "GET":
                    return _ok([_public(u) for u in repo.list()])
                if method == "POST":
                    return _ok(_create_user(repo, event), 201)
            else:
                user_id = USER_PATH.match(path).group("user_id")
                if method == "PUT":
                    return _ok(_update_user(repo, user_id, event))
                if method == "DELETE":
                    _delete_user(repo, principal, user_id)
                    return _response(204)

        return _error(404, "Route not found")
    except AuthError as err:
        return _error(401, str(err))
    except Forbidden as err:
        return _error(403, str(err))
    except ValidationError as err:
        return _error(400, str(err))
    except UserNotFound:
        return _error(404, "User not found")
    except Exception:  # never leak internals; details go to CloudWatch
        logger.exception("Unhandled error for %s %s", method, path)
        return _error(500, "Internal server error")


def _token_ttl():
    return int(os.environ.get("TOKEN_TTL_SECONDS", DEFAULT_TOKEN_TTL_SECONDS))


def lambda_handler(event, context):
    global _repo
    if _repo is None:
        _repo = UserRepository.from_table_name(os.environ["USERS_TABLE"])
    return handle(event, _repo, os.environ["JWT_SECRET"])
