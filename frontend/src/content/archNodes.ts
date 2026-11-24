import type { NodeId } from '../lib/flowModel'

export interface NodeInfo {
  title: string
  what: string
  inGameVault: string[]
  howChecked: string
}

export const NODE_INFO: Record<NodeId, NodeInfo> = {
  client: {
    title: 'Browser (client)',
    what: 'The React single-page app you are using. It talks to the backend over HTTPS and sends files straight to S3.',
    inGameVault: ['Renders Assets, Tasks, Timeline, Docs and this page.', 'Calls the Function URLs with JSON and a bearer token.', 'Uploads/downloads files directly to/from S3 with pre-signed URLs, so no AWS credentials ever reach the browser.'],
    howChecked: 'It is the origin of every check below; if you can read this page, the client works.',
  },
  assetUrl: {
    title: 'Function URL · Asset API',
    what: 'A public HTTPS endpoint built into AWS Lambda. It receives the browser’s request and hands it to the Asset Lambda. (API Gateway is not available in this Learner Lab, so Function URLs are used.)',
    inGameVault: ['Serves /assets, /folders and /health.', 'Answers the browser’s CORS preflight.', 'Sign-in is required except on /health: the Lambda verifies the bearer token itself (Function URLs have no authorizer).'],
    howChecked: 'The browser calls GET /health. Any HTTP answer proves the URL, the network and CORS work.',
  },
  assetLambda: {
    title: 'Lambda · GameVaultAssetHandler',
    what: 'Python 3.12 function holding all asset logic: validation, routing, DynamoDB access and S3 signing.',
    inGameVault: ['CRUD for assets and folders (folder tree rules, unique names).', 'Creates short-lived pre-signed upload/download URLs.', 'Deletes a file or an asset’s whole S3 prefix.'],
    howChecked: 'On /health it probes its two DynamoDB tables and the S3 bucket and reports each result with its latency.',
  },
  assetsTable: {
    title: 'DynamoDB · GameVaultAssets',
    what: 'NoSQL table (key: assetId) with asset metadata: name, category, status, folder, S3 key and timestamps.',
    inGameVault: ['One item per asset. File bytes are in S3, not here.', 'Writes are conditional, so updating or deleting a missing asset never creates anything.'],
    howChecked: 'The Lambda runs DescribeTable on it during /health.',
  },
  foldersTable: {
    title: 'DynamoDB · GameVaultFolders',
    what: 'NoSQL table (key: folderId) holding the folder tree as flat records linked by parentId.',
    inGameVault: ['Folders nest up to 10 levels; a folder can only be deleted when empty.', 'Assets point to a folder through folderId.'],
    howChecked: 'The Lambda runs DescribeTable on it during /health.',
  },
  s3: {
    title: 'Amazon S3 · asset bucket',
    what: 'Private object storage for the actual game files. Block Public Access is on; the only way in is a pre-signed URL.',
    inGameVault: ['Objects live under assets/{assetId}/…', 'The browser PUTs and GETs files directly (dashed line), bypassing Lambda.', 'Pre-signed URLs also fix the content type and size, so S3 rejects anything different.'],
    howChecked: 'The Lambda runs HeadBucket on /health. The full round-trip test also uploads and downloads a small file from the browser.',
  },
  authUrl: {
    title: 'Function URL · Auth API',
    what: 'The public HTTPS endpoint for the Auth Lambda, with CORS enabled (including the Authorization header).',
    inGameVault: ['Serves /auth/login, /auth/me, /auth/password, /users and /health.', 'Only /health and /auth/login work without a token.'],
    howChecked: 'The browser calls GET /health on it.',
  },
  authLambda: {
    title: 'Lambda · GameVaultAuthHandler',
    what: 'Python 3.12 function for sign-in and accounts. It issues the signed token (HS256 JWT, 8 hours) that the Asset and Task Lambdas verify themselves, because Function URLs have no authorizer.',
    inGameVault: ['Checks the password (scrypt hash) and returns a token.', 'Project managers create, edit and delete accounts here.', 'A project manager cannot be changed back to a member.'],
    howChecked: 'On /health it probes the users table and reports the result. The round-trip test also calls /auth/me with your token.',
  },
  usersTable: {
    title: 'DynamoDB · GameVaultUsers',
    what: 'NoSQL table (key: userId) with name, email, role (project_manager or member) and the password hash.',
    inGameVault: ['The first project manager is created by scripts/seed_admin.py; there is no public registration.', 'Tasks refer to an account only through assigneeId.', 'The password hash is never returned by the API.'],
    howChecked: 'The Lambda runs DescribeTable on it during /health.',
  },
  taskUrl: {
    title: 'Function URL · Task API',
    what: 'The public HTTPS endpoint for the Task Lambda, with CORS enabled.',
    inGameVault: ['Serves /tasks, /timeline and /health.', 'Sign-in is required except on /health; members can only edit tasks assigned to them.'],
    howChecked: 'The browser calls GET /health on it.',
  },
  taskLambda: {
    title: 'Lambda · GameVaultTaskHandler',
    what: 'Python 3.12 function for tasks and the timeline. The Timeline has no table of its own: it is computed from task records on every request.',
    inGameVault: ['CRUD, filtering and search for tasks.', 'GET /timeline: bars, deadline flags and completion statistics.'],
    howChecked: 'On /health it probes the tasks table and reports the result.',
  },
  tasksTable: {
    title: 'DynamoDB · GameVaultTasks',
    what: 'NoSQL table (key: taskId) with title, assignee, category, priority, status and the start/due dates.',
    inGameVault: ['Independent of assets: no foreign keys.', 'The source of truth for both the Kanban board and the Timeline.'],
    howChecked: 'The Lambda runs DescribeTable on it during /health.',
  },
  iam: {
    title: 'IAM role · LabRole',
    what: 'The identity all three Lambdas run as. It grants access to DynamoDB, S3 and CloudWatch. (Learner Lab does not allow creating separate least-privilege roles.)',
    inGameVault: ['Lets the Lambdas read/write the tables and the bucket.', 'Your lab session controls it: when the session ends, access is denied.'],
    howChecked: 'Not testable directly. It is inferred: if the Lambdas can reach DynamoDB/S3, the role works; an AccessDenied error points at it.',
  },
  cloudwatch: {
    title: 'CloudWatch Logs',
    what: 'Where Lambda writes its execution logs (START/END/REPORT lines and error stack traces).',
    inGameVault: ['Log groups /aws/lambda/GameVaultAssetHandler, …TaskHandler and …AuthHandler.', 'Unexpected errors are logged here with a stack trace; clients only see a generic message.'],
    howChecked: 'Not testable from the browser. Every request above produces a log entry; open AWS Console → CloudWatch → Log groups to see them.',
  },
}

/** Plain-language hint for an AWS error code or client-side failure message. */
export function hintFor(error?: string): string | undefined {
  if (!error) return undefined
  if (/AccessDenied|^403$|UnauthorizedOperation|ExpiredToken|InvalidAccessKey/i.test(error)) {
    return 'Access was denied. In AWS Learner Lab this usually means your lab session has ended: press Start Lab again and refresh the credentials. Otherwise check the Lambda role’s permissions.'
  }
  if (/ResourceNotFound|NoSuchBucket|NoSuchKey|^404$/i.test(error)) {
    return 'The resource does not exist. Run scripts/deploy.py to create the tables, bucket and functions.'
  }
  if (/Throttl|ProvisionedThroughput|SlowDown|TooMany/i.test(error)) return 'AWS is throttling requests. Wait a moment and run the test again.'
  if (/Cannot reach|CORS|network/i.test(error)) return 'The browser could not get any answer: check the API URL in .env.local, your internet connection and the Function URL’s CORS settings.'
  if (/Timed out/i.test(error)) return 'No answer within 15 seconds. The function may be cold-starting or unavailable; try again.'
  if (/not configured/i.test(error)) return 'Copy frontend/.env.example to .env.local and fill in the Function URLs.'
  return undefined
}
