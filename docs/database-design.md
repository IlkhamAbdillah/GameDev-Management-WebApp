# Database Design

DynamoDB, on-demand billing, no GSIs (Scan + in-Lambda filtering is sufficient at MVP scale).

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
| s3Key | S | empty until a file is uploaded; file bytes live in S3 |
| createdAt / updatedAt | S | UTC ISO 8601 |

Updates use a conditional expression (`attribute_exists(assetId)`) so a PUT/DELETE on a missing id returns 404 and never creates or removes unrelated data.

## GameVaultTasks (Phase 2, planned)
Partition key: `taskId`. Attributes: title, description, assignee, category, priority, status, startDate/dueDate (`YYYY-MM-DD`), createdAt, updatedAt.

## Rules
- Assets and Tasks are independent: no `assetId` in tasks, no foreign keys.
- Timeline has no table; it is derived from Task records.
