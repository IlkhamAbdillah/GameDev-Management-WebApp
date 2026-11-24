"""Auth Lambda: login, current user, password change and (project-manager-only) user management."""
import importlib
import json
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

BACKEND = Path(__file__).resolve().parents[1] / "backend"
HANDLER_DIR = str(BACKEND / "auth-handler")

# Same module names as the other Lambdas: load the auth versions in isolation.
for _name in ("handler", "database", "validation"):
    sys.modules.pop(_name, None)
sys.path.insert(0, str(BACKEND / "shared"))
sys.path.insert(0, HANDLER_DIR)
handler = importlib.import_module("handler")
UserRepository = importlib.import_module("database").UserRepository
auth = importlib.import_module("auth")
sys.path.remove(HANDLER_DIR)
for _name in ("handler", "database", "validation"):
    sys.modules.pop(_name, None)

REGION = "us-east-1"
SECRET = "test-secret-0123456789-0123456789-abcdef"
PASSWORD = "correct horse battery"


@pytest.fixture(autouse=True)
def aws_env(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("AWS_DEFAULT_REGION", REGION)


@pytest.fixture
def repo():
    with mock_aws():
        table = boto3.resource("dynamodb", region_name=REGION).create_table(
            TableName="GameVaultUsers",
            KeySchema=[{"AttributeName": "userId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "userId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        yield UserRepository(table)


def call(repo, method, path, body=None, token=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": {"authorization": f"Bearer {token}"} if token else {},
        "body": json.dumps(body) if body is not None else None,
    }
    res = handler.handle(event, repo, SECRET)
    return res["statusCode"], json.loads(res["body"]) if "body" in res else None


def seed(repo, email, role, name="Someone", password=PASSWORD):
    return repo.create({"name": name, "email": email, "role": role, "passwordHash": auth.hash_password(password)})


def login(repo, email, password=PASSWORD):
    status, body = call(repo, "POST", "/auth/login", {"email": email, "password": password})
    return status, body


def token_for(repo, email):
    return login(repo, email)[1]["data"]["token"]


@pytest.fixture
def manager(repo):
    seed(repo, "pat@example.com", auth.PROJECT_MANAGER, "Pat")
    return token_for(repo, "pat@example.com")


# ---- login ----
def test_login_returns_token_and_public_user(repo):
    user = seed(repo, "pat@example.com", auth.PROJECT_MANAGER, "Pat")
    status, body = login(repo, "  PAT@Example.com ")  # email is trimmed and case-insensitive
    data = body["data"]
    assert status == 200 and data["user"]["userId"] == user["userId"] and data["user"]["role"] == auth.PROJECT_MANAGER
    assert "passwordHash" not in data["user"] and "password" not in json.dumps(body).lower().replace("passwordhash", "")
    principal = auth.verify_token(data["token"], SECRET)
    assert principal == auth.Principal(user["userId"], auth.PROJECT_MANAGER, "Pat") and data["expiresAt"] > 0


def test_wrong_password_and_unknown_email_look_the_same(repo):
    seed(repo, "pat@example.com", auth.MEMBER)
    wrong = login(repo, "pat@example.com", "not the password")
    unknown = login(repo, "ghost@example.com")
    assert wrong == unknown == (401, {"success": False, "message": "Invalid email or password"})


@pytest.mark.parametrize("body", [{}, {"email": "a@b.co"}, {"password": "x"}, {"email": 1, "password": "x"}, []])
def test_login_validates_shape(repo, body):
    assert call(repo, "POST", "/auth/login", body)[0] == 400


def test_login_requires_json_body(repo):
    event = {"rawPath": "/auth/login", "requestContext": {"http": {"method": "POST"}}, "body": "{bad"}
    assert handler.handle(event, repo, SECRET)["statusCode"] == 400


# ---- me / password ----
def test_me_returns_current_user_and_needs_a_token(repo, manager):
    assert call(repo, "GET", "/auth/me", token=manager)[1]["data"]["email"] == "pat@example.com"
    assert call(repo, "GET", "/auth/me")[0] == 401
    assert call(repo, "GET", "/auth/me", token="a.b.c")[0] == 401


def test_me_is_401_after_the_account_was_deleted(repo, manager):
    member = seed(repo, "bob@example.com", auth.MEMBER)
    token = token_for(repo, "bob@example.com")
    assert call(repo, "DELETE", f"/users/{member['userId']}", token=manager)[0] == 204
    assert call(repo, "GET", "/auth/me", token=token)[0] == 401


def test_change_own_password(repo):
    seed(repo, "bob@example.com", auth.MEMBER)
    token = token_for(repo, "bob@example.com")
    assert call(repo, "POST", "/auth/password", {"currentPassword": "nope", "newPassword": "new-password-1"}, token)[0] == 400
    assert call(repo, "POST", "/auth/password", {"currentPassword": PASSWORD, "newPassword": "short"}, token)[0] == 400
    assert call(repo, "POST", "/auth/password", {"currentPassword": PASSWORD, "newPassword": "new-password-1"}, token)[0] == 204
    assert login(repo, "bob@example.com")[0] == 401
    assert login(repo, "bob@example.com", "new-password-1")[0] == 200


# ---- user management ----
def test_manager_creates_and_lists_users_without_hashes(repo, manager):
    payload = {"name": " Alice ", "email": "Alice@Example.com", "password": "alice-password", "role": "member"}
    status, body = call(repo, "POST", "/users", payload, manager)
    assert status == 201 and body["data"]["email"] == "alice@example.com" and body["data"]["name"] == "Alice"
    assert "passwordHash" not in body["data"] and "password" not in body["data"]
    listed = call(repo, "GET", "/users", token=manager)[1]["data"]
    assert [u["name"] for u in listed] == ["Alice", "Pat"] and all("passwordHash" not in u for u in listed)
    assert login(repo, "alice@example.com", "alice-password")[0] == 200


def test_create_user_validation_and_duplicates(repo, manager):
    ok = {"name": "A", "email": "a@example.com", "password": "long-enough-1", "role": "member"}
    assert call(repo, "POST", "/users", ok, manager)[0] == 201
    assert call(repo, "POST", "/users", {**ok, "email": "A@EXAMPLE.COM"}, manager)[0] == 400  # duplicate
    for bad in ({**ok, "email": "nope"}, {**ok, "password": "short"}, {**ok, "role": "admin"}, {**ok, "name": " "},
                {k: v for k, v in ok.items() if k != "role"}, []):
        assert call(repo, "POST", "/users", bad, manager)[0] == 400


def test_members_cannot_manage_users(repo):
    member = seed(repo, "bob@example.com", auth.MEMBER)
    token = token_for(repo, "bob@example.com")
    ok = {"name": "A", "email": "a@example.com", "password": "long-enough-1", "role": "project_manager"}
    assert call(repo, "GET", "/users", token=token)[0] == 403
    assert call(repo, "POST", "/users", ok, token)[0] == 403
    assert call(repo, "PUT", f"/users/{member['userId']}", {"role": "project_manager"}, token)[0] == 403
    assert call(repo, "DELETE", f"/users/{member['userId']}", token=token)[0] == 403
    assert repo.get(member["userId"])["role"] == auth.MEMBER  # privilege escalation did not happen


def test_users_endpoints_need_authentication(repo):
    assert call(repo, "GET", "/users")[0] == 401
    assert call(repo, "POST", "/users", {})[0] == 401


def test_update_user_name_role_password_but_not_email(repo, manager):
    member = seed(repo, "bob@example.com", auth.MEMBER, "Bob")
    path = f"/users/{member['userId']}"
    status, body = call(repo, "PUT", path, {"name": "Robert", "role": "project_manager", "email": "x@y.co", "passwordHash": "x"}, manager)
    assert status == 200 and body["data"]["name"] == "Robert" and body["data"]["role"] == auth.PROJECT_MANAGER
    assert body["data"]["email"] == "bob@example.com" and "passwordHash" not in body["data"]
    assert call(repo, "PUT", path, {"password": "reset-password-9"}, manager)[0] == 200
    assert login(repo, "bob@example.com", "reset-password-9")[0] == 200 and login(repo, "bob@example.com")[0] == 401
    assert call(repo, "PUT", path, {"unknown": 1}, manager)[0] == 400
    assert call(repo, "PUT", "/users/ghost", {"name": "X"}, manager)[0] == 404


def test_project_manager_role_is_permanent(repo, manager):
    me = call(repo, "GET", "/auth/me", token=manager)[1]["data"]["userId"]
    other = seed(repo, "co@example.com", auth.PROJECT_MANAGER)
    # nobody can be demoted, not yourself and not another manager, even when several managers exist
    for target in (me, other["userId"]):
        status, body = call(repo, "PUT", f"/users/{target}", {"role": "member"}, manager)
        assert status == 400 and "cannot be changed to a member" in body["message"]
        assert repo.get(target)["role"] == auth.PROJECT_MANAGER
    # other changes to a manager still work, and a manager can be "set" to manager (no-op)
    assert call(repo, "PUT", f"/users/{other['userId']}", {"role": "project_manager", "name": "Co"}, manager)[0] == 200
    assert call(repo, "DELETE", f"/users/{me}", token=manager)[0] == 400  # never your own account


def test_members_can_still_be_promoted(repo, manager):
    member = seed(repo, "bob@example.com", auth.MEMBER)
    assert call(repo, "PUT", f"/users/{member['userId']}", {"role": "project_manager"}, manager)[0] == 200


def test_delete_user(repo, manager):
    member = seed(repo, "bob@example.com", auth.MEMBER)
    assert call(repo, "DELETE", f"/users/{member['userId']}", token=manager)[0] == 204
    assert call(repo, "DELETE", f"/users/{member['userId']}", token=manager)[0] == 404
    assert login(repo, "bob@example.com")[0] == 401


# ---- misc ----
def test_health_is_public_and_reports_the_users_table(repo):
    status, body = call(repo, "GET", "/health")
    assert status == 200 and body["data"]["checks"]["usersTable"]["ok"] is True


def test_unknown_route_and_hidden_errors(repo, manager):
    assert call(repo, "GET", "/nothing", token=manager)[0] == 404
    assert call(repo, "GET", "/nothing")[0] == 401  # nothing is revealed to anonymous callers

    class Broken:
        def get_by_email(self, *_):
            raise RuntimeError("secret internals")

    event = {"rawPath": "/auth/login", "requestContext": {"http": {"method": "POST"}},
             "body": json.dumps({"email": "a@b.co", "password": "x"})}
    res = handler.handle(event, Broken(), SECRET)
    assert res["statusCode"] == 500 and "secret" not in res["body"]
