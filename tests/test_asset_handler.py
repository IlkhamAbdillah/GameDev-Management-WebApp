import json
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

HANDLER_DIR = str(Path(__file__).resolve().parents[1] / "backend" / "asset-handler")
sys.path.insert(0, HANDLER_DIR)

import handler  # noqa: E402
from database import AssetRepository  # noqa: E402
from storage import AssetStorage  # noqa: E402
from validation import ValidationError, validate_asset_payload  # noqa: E402

REGION = "us-east-1"
BUCKET = "gamevault-test-bucket"


@pytest.fixture(autouse=True)
def aws_env(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    monkeypatch.setenv("AWS_DEFAULT_REGION", REGION)


@pytest.fixture
def deps():
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name=REGION)
        table = ddb.create_table(
            TableName="GameVaultAssets",
            KeySchema=[{"AttributeName": "assetId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "assetId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        s3 = boto3.client("s3", region_name=REGION)
        s3.create_bucket(Bucket=BUCKET)
        yield AssetRepository(table), AssetStorage(s3, BUCKET)


def call(deps, method, path, body=None, query=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
    }
    res = handler.handle(event, *deps)
    return res["statusCode"], json.loads(res["body"]) if "body" in res else None


def create(deps, **overrides):
    payload = {"assetName": "Main Character", "assetType": "Character", **overrides}
    status, body = call(deps, "POST", "/assets", payload)
    assert status == 201
    return body["data"]


# ---- create ----
def test_create_asset_sets_defaults_and_timestamps(deps):
    asset = create(deps)
    assert asset["status"] == "Planned"
    assert asset["assetId"]
    assert asset["createdAt"].endswith("Z") and asset["createdAt"] == asset["updatedAt"]


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"assetName": "x"},
        {"assetType": "Character"},
        {"assetName": "  ", "assetType": "Character"},
        {"assetName": "x", "assetType": "Banana"},
        {"assetName": "x", "assetType": "Audio", "status": "Nope"},
        {"assetName": 5, "assetType": "Audio"},
        {"assetName": "x" * 101, "assetType": "Audio"},
    ],
)
def test_create_rejects_invalid_payload(deps, payload):
    status, body = call(deps, "POST", "/assets", payload)
    assert status == 400 and body["success"] is False


def test_create_ignores_server_controlled_fields(deps):
    asset = create(deps, assetId="HACK", createdAt="1999")
    assert asset["assetId"] != "HACK" and asset["createdAt"] != "1999"


def test_create_requires_json_body(deps):
    event = {"rawPath": "/assets", "requestContext": {"http": {"method": "POST"}}, "body": "{bad"}
    assert handler.handle(event, *deps)["statusCode"] == 400


# ---- read ----
def test_get_asset(deps):
    asset = create(deps)
    status, body = call(deps, "GET", f"/assets/{asset['assetId']}")
    assert status == 200 and body["data"]["assetName"] == "Main Character"


def test_get_missing_asset_returns_404(deps):
    status, body = call(deps, "GET", "/assets/nope")
    assert status == 404 and body == {"success": False, "message": "Asset not found"}


def test_list_search_and_filters(deps):
    create(deps, assetName="Hero Sword", assetType="Props", status="Review")
    create(deps, assetName="Hero Theme", assetType="Audio")
    create(deps, assetName="Forest", assetType="Environment")
    assert len(call(deps, "GET", "/assets")[1]["data"]) == 3
    assert len(call(deps, "GET", "/assets", query={"search": "hero"})[1]["data"]) == 2
    assert len(call(deps, "GET", "/assets", query={"assetType": "Audio"})[1]["data"]) == 1
    assert len(call(deps, "GET", "/assets", query={"status": "Review"})[1]["data"]) == 1


# ---- update ----
def test_update_changes_fields_and_keeps_identity(deps):
    asset = create(deps)
    status, body = call(
        deps, "PUT", f"/assets/{asset['assetId']}", {"status": "Completed", "assignedTo": "Rina"}
    )
    data = body["data"]
    assert status == 200 and data["status"] == "Completed" and data["assignedTo"] == "Rina"
    assert data["assetName"] == "Main Character"
    assert data["createdAt"] == asset["createdAt"] and data["updatedAt"] >= asset["updatedAt"]


def test_update_missing_asset_does_not_create_it(deps):
    status, _ = call(deps, "PUT", "/assets/ghost", {"status": "Review"})
    assert status == 404
    assert call(deps, "GET", "/assets")[1]["data"] == []


def test_update_rejects_invalid_and_empty(deps):
    asset = create(deps)
    assert call(deps, "PUT", f"/assets/{asset['assetId']}", {"status": "Bad"})[0] == 400
    assert call(deps, "PUT", f"/assets/{asset['assetId']}", {"unknown": 1})[0] == 400


# ---- delete ----
def test_delete_asset(deps):
    asset = create(deps)
    event = {"rawPath": f"/assets/{asset['assetId']}", "requestContext": {"http": {"method": "DELETE"}}}
    res = handler.handle(event, *deps)
    assert res["statusCode"] == 204 and "body" not in res
    assert call(deps, "GET", f"/assets/{asset['assetId']}")[0] == 404


def test_delete_missing_asset_returns_404(deps):
    assert call(deps, "DELETE", "/assets/ghost")[0] == 404


# ---- misc ----
def test_health_checks_dynamodb_and_s3(deps):
    status, body = call(deps, "GET", "/health")
    assert status == 200 and body["data"]["s3"] == "ok"


def test_unknown_route_and_method(deps):
    assert call(deps, "GET", "/nothing")[0] == 404
    assert call(deps, "PATCH", "/assets")[0] == 404


def test_unexpected_error_is_hidden(deps):
    class Broken:
        def list(self, **_):
            raise RuntimeError("secret internals")

    event = {"rawPath": "/assets", "requestContext": {"http": {"method": "GET"}}}
    res = handler.handle(event, Broken(), deps[1])
    assert res["statusCode"] == 500
    assert "secret" not in res["body"]


def test_validation_partial_requires_something():
    with pytest.raises(ValidationError):
        validate_asset_payload({}, partial=True)
