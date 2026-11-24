"""The real Lambda entry points (lambda_handler): env-var wiring and dependency construction.

Other tests inject fakes into handle(); these make sure the deployed wiring itself works.
"""
import importlib
import json
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

ROOT = Path(__file__).resolve().parents[1] / "backend"
REGION = "us-east-1"
BUCKET = "gamevault-entrypoint-bucket"
MODULES = ("handler", "database", "validation", "storage", "timeline", "folders", "filetypes")


def fresh_handler(directory):
    """Import a Lambda's handler.py in isolation so its module-level cached dependencies are new."""
    for name in MODULES:
        sys.modules.pop(name, None)
    sys.path.insert(0, str(ROOT / directory))
    try:
        return importlib.import_module("handler")
    finally:
        sys.path.remove(str(ROOT / directory))
        for name in MODULES:
            sys.modules.pop(name, None)


def make_table(name, key):
    boto3.resource("dynamodb", region_name=REGION).create_table(
        TableName=name,
        KeySchema=[{"AttributeName": key, "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": key, "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )


def event(method, path, body=None, query=None):
    return {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "queryStringParameters": query,
        "body": json.dumps(body) if body is not None else None,
    }


@pytest.fixture(autouse=True)
def aws_env(monkeypatch):
    for key, value in {
        "AWS_ACCESS_KEY_ID": "test",
        "AWS_SECRET_ACCESS_KEY": "test",
        "AWS_DEFAULT_REGION": REGION,
        "ASSETS_TABLE": "GameVaultAssets",
        "FOLDERS_TABLE": "GameVaultFolders",
        "TASKS_TABLE": "GameVaultTasks",
        "ASSET_BUCKET": BUCKET,
    }.items():
        monkeypatch.setenv(key, value)


def test_asset_lambda_entrypoint_end_to_end():
    with mock_aws():
        make_table("GameVaultAssets", "assetId")
        make_table("GameVaultFolders", "folderId")
        boto3.client("s3", region_name=REGION).create_bucket(Bucket=BUCKET)
        lambda_handler = fresh_handler("asset-handler").lambda_handler

        health = lambda_handler(event("GET", "/health"), None)
        assert health["statusCode"] == 200 and json.loads(health["body"])["data"]["checks"]["bucket"]["ok"] is True

        folder = json.loads(lambda_handler(event("POST", "/folders", {"name": "Props"}), None)["body"])["data"]
        created = lambda_handler(
            event("POST", "/assets", {"assetName": "Crate", "assetType": "Props", "folderId": folder["folderId"]}), None
        )
        asset = json.loads(created["body"])["data"]
        assert created["statusCode"] == 201 and asset["folderId"] == folder["folderId"]

        ticket = lambda_handler(
            event("POST", f"/assets/{asset['assetId']}/upload-url", {"fileName": "crate.glb", "fileSize": 10}), None
        )
        assert ticket["statusCode"] == 200
        assert lambda_handler(event("DELETE", f"/assets/{asset['assetId']}"), None)["statusCode"] == 204


def test_task_lambda_entrypoint_end_to_end():
    with mock_aws():
        make_table("GameVaultTasks", "taskId")
        lambda_handler = fresh_handler("task-handler").lambda_handler

        assert lambda_handler(event("GET", "/health"), None)["statusCode"] == 200
        created = lambda_handler(
            event("POST", "/tasks", {"title": "Ship it", "startDate": "2026-01-01", "dueDate": "2026-01-05"}), None
        )
        assert created["statusCode"] == 201
        timeline = json.loads(lambda_handler(event("GET", "/timeline"), None)["body"])["data"]
        assert [t["title"] for t in timeline["tasks"]] == ["Ship it"] and timeline["stats"]["total"] == 1


def test_lambda_returns_json_error_for_unknown_route():
    with mock_aws():
        make_table("GameVaultTasks", "taskId")
        response = fresh_handler("task-handler").lambda_handler(event("GET", "/nope"), None)
        assert response["statusCode"] == 404 and response["headers"]["Content-Type"] == "application/json"
        assert json.loads(response["body"]) == {"success": False, "message": "Route not found"}
