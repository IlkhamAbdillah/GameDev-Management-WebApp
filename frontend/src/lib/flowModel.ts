// Model of the architecture diagram on /connectivity: nodes, edges, geometry and statuses.
// Pure data + maths (no React) so layout and routing can be unit-tested.

export type NodeId =
  | 'client' | 'authUrl' | 'authLambda' | 'usersTable'
  | 'taskUrl' | 'taskLambda' | 'tasksTable'
  | 'assetUrl' | 'assetLambda' | 'assetsTable' | 'foldersTable'
  | 's3' | 'cloudwatch' | 'iam'

export type NodeKind = 'client' | 'entry' | 'compute' | 'data' | 'storage' | 'platform'
export type Side = 'l' | 'r' | 't' | 'b'

export interface NodeDef {
  id: NodeId
  x: number
  y: number
  w: number
  h: number
  title: string
  subtitle: string
  kind: NodeKind
}

export interface EdgeDef {
  id: string
  a: NodeId
  aSide: Side
  b: NodeId
  bSide: Side
  kind: 'request' | 'direct' | 'platform'
}

export const VIEWBOX = { w: 920, h: 670 }
export const BOUNDARY = { x: 205, y: 20, w: 685, h: 630 } // the AWS account / region

export const NODES: NodeDef[] = [
  { id: 'client', x: 20, y: 300, w: 150, h: 72, title: 'Browser', subtitle: 'React app (this page)', kind: 'client' },
  { id: 'authUrl', x: 230, y: 60, w: 150, h: 64, title: 'Function URL', subtitle: 'Auth API · HTTPS', kind: 'entry' },
  { id: 'authLambda', x: 450, y: 60, w: 150, h: 64, title: 'Lambda', subtitle: 'GameVaultAuthHandler', kind: 'compute' },
  { id: 'usersTable', x: 700, y: 60, w: 170, h: 64, title: 'DynamoDB', subtitle: 'GameVaultUsers', kind: 'data' },
  { id: 'taskUrl', x: 230, y: 170, w: 150, h: 64, title: 'Function URL', subtitle: 'Task API · HTTPS', kind: 'entry' },
  { id: 'taskLambda', x: 450, y: 170, w: 150, h: 64, title: 'Lambda', subtitle: 'GameVaultTaskHandler', kind: 'compute' },
  { id: 'tasksTable', x: 700, y: 170, w: 170, h: 64, title: 'DynamoDB', subtitle: 'GameVaultTasks', kind: 'data' },
  { id: 'iam', x: 450, y: 282, w: 150, h: 64, title: 'IAM role', subtitle: 'LabRole', kind: 'platform' },
  { id: 'cloudwatch', x: 700, y: 282, w: 170, h: 64, title: 'CloudWatch Logs', subtitle: '/aws/lambda/GameVault…', kind: 'platform' },
  { id: 'assetUrl', x: 230, y: 410, w: 150, h: 64, title: 'Function URL', subtitle: 'Asset API · HTTPS', kind: 'entry' },
  { id: 'assetLambda', x: 450, y: 410, w: 150, h: 64, title: 'Lambda', subtitle: 'GameVaultAssetHandler', kind: 'compute' },
  { id: 'assetsTable', x: 700, y: 400, w: 170, h: 64, title: 'DynamoDB', subtitle: 'GameVaultAssets', kind: 'data' },
  { id: 'foldersTable', x: 700, y: 490, w: 170, h: 64, title: 'DynamoDB', subtitle: 'GameVaultFolders', kind: 'data' },
  { id: 's3', x: 450, y: 560, w: 150, h: 64, title: 'Amazon S3', subtitle: 'private asset bucket', kind: 'storage' },
]

export const EDGES: EdgeDef[] = [
  { id: 'client-authUrl', a: 'client', aSide: 'r', b: 'authUrl', bSide: 'l', kind: 'request' },
  { id: 'client-taskUrl', a: 'client', aSide: 'r', b: 'taskUrl', bSide: 'l', kind: 'request' },
  { id: 'client-assetUrl', a: 'client', aSide: 'r', b: 'assetUrl', bSide: 'l', kind: 'request' },
  { id: 'authUrl-authLambda', a: 'authUrl', aSide: 'r', b: 'authLambda', bSide: 'l', kind: 'request' },
  { id: 'taskUrl-taskLambda', a: 'taskUrl', aSide: 'r', b: 'taskLambda', bSide: 'l', kind: 'request' },
  { id: 'assetUrl-assetLambda', a: 'assetUrl', aSide: 'r', b: 'assetLambda', bSide: 'l', kind: 'request' },
  { id: 'authLambda-usersTable', a: 'authLambda', aSide: 'r', b: 'usersTable', bSide: 'l', kind: 'request' },
  { id: 'taskLambda-tasksTable', a: 'taskLambda', aSide: 'r', b: 'tasksTable', bSide: 'l', kind: 'request' },
  { id: 'assetLambda-assetsTable', a: 'assetLambda', aSide: 'r', b: 'assetsTable', bSide: 'l', kind: 'request' },
  { id: 'assetLambda-foldersTable', a: 'assetLambda', aSide: 'r', b: 'foldersTable', bSide: 'l', kind: 'request' },
  { id: 'assetLambda-s3', a: 'assetLambda', aSide: 'b', b: 's3', bSide: 't', kind: 'request' },
  { id: 'client-s3', a: 'client', aSide: 'b', b: 's3', bSide: 'l', kind: 'direct' },
  { id: 'authLambda-iam', a: 'authLambda', aSide: 'r', b: 'iam', bSide: 'r', kind: 'platform' },
  { id: 'taskLambda-iam', a: 'taskLambda', aSide: 'b', b: 'iam', bSide: 't', kind: 'platform' },
  { id: 'assetLambda-iam', a: 'assetLambda', aSide: 't', b: 'iam', bSide: 'b', kind: 'platform' },
  { id: 'authLambda-cloudwatch', a: 'authLambda', aSide: 'r', b: 'cloudwatch', bSide: 'l', kind: 'platform' },
  { id: 'taskLambda-cloudwatch', a: 'taskLambda', aSide: 'r', b: 'cloudwatch', bSide: 'l', kind: 'platform' },
  { id: 'assetLambda-cloudwatch', a: 'assetLambda', aSide: 'r', b: 'cloudwatch', bSide: 'l', kind: 'platform' },
]

export const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, NodeDef>

export function anchor(node: NodeDef, side: Side): { x: number; y: number } {
  switch (side) {
    case 'l': return { x: node.x, y: node.y + node.h / 2 }
    case 'r': return { x: node.x + node.w, y: node.y + node.h / 2 }
    case 't': return { x: node.x + node.w / 2, y: node.y }
    case 'b': return { x: node.x + node.w / 2, y: node.y + node.h }
  }
}

const NORMAL: Record<Side, [number, number]> = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] }

/** Cubic Bézier leaving each box along its side's outward normal. */
export function edgePath(edge: EdgeDef): string {
  const p1 = anchor(NODE_BY_ID[edge.a], edge.aSide)
  const p2 = anchor(NODE_BY_ID[edge.b], edge.bSide)
  const d = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2.5)
  const [n1x, n1y] = NORMAL[edge.aSide]
  const [n2x, n2y] = NORMAL[edge.bSide]
  const r = (n: number) => Math.round(n * 10) / 10
  return `M${r(p1.x)} ${r(p1.y)} C${r(p1.x + n1x * d)} ${r(p1.y + n1y * d)} ${r(p2.x + n2x * d)} ${r(p2.y + n2y * d)} ${r(p2.x)} ${r(p2.y)}`
}

/** The edge connecting two nodes (in either direction); `reverse` is true when travelling b → a. */
export function findEdge(from: NodeId, to: NodeId): { edge: EdgeDef; reverse: boolean } | undefined {
  for (const edge of EDGES) {
    if (edge.a === from && edge.b === to) return { edge, reverse: false }
    if (edge.a === to && edge.b === from) return { edge, reverse: true }
  }
  return undefined
}

// ---------------------------------------------------------------- statuses

export type NodeState = 'unknown' | 'running' | 'ok' | 'failed' | 'inferred'

export interface NodeStatus {
  state: NodeState
  ms?: number
  error?: string
  note?: string
}

export type Statuses = Record<NodeId, NodeStatus>

export const initialStatuses = (): Statuses =>
  Object.fromEntries(NODES.map((n) => [n.id, { state: n.id === 'client' ? 'ok' : 'unknown' }])) as Statuses

export const STATE_COLOR: Record<NodeState, string> = {
  unknown: '#3a4660',
  running: '#6d8cff',
  ok: '#4fbf8b',
  failed: '#ff7a7a',
  inferred: '#7fb8a3',
}

export type HopTone = 'request' | 'ok' | 'fail'
export interface HopOptions {
  tone?: HopTone
  label?: string
  duration?: number
}
export type HopFn = (from: NodeId, to: NodeId, options?: HopOptions) => Promise<void>

/** What orchestrators (health flow, round trip) use to drive the diagram. All members are optional-safe. */
export interface FlowHooks {
  hop: HopFn
  log: (entry: { text: string; tone: 'info' | 'ok' | 'fail' }) => void
  setNode: (id: NodeId, status: NodeStatus) => void
}

export const noopHooks: FlowHooks = { hop: async () => {}, log: () => {}, setNode: () => {} }
