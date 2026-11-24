import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { API_GROUPS, API_NAMES, RESPONSE_FORMAT, type Endpoint, type Method } from '../content/apiSpec'

const TOC = [
  ['overview', 'Overview'],
  ['architecture', 'Architecture'],
  ['stack', 'Tech stack'],
  ['data', 'Data model'],
  ['api', 'API reference'],
  ['security', 'Security & limitations'],
  ['testing', 'Testing'],
] as const

const STACK = [
  { title: 'Frontend', items: [['React 19 + TypeScript', 'component UI, strict types'], ['Vite', 'dev server and build'], ['Tailwind CSS 4', 'dark design system'], ['React Router', 'pages and the open folder in the URL'], ['Lucide', 'icons'], ['<model-viewer>', 'interactive .glb preview and thumbnails (lazy-loaded)']] },
  { title: 'Backend', items: [['AWS Lambda · Python 3.12', 'two functions: Asset Handler, Task Handler'], ['boto3', 'DynamoDB and S3 access'], ['Lambda Function URLs', 'HTTPS entry point per function (see Security)']] },
  { title: 'Data & storage', items: [['Amazon DynamoDB', 'GameVaultAssets, GameVaultFolders, GameVaultTasks (on-demand)'], ['Amazon S3', 'private bucket for asset files, pre-signed URLs']] },
  { title: 'Platform', items: [['AWS IAM', 'LabRole assumed by both Lambdas'], ['Amazon CloudWatch Logs', 'execution logs and error traces']] },
  { title: 'Quality & tooling', items: [['pytest + moto', '105 backend tests against mocked AWS'], ['Vitest', 'frontend unit tests'], ['Smoke test + Postman', 'live checks of the deployed stack'], ['GitHub Actions', 'CI for tests and build']] },
] as const

const TABLES = [
  ['GameVaultAssets', 'assetId', 'assetName, assetType, description, assignedTo, status, folderId, s3Key, createdAt, updatedAt'],
  ['GameVaultFolders', 'folderId', 'name, parentId (empty = top level), createdAt, updatedAt'],
  ['GameVaultTasks', 'taskId', 'title, description, assignee, category, priority, status, startDate, dueDate, createdAt, updatedAt'],
] as const

const METHOD_STYLE: Record<Method, string> = {
  GET: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  POST: 'bg-green-500/15 text-green-300 ring-green-500/30',
  PUT: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  DELETE: 'bg-red-500/15 text-red-300 ring-red-500/30',
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <h2 className="border-b border-line pb-2 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-bg p-3 text-xs leading-relaxed text-slate-300">{children}</pre>
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  const [open, setOpen] = useState(false)
  const hasDetails = Boolean(endpoint.query || endpoint.body || endpoint.response)
  return (
    <div className="rounded-xl border border-line bg-surface">
      <button onClick={() => hasDetails && setOpen((o) => !o)} aria-expanded={hasDetails ? open : undefined} className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left ${hasDetails ? 'hover:bg-surface-2' : 'cursor-default'}`}>
        <span className={`w-16 shrink-0 rounded-md px-2 py-0.5 text-center text-xs font-semibold ring-1 ${METHOD_STYLE[endpoint.method]}`}>{endpoint.method}</span>
        <code className="text-sm">{endpoint.path}</code>
        <span className="rounded-md bg-slate-700/40 px-1.5 py-0.5 text-[11px] text-slate-300">{API_NAMES[endpoint.api].label}</span>
        <span className="ml-auto text-xs text-slate-500">{endpoint.status}{endpoint.errors ? ` · ${endpoint.errors}` : ''}</span>
        <span className="basis-full text-xs text-slate-400">{endpoint.summary}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {endpoint.query && (
            <div>
              <div className="mb-1 text-xs font-medium text-slate-400">Query parameters (all optional)</div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-300">{endpoint.query.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          )}
          {endpoint.body && (<div><div className="mb-1 text-xs font-medium text-slate-400">Request body</div><Code>{endpoint.body}</Code></div>)}
          {endpoint.response && (<div><div className="mb-1 text-xs font-medium text-slate-400">Response</div><Code>{endpoint.response}</Code></div>)}
        </div>
      )}
    </div>
  )
}

export default function DocsPage() {
  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Documentation" subtitle="How GameVault works: architecture, tech stack and API" />
      <div className="mt-6 flex gap-8">
        <aside className="sticky top-6 hidden h-fit w-48 shrink-0 lg:block">
          <nav aria-label="On this page" className="space-y-1 text-sm">
            {TOC.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-slate-400 hover:bg-surface-2 hover:text-slate-200">{label}</a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-4xl flex-1 space-y-10">
          <Section id="overview" title="Overview">
            <p className="text-sm leading-relaxed text-slate-300">
              <strong>GameVault</strong> is a lightweight workspace for small indie game teams. It combines three modules: <strong>Assets</strong> (a library of game files with folders and in-browser preview), <strong>Tasks</strong> (a Kanban board) and <strong>Timeline</strong> (a Gantt-style schedule). Assets and Tasks are independent: they share no database relationship. The Timeline has no storage of its own; it is derived from task records, so any change to a task shows up on the next load.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[['Assets', 'Nested folders, upload/download through S3, previews for images, audio and .glb 3D models.'], ['Tasks', 'Kanban with drag-and-drop, filters, search and deadline highlighting.'], ['Timeline', 'Gantt bars by status, date-range navigation and completion statistics.']].map(([t, d]) => (
                <div key={t} className="rounded-xl border border-line bg-surface p-3"><div className="text-sm font-medium">{t}</div><p className="mt-1 text-xs text-slate-400">{d}</p></div>
              ))}
            </div>
          </Section>

          <Section id="architecture" title="Architecture">
            <img src="/architecture.png" alt="GameVault AWS architecture diagram" className="w-full rounded-xl border border-line" />
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
              <li><strong>Request flow.</strong> The browser calls a Lambda Function URL over HTTPS with JSON. Each module has its own Lambda: the Asset Handler (assets, folders, files) and the Task Handler (tasks and timeline).</li>
              <li><strong>Data flow.</strong> Lambdas read and write DynamoDB tables. Metadata lives in DynamoDB; file bytes live in S3.</li>
              <li><strong>Files bypass Lambda.</strong> The Lambda only signs short-lived pre-signed URLs; the browser then uploads to or downloads from the private S3 bucket directly. No AWS keys ever reach the browser.</li>
              <li><strong>Observability.</strong> Every invocation is logged to CloudWatch; unexpected errors are logged with a stack trace there and shown to clients only as a generic message.</li>
            </ol>
            <div className="rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="font-medium">Key decisions</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-300">
                <li>Serverless and pay-per-use, suitable for AWS Learner Lab and small teams.</li>
                <li>Function URLs instead of API Gateway because the Learner Lab denies creating API Gateway APIs. Routing happens in the handler using the same event format as an HTTP API, so moving to API Gateway later needs no code change.</li>
                <li>Timeline is computed from tasks rather than stored, so it can never go out of sync.</li>
                <li>Folders form a tree through a <code>parentId</code> on flat records; the tree is built in the client and validated on the server.</li>
              </ul>
            </div>
          </Section>

          <Section id="stack" title="Tech stack">
            <div className="grid gap-3 md:grid-cols-2">
              {STACK.map((group) => (
                <div key={group.title} className="rounded-xl border border-line bg-surface p-3">
                  <div className="mb-2 text-sm font-medium">{group.title}</div>
                  <ul className="space-y-1.5">
                    {group.items.map(([name, note]) => (
                      <li key={name} className="text-xs"><span className="text-slate-200">{name}</span><span className="text-slate-500"> — {note}</span></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section id="data" title="Data model">
            <p className="text-sm text-slate-300">DynamoDB tables use a single string partition key and on-demand capacity. Timestamps are UTC ISO 8601; task dates are <code>YYYY-MM-DD</code>.</p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-slate-400"><tr><th className="px-3 py-2">Table</th><th className="px-3 py-2">Partition key</th><th className="px-3 py-2">Attributes</th></tr></thead>
                <tbody>
                  {TABLES.map(([t, k, a]) => (
                    <tr key={t} className="border-t border-line"><td className="px-3 py-2 font-medium text-slate-200">{t}</td><td className="px-3 py-2"><code>{k}</code></td><td className="px-3 py-2 text-slate-400">{a}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Files are stored in S3 under <code>assets/&#123;assetId&#125;/&lt;random&gt;-&lt;file name&gt;</code>; the asset keeps that key in <code>s3Key</code>.</p>
          </Section>

          <Section id="api" title="API reference">
            <div className="space-y-2 text-sm text-slate-300">
              <p>There are two APIs, each a Lambda Function URL (configured with <code>{API_NAMES.asset.env}</code> and <code>{API_NAMES.task.env}</code>). All bodies are JSON. Click an endpoint for details.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div><div className="mb-1 text-xs font-medium text-slate-400">Success</div><Code>{RESPONSE_FORMAT.success}</Code></div>
                <div><div className="mb-1 text-xs font-medium text-slate-400">Error</div><Code>{RESPONSE_FORMAT.error}</Code></div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {RESPONSE_FORMAT.codes.map(([code, meaning]) => (
                  <span key={code} className="rounded-md bg-surface px-2 py-1 ring-1 ring-line"><strong className="text-slate-200">{code}</strong> <span className="text-slate-400">{meaning}</span></span>
                ))}
              </div>
            </div>
            {API_GROUPS.map((group) => (
              <div key={group.id} className="space-y-2">
                <h3 id={`api-${group.id}`} className="scroll-mt-6 pt-2 text-base font-semibold">{group.title}</h3>
                <p className="text-xs leading-relaxed text-slate-400">{group.description}</p>
                {group.endpoints.map((e) => <EndpointRow key={`${e.api}-${e.method}-${e.path}`} endpoint={e} />)}
              </div>
            ))}
          </Section>

          <Section id="security" title="Security & limitations">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
              <li>The S3 bucket is private (Block Public Access, encryption at rest). Access is only through pre-signed URLs, with the file type, content type and size signed in.</li>
              <li>No credentials in the frontend or in the repository. Lambdas use an IAM role; configuration comes from environment variables.</li>
              <li>Every payload is validated and only whitelisted fields are stored. Writes are conditional, so updating or deleting a missing record never creates or removes anything else.</li>
              <li>File names are sanitised, an asset can only reference files under its own S3 prefix, and deleting an asset deletes only that prefix.</li>
              <li>Unexpected errors return a generic 500; details are in CloudWatch only.</li>
            </ul>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <div className="font-medium">Known limitations (academic MVP)</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                <li><strong>No authentication:</strong> the Function URLs are public, so anyone with a URL can use the API. CORS allows any origin.</li>
                <li>Both Lambdas share the Learner Lab role (<code>LabRole</code>) instead of separate least-privilege roles.</li>
                <li>List endpoints use DynamoDB <code>Scan</code> and filter in the Lambda, which is fine for small datasets only.</li>
              </ul>
            </div>
          </Section>

          <Section id="testing" title="Testing">
            <p className="text-sm text-slate-300">
              Backend logic is covered by pytest against mocked AWS, the UI helpers by Vitest, and the deployed stack by a live smoke test that exercises real DynamoDB, S3 and CloudWatch. Open the <Link to="/connectivity" className="text-accent underline">Connectivity</Link> page for an interactive version of the architecture diagram: click a component for details, run a test to watch a request travel through it, or run a full round-trip test.
            </p>
          </Section>
        </article>
      </div>
    </div>
  )
}
