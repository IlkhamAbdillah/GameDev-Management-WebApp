# Database Design

DynamoDB, on-demand billing, no GSIs (four tables) (Scan + in-Lambda filtering is sufficient at MVP scale).

## GameVaultAssets (Phase 1, deployed)
Partition key: `assetId` (String, UUID v4)

| Attribute | Type | Notes |
|---|---|---|
| assetId | S | server-generated |
| assetName | S | required |
| assetType | S | enum |
| description | S | |
| assignedTo | S | |
| status | S | enum, default Planned |
| folderId | S | `""` = top level; references GameVaultFolders |
| s3Key | S | empty until a file is uploaded; format `assets/{assetId}/{random}-{sanitised name}`; file bytes live in S3 |
| createdAt / updatedAt | S | UTC ISO 8601 |

Updates use a conditional expression (`attribute_exists(assetId)`) so a PUT/DELETE on a missing id returns 404 and never creates or removes unrelated data.

## GameVaultFolders (Phase 4)
Partition key: `folderId` (String, UUID v4). Attributes: `name`, `parentId` (`""` = top level), createdAt, updatedAt. A flat record per folder; the tree is built from `parentId`, depth capped at 10, sibling names unique. GameVaultAssets gains `folderId` (`""` = top level; missing on older items = top level). A folder can only be deleted when it has no subfolders and no assets, so there are no dangling references. Folders belong to the Assets module and are unrelated to Tasks.

## GameVaultTasks (Phase 2)
Partition key: `taskId` (String, UUID v4). Attributes: title, description, assignee, category, priority, status, startDate/dueDate (`YYYY-MM-DD`, empty string when unset), createdAt, updatedAt (UTC ISO 8601). Same conditional-write rules as assets.

## GameVaultUsers (Phase 6, authentication)
Partition key: `userId` (String, UUID v4). Attributes: `name`, `email` (lower-cased, unique; looked up with a Scan, so two simultaneous creates of the same email could in theory both succeed), `role` (`project_manager` | `member`), `passwordHash` (`scrypt$N$r$p$salt$hash`, never returned by the API), createdAt, updatedAt. The first project manager is written by `scripts/seed_admin.py`; there is no public registration. Roles are global (one project per deployment).

Tasks gain `assigneeId` (a `userId`, `""` for unassigned or a free-text assignee). `assignee` stays as the display name, so renaming an account does not rewrite old tasks, and deleting an account leaves its tasks with a dangling `assigneeId` (shown as unlinked). Members may only edit tasks whose `assigneeId` is their own `userId`.

## Rules
- Assets and Tasks are independent: no `assetId` in tasks, no foreign keys.
- Timeline has no table; it is derived from Task records.
- Users are referenced by Tasks only through `assigneeId` (no enforced foreign key).
