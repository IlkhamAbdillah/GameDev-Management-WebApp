# Sample assets

Example game files for trying out the **Assets** page (upload, preview, download). They are not
used by the code or the build: upload them through the app, which stores them in S3.

| Folder        | Put here                         | Accepted by the app (allow-list in `backend/asset-handler/filetypes.py`) |
|---------------|----------------------------------|--------------------------------------------------------------------------|
| `models/`     | 3D models                        | `.glb` (3D preview), `.fbx` `.obj` `.gltf` `.blend` (download only)      |
| `ui/`         | UI sprites, icons, HUD mock-ups  | `.png` `.jpg` `.jpeg` `.webp` (image preview)                            |
| `art/`        | concept art, textures, sprites   | `.png` `.jpg` `.jpeg` `.webp` (image preview)                            |
| `audio/`      | music, SFX, voice                | `.wav` `.mp3` `.ogg` (audio player)                                      |
| `animations/` | animation clips, mocap           | `.anim` `.bvh` (download only)                                           |
| `video/`      | trailers, cutscenes              | **not accepted yet**: no video type is on the allow-list                 |
| `misc/`       | bundles, data, anything else     | `.zip` `.json` (download only)                                           |

Limits: at most 100 MB per file (`MAX_UPLOAD_BYTES`). Other extensions are rejected on upload.

Git notes: `.zip` files are ignored by the root `.gitignore`, so they will not be committed.
GitHub refuses files over 100 MB and large binaries make every clone slower: keep the samples small
or use Git LFS.
