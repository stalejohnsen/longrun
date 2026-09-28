// Spec 0004: fetches one month of repository data through the gh CLI. GitHub responses are
// external input, so every shape is validated with Zod (CLAUDE.md).
import { z } from 'zod'
import { DEPENDABOT, monthRange, type MonthData, type PullRequest } from './compute.ts'

// Runs `gh api <path>` and returns stdout. Injected, so tests can fake GitHub.
export type Gh = (path: string) => string

// CI runs of PRs opened before the month still count for PRs merged in it.
const LOOKBACK_DAYS = 60
const PAGE_SIZE = 100
const MAX_PAGES = 20

const searchPage = z.object({ items: z.array(z.object({ number: z.number().int() })) })

const pullRequest = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  user: z.object({ login: z.string() }),
  labels: z.array(z.object({ name: z.string() })),
  head: z.object({ ref: z.string() }),
  created_at: z.iso.datetime(),
  merged_at: z.iso.datetime().nullable(),
  closed_at: z.iso.datetime().nullable(),
  merged_by: z.object({ login: z.string() }).nullable(),
})

const commits = z.array(z.object({ author: z.object({ login: z.string() }).nullable() }))

const runsPage = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number().int(),
      head_branch: z.string().nullable(),
      head_sha: z.string(),
      created_at: z.iso.datetime(),
      updated_at: z.iso.datetime(),
      conclusion: z.string().nullable(),
      run_attempt: z.number().int(),
    }),
  ),
})

const attempt = z.object({ conclusion: z.string().nullable() })

const jobs = z.object({
  jobs: z.array(
    z.object({
      steps: z.array(z.object({ name: z.string(), conclusion: z.string().nullable() })).optional(),
    }),
  ),
})

const alerts = z.array(
  z.object({
    number: z.number().int(),
    created_at: z.iso.datetime(),
    fixed_at: z.iso.datetime().nullable(),
    security_advisory: z.object({ severity: z.string() }),
  }),
)

// The deploy step that puts a build into production (spec 0002 step 7).
export const SWAP_STEP = 'Swap staging into production'

function get<T>(gh: Gh, path: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(gh(path)))
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function searchNumbers(gh: Gh, repo: string, query: string): number[] {
  const numbers: number[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = encodeURIComponent(`repo:${repo} is:pr ${query}`)
    const { items } = get(gh, `search/issues?q=${q}&per_page=${PAGE_SIZE}&page=${page}`, searchPage)
    numbers.push(...items.map((item) => item.number))
    if (items.length < PAGE_SIZE) break
  }
  return numbers
}

function workflowRuns(gh: Gh, repo: string, workflow: string, query: string) {
  const runs: z.infer<typeof runsPage>['workflow_runs'] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { workflow_runs } = get(
      gh,
      `repos/${repo}/actions/workflows/${workflow}/runs?${query}&per_page=${PAGE_SIZE}&page=${page}`,
      runsPage,
    )
    runs.push(...workflow_runs)
    if (workflow_runs.length < PAGE_SIZE) break
  }
  return runs
}

function pullRequestDetails(gh: Gh, repo: string, number: number): PullRequest {
  const pr = get(gh, `repos/${repo}/pulls/${number}`, pullRequest)
  const authors =
    pr.user.login === DEPENDABOT
      ? get(gh, `repos/${repo}/pulls/${number}/commits?per_page=${PAGE_SIZE}`, commits).map(
          (commit) => commit.author?.login ?? 'unknown',
        )
      : []
  return {
    number: pr.number,
    title: pr.title,
    author: pr.user.login,
    labels: pr.labels.map((label) => label.name),
    body: pr.body ?? '',
    headRef: pr.head.ref,
    createdAt: pr.created_at,
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
    mergedBy: pr.merged_by?.login ?? null,
    commitAuthors: authors,
  }
}

export function collectMonth(gh: Gh, repo: string, month: string): MonthData {
  const { start, end } = monthRange(month)
  const lastDay = new Date(end.getTime() - 1)
  const range = `${day(start)}..${day(lastDay)}`
  const lookback = new Date(start.getTime() - LOOKBACK_DAYS * 86_400_000)

  const merged = searchNumbers(gh, repo, `is:merged merged:${range}`).map((n) =>
    pullRequestDetails(gh, repo, n),
  )
  const dependabotClosed = searchNumbers(gh, repo, `author:app/dependabot closed:${range}`).map(
    (n) => pullRequestDetails(gh, repo, n),
  )

  const ciRuns = workflowRuns(
    gh,
    repo,
    'ci.yml',
    `event=pull_request&created=${day(lookback)}..${day(lastDay)}`,
  ).map((run) => ({
    headBranch: run.head_branch ?? '',
    headSha: run.head_sha,
    createdAt: run.created_at,
    firstAttemptConclusion:
      run.run_attempt === 1
        ? run.conclusion
        : get(gh, `repos/${repo}/actions/runs/${run.id}/attempts/1`, attempt).conclusion,
  }))

  // Deploys up to the end of the month plus a week, so late fixes and deploys still count.
  const deployEnd = new Date(end.getTime() + 7 * 86_400_000)
  const deploys = workflowRuns(
    gh,
    repo,
    'deploy.yml',
    `status=success&created=${day(start)}..${day(deployEnd)}`,
  )
    .filter((run) =>
      get(gh, `repos/${repo}/actions/runs/${run.id}/jobs`, jobs).jobs.some((job) =>
        (job.steps ?? []).some((step) => step.name === SWAP_STEP && step.conclusion === 'success'),
      ),
    )
    .map((run) => ({ startedAt: run.created_at, finishedAt: run.updated_at }))

  // The alerts API pages with cursors, not `page`. One page is plenty for this repository;
  // stop loudly rather than count wrong if that ever changes.
  const allAlerts = get(
    gh,
    `repos/${repo}/dependabot/alerts?state=fixed&per_page=${PAGE_SIZE}`,
    alerts,
  )
  if (allAlerts.length === PAGE_SIZE) {
    throw new Error(
      `${PAGE_SIZE} or more fixed Dependabot alerts: add cursor pagination to collect.ts`,
    )
  }

  return {
    month,
    merged,
    dependabotClosed,
    ciRuns,
    deploys,
    alerts: allAlerts.map((alert) => ({
      number: alert.number,
      severity: alert.security_advisory.severity,
      createdAt: alert.created_at,
      fixedAt: alert.fixed_at,
    })),
  }
}
