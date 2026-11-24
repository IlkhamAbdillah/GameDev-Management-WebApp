"""Folder tree rules (pure functions over a flat list of folder dicts)."""

MAX_DEPTH = 10  # root-level folders have depth 1


def _by_id(folders):
    return {f["folderId"]: f for f in folders}


def depth_of(folders, folder_id):
    """Depth of a folder (root-level = 1); 0 for the root (empty id)."""
    by_id, depth, seen = _by_id(folders), 0, set()
    while folder_id and folder_id not in seen:
        seen.add(folder_id)
        depth += 1
        folder_id = by_id.get(folder_id, {}).get("parentId", "")
    return depth


def height_of(folders, folder_id):
    """Number of levels in the subtree rooted at folder_id (a leaf = 1)."""
    children = [f["folderId"] for f in folders if f.get("parentId", "") == folder_id]
    return 1 + max((height_of(folders, c) for c in children), default=0)


def is_self_or_descendant(folders, folder_id, candidate_id):
    """True if candidate_id is folder_id itself or lies anywhere below it."""
    by_id, seen = _by_id(folders), set()
    while candidate_id and candidate_id not in seen:
        if candidate_id == folder_id:
            return True
        seen.add(candidate_id)
        candidate_id = by_id.get(candidate_id, {}).get("parentId", "")
    return False


def name_taken(folders, parent_id, name, ignore_id=None):
    """Sibling names must be unique, case-insensitively."""
    wanted = name.casefold()
    return any(
        f.get("parentId", "") == parent_id
        and f["folderId"] != ignore_id
        and f["name"].casefold() == wanted
        for f in folders
    )
