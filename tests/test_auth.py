"""Shared auth module: password hashing, HS256 tokens, bearer extraction, role checks."""
import base64
import hashlib
import hmac
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "shared"))
import auth  # noqa: E402

SECRET = "unit-test-secret-0123456789-0123456789"


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def forge(header, claims, secret=SECRET):
    signing = b64(json.dumps(header).encode()) + "." + b64(json.dumps(claims).encode())
    sig = b64(hmac.new(secret.encode(), signing.encode(), hashlib.sha256).digest())
    return f"{signing}.{sig}"


def test_password_hash_roundtrip_and_salting():
    first, second = auth.hash_password("s3cret-pass"), auth.hash_password("s3cret-pass")
    assert first != second and "s3cret" not in first
    assert auth.verify_password("s3cret-pass", first) and auth.verify_password("s3cret-pass", second)
    assert not auth.verify_password("wrong", first)


@pytest.mark.parametrize("stored", ["", "plain", "scrypt$x$y", "md5$1$2$3$a$b", None])
def test_verify_password_never_raises_on_garbage(stored):
    assert auth.verify_password("anything", stored) is False


def test_token_roundtrip():
    token, exp = auth.issue_token("u1", auth.MEMBER, "Alice", SECRET, ttl=60, now=1000)
    assert exp == 1060
    principal = auth.verify_token(token, SECRET, now=1030)
    assert principal == auth.Principal("u1", auth.MEMBER, "Alice") and not principal.is_manager


def test_expired_token_is_rejected():
    token, _ = auth.issue_token("u1", auth.MEMBER, "A", SECRET, ttl=60, now=1000)
    with pytest.raises(auth.AuthError):
        auth.verify_token(token, SECRET, now=1060)


def test_tampered_or_foreign_tokens_are_rejected():
    token, _ = auth.issue_token("u1", auth.MEMBER, "A", SECRET)
    head, payload, sig = token.split(".")
    forged_payload = b64(json.dumps({"sub": "u1", "role": auth.PROJECT_MANAGER, "exp": 9**10}).encode())
    for bad in (
        f"{head}.{forged_payload}.{sig}",  # role escalation with the old signature
        token + "x",
        "garbage",
        "a.b",
        "",
        auth.issue_token("u1", auth.MEMBER, "A", "another-secret-0123456789-0123456789")[0],
    ):
        with pytest.raises(auth.AuthError):
            auth.verify_token(bad, SECRET)


def test_alg_none_and_wrong_alg_are_rejected():
    claims = {"sub": "u1", "role": auth.PROJECT_MANAGER, "exp": 9**10}
    none_token = b64(b'{"alg":"none","typ":"JWT"}') + "." + b64(json.dumps(claims).encode()) + "."
    with pytest.raises(auth.AuthError):
        auth.verify_token(none_token, SECRET)
    with pytest.raises(auth.AuthError):
        auth.verify_token(forge({"alg": "HS512", "typ": "JWT"}, claims), SECRET)


@pytest.mark.parametrize(
    "claims",
    [{"sub": "u1", "role": "admin", "exp": 9**10}, {"sub": "", "role": "member", "exp": 9**10},
     {"role": "member", "exp": 9**10}, {"sub": "u1", "role": "member", "exp": "never"}],
)
def test_signed_but_malformed_claims_are_rejected(claims):
    with pytest.raises(auth.AuthError):
        auth.verify_token(forge({"alg": "HS256", "typ": "JWT"}, claims), SECRET)


def test_short_or_missing_secret_is_a_configuration_error_not_a_401():
    with pytest.raises(ValueError):
        auth.issue_token("u1", auth.MEMBER, "A", "short")
    with pytest.raises(ValueError):
        auth.verify_token("a.b.c", "")


def test_authenticate_reads_bearer_header_case_insensitively():
    token, _ = auth.issue_token("u1", auth.PROJECT_MANAGER, "Pat", SECRET)
    for headers in ({"authorization": f"Bearer {token}"}, {"Authorization": f"bearer {token}"}):
        assert auth.authenticate({"headers": headers}, SECRET).is_manager
    for event in ({}, {"headers": None}, {"headers": {"authorization": token}},
                  {"headers": {"authorization": "Bearer "}}, {"headers": {"authorization": "Basic abc"}}):
        with pytest.raises(auth.AuthError):
            auth.authenticate(event, SECRET)


def test_require_role():
    member = auth.Principal("u", auth.MEMBER, "A")
    auth.require_role(member, auth.MEMBER, auth.PROJECT_MANAGER)
    with pytest.raises(auth.Forbidden):
        auth.require_role(member, auth.PROJECT_MANAGER)
