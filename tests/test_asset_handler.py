import json
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND / "asset-handler"))
sys.path.insert(0, str(BACKEND / "shared"))

import auth  # noqa: E402
import handler  # noqa: E402
from database import AssetRepository, FolderRepository  # noqa: E402
from filetypes import file_name_from_key, sanitize_filename  # noqa: E402
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
        folder_table = ddb.create_table(
            TableName="GameVaultFolders",
            KeySchema=[{"AttributeName": "folderId", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "folderId", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        s3 = boto3.client("s3", region_name=REGION)
        s3.create_bucket(Bucket=BUCKET)
        # storage uses the same SigV4 client as production
        yield AssetRepository(table), AssetStorage.from_bucket_name(BUCKET), FolderRepository(folder_table)


SECRET = "test-secret-0123456789-0123456789-abcdef"
MANAGER = ("manager-1", auth.PROJECT_MANAGER, "Pat Manager")
MEMBER = ("member-alice", auth.MEMBER, "Alice")


def bearer(user):
    token, _ = auth.issue_token(user[0], user[1], user[2], SECRET)
    return {"authorization": f"Bearer {token}"}


def call(deps, method, path, body=None, query=None, user=MANAGER, headers=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "queryStringParameters": query,
        "headers": bearer(user) if headers is None else headers,
        "body": json.dumps(body) if body is not None else None,
    }
    res = handler.handle(event, *deps, SECRET)
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
    event = {"rawPath": "/assets", "requestContext": {"http": {"method": "POST"}},
             "headers": bearer(MANAGER), "body": "{bad"}
    assert handler.handle(event, *deps, SECRET)["statusCode"] == 400


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
    event = {"rawPath": f"/assets/{asset['assetId']}", "requestContext": {"http": {"method": "DELETE"}},
             "headers": bearer(MANAGER)}
    res = handler.handle(event, *deps, SECRET)
    assert res["statusCode"] == 204 and "body" not in res
    assert call(deps, "GET", f"/assets/{asset['assetId']}")[0] == 404


def test_delete_missing_asset_returns_404(deps):
    assert call(deps, "DELETE", "/assets/ghost")[0] == 404


# ---- misc ----
def test_health_checks_dynamodb_and_s3(deps):
    status, body = call(deps, "GET", "/health")
    checks = body["data"]["checks"]
    assert status == 200 and body["data"]["status"] == "ok"
    assert set(checks) == {"assetsTable", "foldersTable", "bucket"}
    assert all(c["ok"] and c["ms"] >= 0 for c in checks.values())


def test_unknown_route_and_method(deps):
    assert call(deps, "GET", "/nothing")[0] == 404
    assert call(deps, "PATCH", "/assets")[0] == 404


def test_unexpected_error_is_hidden(deps):
    class Broken:
        def list(self, **_):
            raise RuntimeError("secret internals")

    event = {"rawPath": "/assets", "requestContext": {"http": {"method": "GET"}}, "headers": bearer(MANAGER)}
    res = handler.handle(event, Broken(), deps[1], deps[2], SECRET)
    assert res["statusCode"] == 500
    assert "secret" not in res["body"]


def test_validation_partial_requires_something():
    with pytest.raises(ValidationError):
        validate_asset_payload({}, partial=True)


# ---- files (Phase 4) ----
def s3_client(deps):
    return deps[1]._client


def request_upload(deps, asset_id, file_name="hero.png", size=1024):
    return call(deps, "POST", f"/assets/{asset_id}/upload-url", {"fileName": file_name, "fileSize": size})


def attach_file(deps, asset_id, file_name="hero.png", body=b"data"):
    """Full flow: get pre-signed URL, 'upload' the object (simulated), save the key on the asset."""
    status, res = request_upload(deps, asset_id, file_name, len(body))
    assert status == 200
    key = res["data"]["s3Key"]
    s3_client(deps).put_object(Bucket=BUCKET, Key=key, Body=body)
    status, saved = call(deps, "PUT", f"/assets/{asset_id}", {"s3Key": key})
    assert status == 200
    return key, saved["data"]


def object_keys(deps):
    return [o["Key"] for o in s3_client(deps).list_objects_v2(Bucket=BUCKET).get("Contents", [])]


def test_upload_url_is_scoped_to_the_asset(deps):
    asset = create(deps)
    status, body = request_upload(deps, asset["assetId"], "Hero Model.PNG", 2048)
    data = body["data"]
    assert status == 200 and data["method"] == "PUT" and data["headers"] == {"Content-Type": "image/png"}
    assert data["s3Key"].startswith(f"assets/{asset['assetId']}/") and data["s3Key"].endswith("-Hero_Model.png")
    assert BUCKET in data["uploadUrl"] and "X-Amz-Signature" in data["uploadUrl"]
    assert data["expiresIn"] <= 300


def test_upload_url_sanitizes_path_tricks(deps):
    asset = create(deps)
    key = request_upload(deps, asset["assetId"], "../../etc/pass wd.wav")[1]["data"]["s3Key"]
    assert ".." not in key and key.startswith(f"assets/{asset['assetId']}/") and key.endswith("-pass_wd.wav")


@pytest.mark.parametrize(
    "payload",
    [
        {"fileName": "virus.exe", "fileSize": 10},
        {"fileName": "noextension", "fileSize": 10},
        {"fileSize": 10},
        {"fileName": "a.png"},
        {"fileName": "a.png", "fileSize": 0},
        {"fileName": "a.png", "fileSize": "10"},
        {"fileName": "a.png", "fileSize": True},
        {"fileName": "a.png", "fileSize": 100 * 1024 * 1024 + 1},
    ],
)
def test_upload_url_rejects_invalid_requests(deps, payload):
    asset = create(deps)
    status, body = call(deps, "POST", f"/assets/{asset['assetId']}/upload-url", payload)
    assert status == 400 and body["success"] is False


def test_upload_url_for_missing_asset_returns_404(deps):
    assert request_upload(deps, "ghost")[0] == 404


def test_attach_uploaded_file_exposes_download_and_preview(deps):
    asset = create(deps)
    key, saved = attach_file(deps, asset["assetId"], "hero.png")
    assert saved["s3Key"] == key and saved["fileName"] == "hero.png"
    assert saved["previewKind"] == "image" and "X-Amz-Signature" in saved["previewUrl"]
    assert "attachment" in saved["downloadUrl"] and "hero.png" in saved["downloadUrl"]
    listed = call(deps, "GET", "/assets")[1]["data"][0]
    assert listed["previewUrl"] and listed["fileName"] == "hero.png"


def test_unsupported_preview_format_is_download_only(deps):
    asset = create(deps)
    _, saved = attach_file(deps, asset["assetId"], "mesh.fbx")
    assert saved["previewUrl"] == "" and saved["previewKind"] == "" and saved["downloadUrl"]


def test_glb_is_previewable_as_a_3d_model(deps):
    asset = create(deps, assetType="Character")
    _, saved = attach_file(deps, asset["assetId"], "hero.glb")
    assert saved["previewKind"] == "model" and "X-Amz-Signature" in saved["previewUrl"]
    assert "attachment" in saved["downloadUrl"]  # still downloadable


def test_audio_is_previewable(deps):
    asset = create(deps, assetType="Audio")
    assert attach_file(deps, asset["assetId"], "theme.ogg")[1]["previewKind"] == "audio"


def test_asset_without_file_has_empty_file_fields(deps):
    asset = create(deps)
    assert (asset["fileName"], asset["downloadUrl"], asset["previewUrl"]) == ("", "", "")


def test_cannot_attach_missing_foreign_or_empty_key(deps):
    first, second = create(deps), create(deps, assetName="Other")
    path = f"/assets/{first['assetId']}"
    ghost = request_upload(deps, first["assetId"])[1]["data"]["s3Key"]  # never uploaded
    assert call(deps, "PUT", path, {"s3Key": ghost})[0] == 400
    foreign, _ = attach_file(deps, second["assetId"])
    assert call(deps, "PUT", path, {"s3Key": foreign})[0] == 400  # belongs to another asset
    assert call(deps, "PUT", path, {"s3Key": "assets/../secret.txt"})[0] == 400
    assert call(deps, "GET", path)[1]["data"]["s3Key"] == ""


def test_attach_same_key_again_is_harmless_and_cannot_clear_via_put(deps):
    asset = create(deps)
    key, _ = attach_file(deps, asset["assetId"])
    path = f"/assets/{asset['assetId']}"
    assert call(deps, "PUT", path, {"s3Key": key, "status": "Review"})[1]["data"]["status"] == "Review"
    assert call(deps, "PUT", path, {"s3Key": ""})[0] == 400
    assert object_keys(deps) == [key]


def test_create_rejects_preset_s3_key(deps):
    assert call(deps, "POST", "/assets", {"assetName": "x", "assetType": "Other", "s3Key": "assets/x/y"})[0] == 400


def test_replacing_a_file_removes_the_old_object(deps):
    asset = create(deps)
    old_key, _ = attach_file(deps, asset["assetId"], "v1.png")
    new_key, saved = attach_file(deps, asset["assetId"], "v2.png")
    assert saved["fileName"] == "v2.png" and object_keys(deps) == [new_key] and old_key != new_key


def test_delete_file_clears_key_and_object(deps):
    asset = create(deps)
    attach_file(deps, asset["assetId"])
    event = {"rawPath": f"/assets/{asset['assetId']}/file", "requestContext": {"http": {"method": "DELETE"}},
             "headers": bearer(MANAGER)}
    assert handler.handle(event, *deps, SECRET)["statusCode"] == 204
    assert object_keys(deps) == []
    assert call(deps, "GET", f"/assets/{asset['assetId']}")[1]["data"]["s3Key"] == ""
    status, body = call(deps, "DELETE", f"/assets/{asset['assetId']}/file")
    assert status == 404 and body["message"] == "Asset has no file"
    assert call(deps, "DELETE", "/assets/ghost/file")[0] == 404


def test_deleting_an_asset_removes_only_its_own_files(deps):
    first, second = create(deps), create(deps, assetName="Other")
    attach_file(deps, first["assetId"])
    orphan = request_upload(deps, first["assetId"], "orphan.png")[1]["data"]["s3Key"]
    s3_client(deps).put_object(Bucket=BUCKET, Key=orphan, Body=b"x")  # uploaded but never attached
    keep, _ = attach_file(deps, second["assetId"])
    s3_client(deps).put_object(Bucket=BUCKET, Key="unrelated/file.txt", Body=b"x")
    assert call(deps, "DELETE", f"/assets/{first['assetId']}")[0] == 204
    assert sorted(object_keys(deps)) == sorted([keep, "unrelated/file.txt"])


def test_filetype_helpers():
    key = "assets/abc/" + "a" * 32 + "-my_file.png"
    assert file_name_from_key(key) == "my_file.png"
    assert sanitize_filename("..\\..\\x y!.PNG") == "x_y.png"
    assert sanitize_filename("....") == "file"
    assert len(sanitize_filename("a" * 300 + ".png")) <= 100


# ---- folders ----
def folder(deps, name="Characters", parent="", expect=201):
    status, body = call(deps, "POST", "/folders", {"name": name, "parentId": parent})
    assert status == expect, body
    return body["data"] if status == 201 else body


def test_create_and_list_folders(deps):
    root = folder(deps, "Characters")
    child = folder(deps, "Hero", root["folderId"])
    assert root["parentId"] == "" and child["parentId"] == root["folderId"] and root["createdAt"]
    names = [f["name"] for f in call(deps, "GET", "/folders")[1]["data"]]
    assert names == ["Characters", "Hero"]
    assert call(deps, "GET", f"/folders/{root['folderId']}")[1]["data"]["name"] == "Characters"
    assert call(deps, "GET", "/folders/ghost")[0] == 404


@pytest.mark.parametrize(
    "payload",
    [{}, {"name": "  "}, {"name": 5}, {"name": "a/b"}, {"name": "a\\b"}, {"name": "x" * 61},
     {"name": "ok", "parentId": "missing"}, {"name": "ok", "parentId": 7}],
)
def test_create_folder_rejects_invalid(deps, payload):
    status, body = call(deps, "POST", "/folders", payload)
    assert status == 400 and body["success"] is False


def test_sibling_names_are_unique_case_insensitive_but_free_across_parents(deps):
    a = folder(deps, "Props")
    folder(deps, "props", expect=400)
    b = folder(deps, "Weapons")
    folder(deps, "Props", b["folderId"])  # same name under a different parent is fine
    assert a["folderId"] != b["folderId"]


def test_rename_and_move_folder(deps):
    a, b = folder(deps, "A"), folder(deps, "B")
    status, body = call(deps, "PUT", f"/folders/{a['folderId']}", {"name": "A2", "parentId": b["folderId"]})
    assert status == 200 and body["data"]["name"] == "A2" and body["data"]["parentId"] == b["folderId"]
    assert call(deps, "PUT", f"/folders/{a['folderId']}", {"parentId": ""})[1]["data"]["parentId"] == ""
    assert call(deps, "PUT", "/folders/ghost", {"name": "x"})[0] == 404
    assert call(deps, "PUT", f"/folders/{a['folderId']}", {})[0] == 400
    assert call(deps, "PUT", f"/folders/{a['folderId']}", {"name": "B"})[0] == 400  # sibling clash


def test_folder_cannot_move_into_itself_or_a_descendant(deps):
    a = folder(deps, "A")
    b = folder(deps, "B", a["folderId"])
    c = folder(deps, "C", b["folderId"])
    for target in (a["folderId"], b["folderId"], c["folderId"]):
        assert call(deps, "PUT", f"/folders/{a['folderId']}", {"parentId": target})[0] == 400
    assert call(deps, "PUT", f"/folders/{c['folderId']}", {"parentId": a["folderId"]})[0] == 200


def test_folder_depth_is_limited(deps):
    parent = ""
    for level in range(10):
        parent = folder(deps, f"L{level}", parent)["folderId"]
    folder(deps, "too deep", parent, expect=400)


def test_asset_defaults_to_root_and_can_be_placed_in_a_folder(deps):
    asset = create(deps)
    assert asset["folderId"] == ""
    target = folder(deps, "Characters")
    created = create(deps, assetName="Hero", folderId=target["folderId"])
    assert created["folderId"] == target["folderId"]
    moved = call(deps, "PUT", f"/assets/{asset['assetId']}", {"folderId": target["folderId"]})[1]["data"]
    assert moved["folderId"] == target["folderId"] and moved["assetName"] == "Main Character"
    back = call(deps, "PUT", f"/assets/{asset['assetId']}", {"folderId": ""})[1]["data"]
    assert back["folderId"] == ""


def test_asset_cannot_reference_a_missing_folder(deps):
    status, _ = call(deps, "POST", "/assets", {"assetName": "x", "assetType": "Other", "folderId": "ghost"})
    assert status == 400
    asset = create(deps)
    assert call(deps, "PUT", f"/assets/{asset['assetId']}", {"folderId": "ghost"})[0] == 400


def test_list_assets_by_folder(deps):
    target = folder(deps, "Audio")
    create(deps, assetName="loose")
    create(deps, assetName="in folder", folderId=target["folderId"])
    names = lambda q: [a["assetName"] for a in call(deps, "GET", "/assets", query=q)[1]["data"]]  # noqa: E731
    assert names({"folderId": target["folderId"]}) == ["in folder"]
    assert names({"folderId": ""}) == ["loose"]
    assert sorted(names(None)) == ["in folder", "loose"]


def test_legacy_assets_without_folder_id_appear_at_root(deps):
    deps[0]._table.put_item(Item={"assetId": "old", "assetName": "Old", "assetType": "Other",
                                  "status": "Planned", "createdAt": "2020", "updatedAt": "2020"})
    assert call(deps, "GET", "/assets/old")[1]["data"]["folderId"] == ""
    assert [a["assetId"] for a in call(deps, "GET", "/assets", query={"folderId": ""})[1]["data"]] == ["old"]


def test_only_empty_folders_can_be_deleted(deps):
    parent = folder(deps, "Parent")
    child = folder(deps, "Child", parent["folderId"])
    asset = create(deps, folderId=child["folderId"])
    path = lambda f: f"/folders/{f['folderId']}"  # noqa: E731
    assert call(deps, "DELETE", path(parent))[0] == 400  # has a subfolder
    assert call(deps, "DELETE", path(child))[0] == 400   # has an asset
    call(deps, "DELETE", f"/assets/{asset['assetId']}")
    event = {"rawPath": path(child), "requestContext": {"http": {"method": "DELETE"}},
             "headers": bearer(MANAGER)}
    assert handler.handle(event, *deps, SECRET)["statusCode"] == 204
    assert call(deps, "DELETE", path(parent))[0] == 204
    assert call(deps, "DELETE", "/folders/ghost")[0] == 404
    assert call(deps, "GET", "/folders")[1]["data"] == []


def test_health_checks_folders_table_too(deps):
    assert call(deps, "GET", "/health")[0] == 200


def test_health_reports_each_dependency_and_returns_503_when_degraded(deps):
    class Down:
        def ping(self):
            raise RuntimeError("secret internals: arn:aws:...")

    event = {"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}
    res = handler.handle(event, deps[0], Down(), deps[2], SECRET)  # bucket down, tables fine
    body = json.loads(res["body"])
    assert res["statusCode"] == 503 and body["success"] is False
    assert body["data"]["status"] == "degraded"
    assert body["data"]["checks"]["assetsTable"]["ok"] is True
    assert body["data"]["checks"]["bucket"] == {"ok": False, "ms": body["data"]["checks"]["bucket"]["ms"], "error": "RuntimeError"}
    assert "secret" not in res["body"] and "arn:" not in res["body"]  # only an error code, never details


# ---- authentication & roles ----
def test_requests_need_a_valid_token(deps):
    assert call(deps, "GET", "/assets", headers={})[0] == 401
    assert call(deps, "GET", "/folders", headers={})[0] == 401
    assert call(deps, "POST", "/assets", {"assetName": "x", "assetType": "Props"}, headers={})[0] == 401
    assert call(deps, "GET", "/assets", headers={"authorization": "Bearer a.b.c"})[0] == 401
    assert call(deps, "GET", "/health", headers={})[0] == 200  # health stays public


def test_members_can_read_create_edit_and_upload(deps):
    asset = call(deps, "POST", "/assets", {"assetName": "Rock", "assetType": "Props"}, user=MEMBER)[1]["data"]
    assert call(deps, "GET", "/assets", user=MEMBER)[0] == 200
    assert call(deps, "GET", "/folders", user=MEMBER)[0] == 200
    assert call(deps, "PUT", f"/assets/{asset['assetId']}", {"status": "Review"}, user=MEMBER)[0] == 200
    upload = call(deps, "POST", f"/assets/{asset['assetId']}/upload-url", {"fileName": "rock.png", "fileSize": 4}, user=MEMBER)
    assert upload[0] == 200


def test_members_cannot_delete_assets_or_files(deps):
    asset = create(deps)
    attach_file(deps, asset["assetId"])
    assert call(deps, "DELETE", f"/assets/{asset['assetId']}/file", user=MEMBER)[0] == 403
    assert call(deps, "DELETE", f"/assets/{asset['assetId']}", user=MEMBER)[0] == 403
    assert len(object_keys(deps)) == 1 and call(deps, "GET", f"/assets/{asset['assetId']}")[0] == 200
    assert call(deps, "DELETE", f"/assets/{asset['assetId']}", user=MANAGER)[0] == 204


def test_members_cannot_manage_folders(deps):
    root = folder(deps, "Characters")
    path = f"/folders/{root['folderId']}"
    assert call(deps, "POST", "/folders", {"name": "Nope"}, user=MEMBER)[0] == 403
    assert call(deps, "PUT", path, {"name": "Renamed"}, user=MEMBER)[0] == 403
    assert call(deps, "DELETE", path, user=MEMBER)[0] == 403
    assert call(deps, "GET", path, user=MEMBER)[1]["data"]["name"] == "Characters"
