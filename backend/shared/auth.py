"""Authentication helpers shared by all three Lambdas: password hashing, HS256 JWTs, roles.

Standard library only (no PyJWT), so the deployment zips stay dependency-free. Function URLs have
no authorizer, so every Lambda verifies the bearer token itself with `authenticate`.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import NamedTuple

PROJECT_MANAGER = "project_manager"
MEMBER = "member"
ROLES = (PROJECT_MANAGER, MEMBER)

DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60
MIN_SECRET_LENGTH = 32

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1
_HEADER = {"alg": "HS256", "typ": "JWT"}


class AuthError(Exception):
    """Missing, malformed, tampered or expired credentials -> HTTP 401. Message is client-safe."""


class Forbidden(Exception):
    """Authenticated, but the role may not do this -> HTTP 403. Message is client-safe."""


class Principal(NamedTuple):
    user_id: str
    role: str
    name: str

    @property
    def is_manager(self):
        return self.role == PROJECT_MANAGER


# ---- passwords ----
def _b64e(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def hash_password(password, salt=None):
    """scrypt hash, self-describing: scrypt$N$r$p$salt$hash."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64e(salt)}${_b64e(digest)}"


def verify_password(password, stored):
    """Constant-time check. Never raises on a malformed stored hash; it just fails."""
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"), salt=_b64d(salt), n=int(n), r=int(r), p=int(p), dklen=32
        )
        return hmac.compare_digest(digest, _b64d(expected))
    except (ValueError, AttributeError, TypeError):
        return False


# ---- tokens ----
def _require_secret(secret):
    if not isinstance(secret, str) or len(secret) < MIN_SECRET_LENGTH:
        raise ValueError("JWT secret is missing or too short")  # misconfiguration -> generic 500


def _sign(signing_input, secret):
    return _b64e(hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest())


def issue_token(user_id, role, name, secret, ttl=DEFAULT_TOKEN_TTL_SECONDS, now=None):
    """Return (token, expires_at_epoch)."""
    _require_secret(secret)
    issued = int(now if now is not None else time.time())
    claims = {"sub": user_id, "role": role, "name": name, "iat": issued, "exp": issued + ttl}
    signing_input = (
        _b64e(json.dumps(_HEADER, separators=(",", ":")).encode())
        + "."
        + _b64e(json.dumps(claims, separators=(",", ":")).encode())
    )
    return f"{signing_input}.{_sign(signing_input, secret)}", claims["exp"]


def verify_token(token, secret, now=None):
    """Return a Principal or raise AuthError. Only HS256 is accepted (no `alg: none`)."""
    _require_secret(secret)
    invalid = AuthError("Invalid or expired token")
    try:
        header_part, payload_part, signature = token.split(".")
        if not hmac.compare_digest(signature, _sign(f"{header_part}.{payload_part}", secret)):
            raise invalid
        if json.loads(_b64d(header_part)) != _HEADER:
            raise invalid
        claims = json.loads(_b64d(payload_part))
        expires = claims["exp"]
        current = now if now is not None else time.time()
        if not isinstance(expires, (int, float)) or expires <= current:
            raise invalid
        if claims["role"] not in ROLES or not isinstance(claims["sub"], str) or not claims["sub"]:
            raise invalid
        return Principal(claims["sub"], claims["role"], str(claims.get("name", "")))
    except AuthError:
        raise
    except (ValueError, KeyError, TypeError, AttributeError) as err:
        raise invalid from err


def authenticate(event, secret, now=None):
    """Read `Authorization: Bearer <jwt>` from a Function URL event and return the Principal."""
    headers = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
    scheme, _, token = (headers.get("authorization") or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthError("Authentication required")
    return verify_token(token.strip(), secret, now=now)


def require_role(principal, *roles):
    if principal.role not in roles:
        raise Forbidden("You do not have permission to do this")
