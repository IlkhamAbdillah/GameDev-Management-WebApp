"""Allowed asset file types, filename sanitising and key helpers. Pure functions."""
import os
import re

# extension -> (content type, preview kind). "image"/"audio" render natively; "model" (.glb only,
# a single self-contained file) renders with <model-viewer>. Everything else (fbx, obj, gltf with
# external files...) is download-only.
ALLOWED_TYPES = {
    # 3D models
    ".fbx": ("application/octet-stream", None),
    ".obj": ("text/plain", None),
    ".glb": ("model/gltf-binary", "model"),
    ".gltf": ("model/gltf+json", None),
    # images
    ".png": ("image/png", "image"),
    ".jpg": ("image/jpeg", "image"),
    ".jpeg": ("image/jpeg", "image"),
    ".webp": ("image/webp", "image"),
    # audio
    ".wav": ("audio/wav", "audio"),
    ".mp3": ("audio/mpeg", "audio"),
    ".ogg": ("audio/ogg", "audio"),
    # animation and other supporting files
    ".anim": ("application/octet-stream", None),
    ".bvh": ("text/plain", None),
    ".blend": ("application/octet-stream", None),
    ".zip": ("application/zip", None),
    ".json": ("application/json", None),
}

DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024
MAX_FILENAME_LENGTH = 100
_KEY_PREFIX_RE = re.compile(r"^[0-9a-f]{32}-")


def extension_of(file_name):
    return os.path.splitext(file_name)[1].lower()


def sanitize_filename(file_name):
    """Strip any path, keep [A-Za-z0-9._-], and cap the length while keeping the extension."""
    base = re.split(r"[\\\\/]", file_name.strip())[-1]
    stem, ext = os.path.splitext(base)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._") or "file"
    ext = re.sub(r"[^A-Za-z0-9.]", "", ext).lower()
    return stem[: MAX_FILENAME_LENGTH - len(ext)] + ext


def preview_kind(file_name):
    """'image', 'audio', 'model' or None (download-only)."""
    return ALLOWED_TYPES.get(extension_of(file_name), (None, None))[1]


def asset_prefix(asset_id):
    return f"assets/{asset_id}/"


def file_name_from_key(key):
    """Human filename from an S3 key: assets/<id>/<32 hex>-<name> -> <name>."""
    return _KEY_PREFIX_RE.sub("", key.rsplit("/", 1)[-1])
