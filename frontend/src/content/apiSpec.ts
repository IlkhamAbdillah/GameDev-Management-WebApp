// Single source of truth for the API reference shown on /docs.
// Keep in sync with docs/api-documentation.md and the Lambda handlers.

export type ApiName = 'asset' | 'task' | 'auth'
export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface Endpoint {
  method: Method
  path: string
  api: ApiName
  summary: string
  status: string // success status code
  errors?: string
  query?: string[]
  body?: string
  response?: string
}

export interface EndpointGroup {
  id: string
  title: string
  description: string
  endpoints: Endpoint[]
}

export const API_NAMES: Record<ApiName, { label: string; env: string; lambda: string }> = {
  asset: { label: 'Asset API', env: 'VITE_ASSET_API_URL', lambda: 'GameVaultAssetHandler' },
  task: { label: 'Task API', env: 'VITE_TASK_API_URL', lambda: 'GameVaultTaskHandler' },
  auth: { label: 'Auth API', env: 'VITE_AUTH_API_URL', lambda: 'GameVaultAuthHandler' },
}

const assetExample = `{
  "assetId": "8f0c…",
  "assetName": "Main Character",
  "assetType": "Character",
  "description": "Hero model",
  "assignedTo": "Rina",
  "status": "Planned",
  "folderId": "",
  "s3Key": "assets/8f0c…/3b1e…-hero.glb",
  "createdAt": "2026-11-24T01:29:48.260416Z",
  "updatedAt": "2026-11-24T01:29:48.260416Z",
  "fileName": "hero.glb",
  "downloadUrl": "https://…(pre-signed, ~15 min)",
  "previewUrl": "https://…(pre-signed, ~15 min)",
  "previewKind": "model"
}`

const taskExample = `{
  "taskId": "511a…",
  "title": "Build player controller",
  "description": "",
  "assignee": "Rina",
  "assigneeId": "c2d1…",
  "category": "Programming",
  "priority": "High",
  "status": "To Do",
  "startDate": "2026-11-25",
  "dueDate": "2026-12-05",
  "createdAt": "2026-11-24T01:57:44.981839Z",
  "updatedAt": "2026-11-24T01:57:44.981839Z"
}`

const userExample = `{
  "userId": "c2d1…",
  "name": "Rina",
  "email": "rina@example.com",
  "role": "member",
  "createdAt": "2026-11-24T01:29:48.260416Z",
  "updatedAt": "2026-11-24T01:29:48.260416Z"
}`

export const API_GROUPS: EndpointGroup[] = [
  {
    id: 'auth',
    title: 'Authentication',
    description: 'Sign in with email and password to get a bearer token (HS256 JWT, 8 hours) and send it as "Authorization: Bearer <token>" to every other route. Roles: project_manager and member. Missing/invalid/expired token → 401; a role that may not do the action → 403. The password hash is never returned. There is no public registration: the first project manager is created by scripts/seed_admin.py, the rest by a project manager.',
    endpoints: [
      {
        method: 'POST', path: '/auth/login', api: 'auth', status: '200', errors: '400, 401',
        summary: 'Public. Wrong password and unknown email give the same 401 message',
        body: `{ "email": "rina@example.com", "password": "…" }`,
        response: `{ "success": true, "data": { "token": "eyJ…", "expiresAt": 1795000000, "user": ${'{ … }'} } }`,
      },
      { method: 'GET', path: '/auth/me', api: 'auth', status: '200', errors: '401', summary: 'The signed-in account (401 if it was deleted after the token was issued)', response: userExample },
      {
        method: 'POST', path: '/auth/password', api: 'auth', status: '204', errors: '400, 401',
        summary: 'Change your own password',
        body: `{ "currentPassword": "…", "newPassword": "at least 8 characters" }`,
      },
    ],
  },
  {
    id: 'users',
    title: 'Users (project manager only)',
    description: 'Accounts in DynamoDB (GameVaultUsers). Emails are unique (case-insensitive) and cannot be changed. A project manager is permanent: the role cannot be changed to member (400). You cannot delete your own account.',
    endpoints: [
      {
        method: 'POST', path: '/users', api: 'auth', status: '201', errors: '400, 403',
        summary: 'Create an account (all four fields are required; password 8-128 characters)',
        body: `{ "name": "Rina", "email": "rina@example.com", "password": "…", "role": "member" }`,
        response: userExample,
      },
      { method: 'GET', path: '/users', api: 'auth', status: '200', errors: '403', summary: 'All accounts, sorted by name' },
      {
        method: 'PUT', path: '/users/{userId}', api: 'auth', status: '200', errors: '400, 403, 404',
        summary: 'Change name, promote a member to project manager and/or reset the password (a project manager cannot become a member)',
        body: `{ "role": "project_manager" }`,
      },
      { method: 'DELETE', path: '/users/{userId}', api: 'auth', status: '204', errors: '400, 403, 404', summary: 'Delete an account (its token keeps working until it expires)' },
    ],
  },
  {
    id: 'health',
    title: 'Health',
    description: 'The only public routes besides login. Each API reports every dependency separately, with latency. 200 when all are reachable, 503 (status "degraded") otherwise. Only an AWS error code is returned on failure, never internals. Used by the Connectivity page.',
    endpoints: [
      {
        method: 'GET', path: '/health', api: 'auth', status: '200', errors: '503',
        summary: 'Lambda → DynamoDB (users)',
        response: `{ "success": true, "data": { "status": "ok", "checks": { "usersTable": { "ok": true, "ms": 120 } } } }`,
      },
      {
        method: 'GET', path: '/health', api: 'asset', status: '200', errors: '503',
        summary: 'Lambda → DynamoDB (assets, folders) and S3 bucket',
        response: `{ "success": true, "data": { "status": "ok", "checks": {
  "assetsTable":  { "ok": true, "ms": 166 },
  "foldersTable": { "ok": true, "ms": 104 },
  "bucket":       { "ok": true, "ms": 100 } } } }`,
      },
      {
        method: 'GET', path: '/health', api: 'task', status: '200', errors: '503',
        summary: 'Lambda → DynamoDB (tasks)',
        response: `{ "success": true, "data": { "status": "ok", "checks": { "tasksTable": { "ok": true, "ms": 148 } } } }`,
      },
    ],
  },
  {
    id: 'assets',
    title: 'Assets',
    description: 'Game asset metadata in DynamoDB (GameVaultAssets). Responses add computed, short-lived file fields (fileName, downloadUrl, previewUrl, previewKind) that are never stored.',
    endpoints: [
      {
        method: 'POST', path: '/assets', api: 'asset', status: '201', errors: '400',
        summary: 'Create an asset (assetName and assetType are required)',
        body: `{ "assetName": "Main Character", "assetType": "Character", "description": "Hero model",
  "assignedTo": "Rina", "status": "Planned", "folderId": "" }`,
        response: assetExample,
      },
      {
        method: 'GET', path: '/assets', api: 'asset', status: '200',
        summary: 'List assets, newest first',
        query: ['search: name contains (case-insensitive)', 'assetType: Character | Environment | Props | Animation | Audio | UI | VFX | Other', 'status: Planned | In Progress | Review | Completed', 'folderId: a folder id, or empty for the top level'],
      },
      { method: 'GET', path: '/assets/{assetId}', api: 'asset', status: '200', errors: '404', summary: 'Asset details', response: assetExample },
      {
        method: 'PUT', path: '/assets/{assetId}', api: 'asset', status: '200', errors: '400, 404',
        summary: 'Partial update of the supplied fields (also moves it to another folder, or attaches an uploaded file via s3Key)',
        body: `{ "status": "Review", "folderId": "<folderId>" }`,
      },
      { method: 'DELETE', path: '/assets/{assetId}', api: 'asset', status: '204', errors: '404', summary: 'Delete the asset and every file stored under its own S3 prefix (project manager only)' },
    ],
  },
  {
    id: 'files',
    title: 'Asset files (S3)',
    description: 'Files travel straight between the browser and S3 through short-lived pre-signed URLs; the Lambda never handles file bytes. Allowed: .fbx .obj .glb .gltf .png .jpg .jpeg .webp .wav .mp3 .ogg .anim .bvh .blend .zip .json, up to 100 MB. Content-Type and size are signed, so S3 rejects anything different.',
    endpoints: [
      {
        method: 'POST', path: '/assets/{assetId}/upload-url', api: 'asset', status: '200', errors: '400, 404',
        summary: '1. Get a pre-signed PUT URL (valid 5 minutes). 2. PUT the file to it with the returned headers. 3. Save the key with PUT /assets/{assetId} {"s3Key": …}',
        body: `{ "fileName": "hero.glb", "fileSize": 2048 }`,
        response: `{ "success": true, "data": {
  "uploadUrl": "https://…", "method": "PUT",
  "headers": { "Content-Type": "model/gltf-binary" },
  "s3Key": "assets/<assetId>/<random>-hero.glb", "expiresIn": 300 } }`,
      },
      { method: 'DELETE', path: '/assets/{assetId}/file', api: 'asset', status: '204', errors: '403, 404', summary: 'Delete the asset’s file from S3 and clear s3Key (404 if it has no file; project manager only)' },
    ],
  },
  {
    id: 'folders',
    title: 'Folders',
    description: 'Everyone signed in can read folders; creating, renaming and deleting them is project manager only (403 otherwise). Nested folders (max 10 levels) in DynamoDB (GameVaultFolders). Sibling names are unique (case-insensitive); a folder cannot move into itself or a descendant; only empty folders can be deleted.',
    endpoints: [
      { method: 'POST', path: '/folders', api: 'asset', status: '201', errors: '400', summary: 'Create a folder (parentId empty = top level)', body: `{ "name": "Hero", "parentId": "<parentFolderId or empty>" }` },
      { method: 'GET', path: '/folders', api: 'asset', status: '200', summary: 'All folders, flat and sorted by name (the tree is built from parentId)' },
      { method: 'GET', path: '/folders/{folderId}', api: 'asset', status: '200', errors: '404', summary: 'Folder details' },
      { method: 'PUT', path: '/folders/{folderId}', api: 'asset', status: '200', errors: '400, 404', summary: 'Rename and/or move', body: `{ "name": "Hero v2", "parentId": "<folderId or empty>" }` },
      { method: 'DELETE', path: '/folders/{folderId}', api: 'asset', status: '204', errors: '400, 404', summary: 'Delete an empty folder (400 if it has subfolders or assets)' },
    ],
  },
  {
    id: 'tasks',
    title: 'Tasks',
    description: 'Development tasks in DynamoDB (GameVaultTasks). Project managers can do everything. Members can read all tasks, create tasks (automatically assigned to them) and edit title, description, category, priority and status of tasks assigned to them (assigneeId = their account); dates and assignees are manager-only and delete is manager-only (403). A free-text assignee change clears assigneeId. Tasks are independent of assets: no foreign keys. Dates are YYYY-MM-DD and dueDate must not be before startDate.',
    endpoints: [
      {
        method: 'POST', path: '/tasks', api: 'task', status: '201', errors: '400, 403',
        summary: 'Create a task (title is required; defaults: status To Do, priority Medium, category Other)',
        body: `{ "title": "Build player controller", "assignee": "Rina", "assigneeId": "<userId>", "category": "Programming",
  "priority": "High", "status": "To Do", "startDate": "2026-11-25", "dueDate": "2026-12-05" }`,
        response: taskExample,
      },
      {
        method: 'GET', path: '/tasks', api: 'task', status: '200',
        summary: 'List tasks, sorted by due date (undated last)',
        query: ['search: title contains (case-insensitive)', 'status: To Do | In Progress | In Review | Done', 'priority: Low | Medium | High | Critical', 'category: Programming | Art | Design | Audio | Testing | Documentation | Other', 'assignee: exact match'],
      },
      { method: 'GET', path: '/tasks/{taskId}', api: 'task', status: '200', errors: '404', summary: 'Task details', response: taskExample },
      { method: 'PUT', path: '/tasks/{taskId}', api: 'task', status: '200', errors: '400, 403, 404', summary: 'Partial update; also how the Kanban board changes status', body: `{ "status": "In Progress" }` },
      { method: 'DELETE', path: '/tasks/{taskId}', api: 'task', status: '204', errors: '403, 404', summary: 'Delete a task (project manager only)' },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline',
    description: 'Derived entirely from task records, so there is no Timeline table: edits to tasks show up on the next request. A task with one date is a one-day bar; tasks with no dates are not drawn but are counted in stats.unscheduled. stats are overall (not limited by the date window).',
    endpoints: [
      {
        method: 'GET', path: '/timeline', api: 'task', status: '200', errors: '400',
        summary: 'Tasks overlapping a date window, plus completion statistics',
        query: ['startDate, endDate: YYYY-MM-DD; returns tasks whose bar overlaps the window', 'status, category, assignee: filters'],
        response: `{ "success": true, "data": {
  "tasks": [ { "taskId": "…", "title": "Enemy AI", "assignee": "Rina", "category": "Programming",
               "priority": "High", "status": "In Progress", "startDate": "2026-11-22",
               "dueDate": "2026-11-27", "start": "2026-11-22", "end": "2026-11-27" } ],
  "stats": { "total": 6, "done": 1, "completionRate": 17,
             "byStatus": { "To Do": 3, "In Progress": 1, "In Review": 1, "Done": 1 },
             "overdue": 1, "dueSoon": 1, "unscheduled": 0 } } }`,
      },
    ],
  },
]

export const RESPONSE_FORMAT = {
  success: `{ "success": true, "data": { … } }`,
  error: `{ "success": false, "message": "Asset not found" }`,
  codes: [
    ['200', 'Successful request'],
    ['201', 'Resource created'],
    ['204', 'Deleted, no body'],
    ['400', 'Invalid request (validation)'],
    ['401', 'Missing, invalid or expired token (or wrong login)'],
    ['403', 'Signed in, but the role may not do this'],
    ['404', 'Resource or route not found'],
    ['500', 'Internal error (details only in CloudWatch)'],
    ['503', '/health only: a dependency is unavailable'],
  ] as const,
}
