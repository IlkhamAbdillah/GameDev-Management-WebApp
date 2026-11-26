"""scripts/seed_data.py: planning from sample-assets/ and the idempotent API call sequence (fake API, no AWS)."""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "seed_data.py"


@pytest.fixture(scope="module")
def seed():
    for name in ("filetypes",):
        sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location("seed_data_under_test", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    yield module
    sys.modules.pop("filetypes", None)


@pytest.fixture
def sample_dir(tmp_path):
    files = {
        "models/furniture/student_chair.glb": b"g" * 10,
        "models/genshin_impact_-_hero.glb": b"g" * 10,
        "audio/Theme  Song.mp3": b"m" * 5,
        "audio/Theme  Song.mp3:Zone.Identifier": b"zone",
        "video/trailer.mp4": b"v",
        "models/.gitkeep": b"",
        "README.md": b"# docs",
    }
    for rel, content in files.items():
        path = tmp_path / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    (tmp_path / "seed.json").write_text(json.dumps({"models/genshin_impact_-_hero.glb": {"assetType": "Character"}}))
    return tmp_path


def test_plan_maps_folders_names_types_and_skips(seed, sample_dir):
    overrides = json.loads((sample_dir / "seed.json").read_text())
    assets, skipped = seed.plan_assets(sample_dir, overrides)
    by_rel = {a["rel"]: a for a in assets}
    assert set(by_rel) == {"audio/Theme  Song.mp3", "models/furniture/student_chair.glb", "models/genshin_impact_-_hero.glb"}
    assert by_rel["models/furniture/student_chair.glb"]["folders"] == ["Models", "Furniture"]
    assert by_rel["models/furniture/student_chair.glb"]["assetName"] == "Student Chair"
    assert by_rel["models/furniture/student_chair.glb"]["assetType"] == "Props"
    assert by_rel["models/genshin_impact_-_hero.glb"]["assetName"] == "Genshin Impact - Hero"
    assert by_rel["models/genshin_impact_-_hero.glb"]["assetType"] == "Character"  # seed.json override
    assert by_rel["audio/Theme  Song.mp3"]["assetName"] == "Theme Song"
    assert skipped == [("video/trailer.mp4", "extension not allowed by the app")]


def test_plan_skips_files_over_the_upload_limit(seed, sample_dir):
    assets, skipped = seed.plan_assets(sample_dir, {}, max_bytes=8)
    assert {a["rel"] for a in assets} == {"audio/Theme  Song.mp3"}
    assert ("models/furniture/student_chair.glb", "larger than 0 MB") in skipped


class FakeApi:
    """Mimics the GameVault API closely enough for the seeding logic: stores folders/assets/tasks in lists."""

    asset, task, auth = "https://asset", "https://task", "https://auth"

    def __init__(self):
        self.folders, self.assets, self.tasks, self.calls = [], [], [], []

    def call(self, method, url, body=None):
        self.calls.append((method, url, body))
        if (method, url) == ("GET", f"{self.asset}/folders"):
            return list(self.folders)
        if (method, url) == ("GET", f"{self.asset}/assets"):
            return list(self.assets)
        if (method, url) == ("GET", f"{self.task}/tasks"):
            return list(self.tasks)
        if (method, url) == ("POST", f"{self.asset}/folders"):
            folder = {**body, "folderId": f"f{len(self.folders)}"}
            self.folders.append(folder)
            return folder
        if (method, url) == ("POST", f"{self.asset}/assets"):
            asset = {**body, "assetId": f"a{len(self.assets)}"}
            self.assets.append(asset)
            return asset
        if method == "POST" and url.endswith("/upload-url"):
            asset_id = url.split("/")[-2]
            return {"uploadUrl": "https://s3/put", "method": "PUT", "headers": {}, "s3Key": f"assets/{asset_id}/x-{body['fileName']}"}
        if method == "PUT" and url.startswith(f"{self.asset}/assets/"):
            asset = next(a for a in self.assets if a["assetId"] == url.rsplit("/", 1)[-1])
            asset.update(body)
            return asset
        if (method, url) == ("POST", f"{self.task}/tasks"):
            self.tasks.append(body)
            return body
        raise AssertionError(f"unexpected call {method} {url}")


PEOPLE = [{"name": "Member 1", "userId": "u1"}, {"name": "Member 2", "userId": "u2"}]


def test_seed_assets_creates_folders_uploads_and_is_idempotent(seed, sample_dir, monkeypatch):
    uploaded = []
    monkeypatch.setattr(seed, "put_file", lambda upload, path: uploaded.append(path.name))
    api = FakeApi()

    assert seed.seed_assets(api, sample_dir, PEOPLE, dry_run=False) == 3
    names = {(f["parentId"], f["name"]) for f in api.folders}
    assert names == {("", "Audio"), ("", "Models"), ("f1", "Furniture")}
    chair = next(a for a in api.assets if a["assetName"] == "Student Chair")
    furniture = next(f for f in api.folders if f["name"] == "Furniture")
    assert chair["folderId"] == furniture["folderId"]
    assert chair["s3Key"].startswith(f"assets/{chair['assetId']}/")
    assert all(a.get("s3Key") for a in api.assets)
    assert sorted(uploaded) == sorted(["student_chair.glb", "genshin_impact_-_hero.glb", "Theme  Song.mp3"])
    assert {a["assignedTo"] for a in api.assets} <= {"Member 1", "Member 2"}

    # second run: nothing new
    assert seed.seed_assets(api, sample_dir, PEOPLE, dry_run=False) == 0
    assert len(api.folders) == 3 and len(api.assets) == 3 and len(uploaded) == 3


def test_seed_assets_dry_run_changes_nothing(seed, sample_dir, monkeypatch):
    monkeypatch.setattr(seed, "put_file", lambda *a: pytest.fail("dry run must not upload"))
    api = FakeApi()
    assert seed.seed_assets(api, sample_dir, PEOPLE, dry_run=True) == 3
    assert not api.folders and not api.assets
    assert all(method == "GET" for method, _, _ in api.calls)


def test_seed_tasks_dates_assignees_and_idempotency(seed):
    api = FakeApi()
    assert seed.seed_tasks(api, PEOPLE, dry_run=False) == len(seed.TASKS)
    for task in api.tasks:
        assert task["assigneeId"] in {"u1", "u2"} and task["assignee"] in {"Member 1", "Member 2"}
        if task["startDate"] and task["dueDate"]:
            assert task["startDate"] <= task["dueDate"]
    assert sum(1 for t in api.tasks if not t["startDate"] and not t["dueDate"]) == 2  # unscheduled demo tasks
    assert seed.seed_tasks(api, PEOPLE, dry_run=False) == 0
