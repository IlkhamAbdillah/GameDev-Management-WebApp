#!/usr/bin/env python3
"""Fill a deployment with demo content: folders + assets (files uploaded to S3) from sample-assets/, and tasks.

Usage:  .venv/bin/python scripts/seed_data.py [--email admin@gamevault.dev] [--dir sample-assets] [--dry-run]

Everything goes through the public API as a project manager (URLs from .aws/outputs.json), exactly
like the app: POST /folders, POST /assets, POST /assets/{id}/upload-url, PUT to the pre-signed S3 URL,
PUT /assets/{id} {s3Key}, POST /tasks. So no AWS credentials are needed, only the manager's password
(GV_ADMIN_PASSWORD, or prompted without echo).

Idempotent: folders are reused by name + parent, an asset is skipped when one with the same name exists
in the same folder, a task when one with the same title exists. Re-running only adds what is missing.

sample-assets/ layout -> app:
  every directory becomes a folder (models/furniture -> "Models" / "Furniture"); every file with an
  allowed extension becomes an asset named after the file. The asset type comes from the top-level
  directory (see TYPE_BY_DIR) and can be overridden per file, together with description/status,
  in sample-assets/seed.json: {"models/hero.glb": {"assetType": "Character", "description": "..."}}.
"""
import argparse
import datetime as dt
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend" / "asset-handler")]

from filetypes import ALLOWED_TYPES, DEFAULT_MAX_UPLOAD_BYTES, extension_of  # noqa: E402

TYPE_BY_DIR = {
    "models": "Props", "ui": "UI", "art": "Environment", "audio": "Audio",
    "animations": "Animation", "vfx": "VFX", "characters": "Character",
}
FOLDER_LABELS = {"ui": "UI", "vfx": "VFX"}
STATUS_CYCLE = ("Completed", "In Progress", "Review", "Planned")
SKIP_NAMES = {"README.md", "seed.json"}

TASKS = [  # (title, category, priority, status, start offset, due offset (days from today) or None)
    ("Set up the project repository and CI", "Programming", "High", "Done", -21, -16),
    ("Write the game design document", "Design", "High", "Done", -20, -12),
    ("Block out the classroom level", "Design", "Medium", "Done", -14, -7),
    ("Model classroom furniture", "Art", "Medium", "In Review", -10, -1),
    ("Character model: rigging and materials", "Art", "High", "In Progress", -7, 3),
    ("Main menu and HUD layout", "Design", "Medium", "In Progress", -5, 2),
    ("Implement dialogue system", "Programming", "Critical", "In Progress", -6, -2),
    ("Import and loop the background music", "Audio", "Low", "To Do", 1, 6),
    ("Player movement and camera", "Programming", "High", "To Do", 2, 12),
    ("Save / load system", "Programming", "Medium", "To Do", 8, 20),
    ("Playtest round 1", "Testing", "High", "To Do", 14, 16),
    ("Write the player controls page", "Documentation", "Low", "To Do", None, None),
    ("Collect feedback ideas for the next sprint", "Other", "Low", "To Do", None, None),
]


class Api:
    def __init__(self, outputs):
        self.asset, self.task, self.auth = outputs["assetApiUrl"], outputs["taskApiUrl"], outputs["authApiUrl"]
        self.token = None

    def call(self, method, url, body=None):
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = response.read()
        except urllib.error.HTTPError as err:
            message = (json.loads(err.read() or b"{}") or {}).get("message", err.reason)
            raise SystemExit(f"{method} {url.split('.on.aws')[-1]} -> HTTP {err.code}: {message}") from None
        return json.loads(payload)["data"] if payload else None

    def login(self, email, password):
        result = self.call("POST", f"{self.auth}/auth/login", {"email": email, "password": password})
        if result["user"]["role"] != "project_manager":
            raise SystemExit(f"{email} is not a project manager (folders and task dates need one)")
        self.token = result["token"]
        return result["user"]


def put_file(upload, path):
    """PUT the bytes to the pre-signed S3 URL with exactly the signed headers (no bearer token)."""
    request = urllib.request.Request(upload["uploadUrl"], data=path.read_bytes(), method=upload["method"],
                                     headers=upload.get("headers", {}))
    try:
        with urllib.request.urlopen(request, timeout=300):
            pass
    except urllib.error.HTTPError as err:
        raise SystemExit(f"S3 upload of {path.name} failed: HTTP {err.code}") from None


def asset_label(stem):
    """'genshin_impact_-_furina' -> 'Genshin Impact - Furina'; other names only get spaces collapsed."""
    label = " ".join(stem.replace("_", " ").split())
    if stem == stem.lower() and "_" in stem:
        label = label.title()
    return label[:100] or "Untitled"


def folder_label(name):
    return FOLDER_LABELS.get(name.lower(), name.replace("_", " ").replace("-", " ").title())[:60]


def plan_assets(base, overrides, max_bytes=DEFAULT_MAX_UPLOAD_BYTES):
    """Walk sample-assets/ -> (assets, skipped). Pure apart from reading the directory; used by tests."""
    assets, skipped = [], []
    for path in sorted(p for p in base.rglob("*") if p.is_file()):
        rel = path.relative_to(base)
        if any(part.startswith(".") for part in rel.parts) or path.name in SKIP_NAMES or ":" in path.name:
            continue  # .gitkeep, docs, Windows Zone.Identifier copies
        if extension_of(path.name) not in ALLOWED_TYPES:
            skipped.append((rel.as_posix(), "extension not allowed by the app"))
            continue
        if path.stat().st_size > max_bytes:
            skipped.append((rel.as_posix(), f"larger than {max_bytes // (1024 * 1024)} MB"))
            continue
        top = rel.parts[0].lower() if len(rel.parts) > 1 else ""
        item = {
            "path": path,
            "rel": rel.as_posix(),
            "folders": [folder_label(part) for part in rel.parts[:-1]],
            "assetName": asset_label(path.stem),
            "assetType": TYPE_BY_DIR.get(top, "Other"),
            "description": f"Sample file {rel.as_posix()}"[:1000],
            "status": STATUS_CYCLE[len(assets) % len(STATUS_CYCLE)],
        }
        item.update({k: v for k, v in overrides.get(rel.as_posix(), {}).items()
                     if k in ("assetName", "assetType", "description", "status")})
        assets.append(item)
    return assets, skipped


def seed_assets(api, base, people, dry_run):
    overrides_file = base / "seed.json"
    overrides = json.loads(overrides_file.read_text()) if overrides_file.exists() else {}
    assets, skipped = plan_assets(base, overrides)
    for rel, reason in skipped:
        print(f"  skip  {rel}  ({reason})")

    folders = {(f["parentId"], f["name"].lower()): f["folderId"] for f in api.call("GET", f"{api.asset}/folders")}
    existing = {(a.get("folderId", ""), a["assetName"].lower()) for a in api.call("GET", f"{api.asset}/assets")}

    def folder_id(chain):
        parent = ""
        for depth, name in enumerate(chain, 1):
            key = (parent, name.lower())
            if key not in folders:
                if dry_run:
                    folders[key] = f"<new {name}>"
                else:
                    folders[key] = api.call("POST", f"{api.asset}/folders", {"name": name, "parentId": parent})["folderId"]
                print(f"  folder {'/'.join(chain[:depth])}")
            parent = folders[key]
        return parent

    added = 0
    for index, item in enumerate(assets):
        fid = folder_id(item["folders"])
        if (fid, item["assetName"].lower()) in existing:
            print(f"  exists {item['rel']}")
            continue
        size = item["path"].stat().st_size
        print(f"  asset  {item['rel']}  ({size / 1024 / 1024:.1f} MB)")
        added += 1
        if dry_run:
            continue
        asset = api.call("POST", f"{api.asset}/assets", {
            "assetName": item["assetName"], "assetType": item["assetType"], "status": item["status"],
            "description": item["description"], "assignedTo": people[index % len(people)]["name"] if people else "",
            "folderId": fid,
        })
        upload = api.call("POST", f"{api.asset}/assets/{asset['assetId']}/upload-url",
                          {"fileName": item["path"].name, "fileSize": size})
        put_file(upload, item["path"])
        api.call("PUT", f"{api.asset}/assets/{asset['assetId']}", {"s3Key": upload["s3Key"]})
    return added


def seed_tasks(api, people, dry_run):
    existing = {t["title"].lower() for t in api.call("GET", f"{api.task}/tasks")}
    today = dt.date.today()
    added = 0
    for index, (title, category, priority, status, start, due) in enumerate(TASKS):
        if title.lower() in existing:
            print(f"  exists {title}")
            continue
        person = people[index % len(people)] if people else None
        body = {
            "title": title, "category": category, "priority": priority, "status": status,
            "description": "Demo task created by scripts/seed_data.py.",
            "startDate": (today + dt.timedelta(days=start)).isoformat() if start is not None else "",
            "dueDate": (today + dt.timedelta(days=due)).isoformat() if due is not None else "",
            "assignee": person["name"] if person else "", "assigneeId": person["userId"] if person else "",
        }
        print(f"  task   {title}  [{status}{', ' + person['name'] if person else ''}]")
        added += 1
        if not dry_run:
            api.call("POST", f"{api.task}/tasks", body)
    return added


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--email", default=os.environ.get("GV_ADMIN_EMAIL", "admin@gamevault.dev"))
    parser.add_argument("--dir", default=str(ROOT / "sample-assets"))
    parser.add_argument("--no-assets", action="store_true")
    parser.add_argument("--no-tasks", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="show what would be created, change nothing")
    args = parser.parse_args()

    outputs_file = ROOT / ".aws" / "outputs.json"
    if not outputs_file.exists():
        sys.exit(".aws/outputs.json missing: deploy first (scripts/deploy.py)")
    api = Api(json.loads(outputs_file.read_text()))
    password = os.environ.get("GV_ADMIN_PASSWORD") or getpass.getpass(f"Password for {args.email}: ")
    me = api.login(args.email, password)
    print(f"signed in as {me['email']} ({me['role']})")

    users = api.call("GET", f"{api.auth}/users")
    members = [u for u in users if u["role"] == "member"]
    people = sorted(members or users, key=lambda u: u["name"].lower())  # assignees rotate over members

    base = Path(args.dir)
    assets_added = tasks_added = 0
    if not args.no_assets:
        if base.is_dir():
            print(f"assets from {base}:")
            assets_added = seed_assets(api, base, people, args.dry_run)
        else:
            print(f"no {base} directory: no assets seeded")
    if not args.no_tasks:
        print("tasks:")
        tasks_added = seed_tasks(api, people, args.dry_run)
    verb = "would add" if args.dry_run else "added"
    print(f"done: {verb} {assets_added} asset(s) and {tasks_added} task(s)")


if __name__ == "__main__":
    main()
