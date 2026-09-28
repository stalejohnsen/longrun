// Spec 0004 "Measurement": pure calculations over one month of repository data.
// scripts/metrics/collect.ts fetches the data; scripts/metrics.ts prints the table.

export type PullRequest = {
  number: number
  title: string
  author: string
  labels: string[]
  body: string
  headRef: string
  createdAt: string
  mergedAt: string | null
  closedAt: string | null
  mergedBy: string | null
  // Logins of the commit authors on the PR (Dependabot PRs only; empty otherwise).
  commitAuthors: string[]
}

export type CiRun = {
  headBranch: string
  headSha: string
  createdAt: string
  // Conclusion of the first attempt; a re-run does not make a failed first pass green.
  firstAttemptConclusion: string | null
}

// A deploy run whose swap into production succeeded.
export type ProductionDeploy = { startedAt: string; finishedAt: string }

export type Alert = {
  number: number
  severity: string
  createdAt: string
  fixedAt: string | null
}

export type MonthData = {
  month: string
  // PRs merged in the month.
  merged: PullRequest[]
  // Dependabot PRs closed (merged or not) in the month.
  dependabotClosed: PullRequest[]
  ciRuns: CiRun[]
  deploys: ProductionDeploy[]
  alerts: Alert[]
}

export const DEPENDABOT = 'dependabot[bot]'
export const AUTO_MERGER = 'github-actions[bot]'
export const AGENT_LABEL = 'agent'
export const PRODUCTION_FIX_LABEL = 'production-fix'

const HOUR = 3_600_000

export function monthRange(month: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) throw new Error(`Month must look like 2026-09, got "${month}"`)
  const year = Number(match[1])
  const index = Number(match[2]) - 1
  if (index < 0 || index > 11) throw new Error(`No such month: "${month}"`)
  return { start: new Date(Date.UTC(year, index, 1)), end: new Date(Date.UTC(year, index + 1, 1)) }
}

function hoursBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / HOUR
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

// CI runs of a PR: same branch, started before it was merged.
function runsOf(pr: PullRequest, runs: CiRun[]): CiRun[] {
  return runs
    .filter(
      (run) =>
        run.headBranch === pr.headRef && (pr.mergedAt === null || run.createdAt <= pr.mergedAt),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// The first production deploy that started after a moment (deploys run from main's head).
function firstDeployAfter(moment: string, deploys: ProductionDeploy[]): ProductionDeploy | null {
  return (
    deploys
      .filter((deploy) => deploy.startedAt >= moment)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0] ?? null
  )
}

export type DependabotOutcome =
  'auto-merged' | 'owner, as proposed' | 'owner fix' | 'agent fix' | 'closed'

export function dependabotOutcome(pr: PullRequest, merged: PullRequest[]): DependabotOutcome {
  if (pr.mergedAt !== null) {
    if (pr.commitAuthors.some((author) => author !== DEPENDABOT)) return 'owner fix'
    return pr.mergedBy === AUTO_MERGER ? 'auto-merged' : 'owner, as proposed'
  }
  const fixedByAgent = merged.some(
    (other) =>
      other.labels.includes(AGENT_LABEL) && new RegExp(`#${pr.number}(\\D|$)`).test(other.body),
  )
  return fixedByAgent ? 'agent fix' : 'closed'
}

export type Metrics = {
  month: string
  mergedCount: number
  firstPassCi: { passed: number; total: number }
  reworkPerPr: number | null
  medianHoursToMerge: number | null
  medianHoursMergeToProduction: number | null
  dependabot: Record<DependabotOutcome, number>
  agentShare: { agent: number; total: number }
  changeFailure: { failed: number; deploys: number }
  timeToPatch: { number: number; severity: string; hours: number | null }[]
}

export function computeMetrics(data: MonthData): Metrics {
  const { start, end } = monthRange(data.month)
  const inMonth = (moment: string) => moment >= start.toISOString() && moment < end.toISOString()

  let passed = 0
  let withRuns = 0
  const rework: number[] = []
  const toMerge: number[] = []
  const toProduction: number[] = []
  for (const pr of data.merged) {
    toMerge.push(hoursBetween(pr.createdAt, pr.mergedAt!))
    const deploy = firstDeployAfter(pr.mergedAt!, data.deploys)
    if (deploy) toProduction.push(hoursBetween(pr.mergedAt!, deploy.finishedAt))
    const runs = runsOf(pr, data.ciRuns)
    if (runs.length === 0) continue
    withRuns += 1
    if (runs[0]!.firstAttemptConclusion === 'success') passed += 1
    rework.push(new Set(runs.map((run) => run.headSha)).size - 1)
  }

  const dependabot: Record<DependabotOutcome, number> = {
    'auto-merged': 0,
    'owner, as proposed': 0,
    'owner fix': 0,
    'agent fix': 0,
    closed: 0,
  }
  for (const pr of data.dependabotClosed) dependabot[dependabotOutcome(pr, data.merged)] += 1

  const deploysInMonth = data.deploys.filter((deploy) => inMonth(deploy.startedAt))
  const fixes = data.merged.filter(
    (pr) => pr.labels.includes(PRODUCTION_FIX_LABEL) || /^revert\b/i.test(pr.title),
  )
  const failed = deploysInMonth.filter((deploy) =>
    fixes.some((fix) => {
      const after = hoursBetween(deploy.finishedAt, fix.mergedAt!)
      return after >= 0 && after <= 7 * 24
    }),
  ).length

  const timeToPatch = data.alerts
    .filter((alert) => alert.fixedAt !== null && inMonth(alert.fixedAt))
    .map((alert) => {
      const deploy = firstDeployAfter(alert.fixedAt!, data.deploys)
      return {
        number: alert.number,
        severity: alert.severity,
        hours: deploy ? hoursBetween(alert.createdAt, deploy.finishedAt) : null,
      }
    })

  return {
    month: data.month,
    mergedCount: data.merged.length,
    firstPassCi: { passed, total: withRuns },
    reworkPerPr: rework.length === 0 ? null : rework.reduce((a, b) => a + b, 0) / rework.length,
    medianHoursToMerge: median(toMerge),
    medianHoursMergeToProduction: median(toProduction),
    dependabot,
    agentShare: {
      agent: data.merged.filter((pr) => pr.labels.includes(AGENT_LABEL)).length,
      total: data.merged.length,
    },
    changeFailure: { failed, deploys: deploysInMonth.length },
    timeToPatch,
  }
}

function share(part: number, total: number): string {
  return total === 0 ? 'n/a (none)' : `${Math.round((part / total) * 100)}% (${part} of ${total})`
}

function hours(value: number | null): string {
  if (value === null) return 'n/a'
  return value < 48 ? `${value.toFixed(1)} h` : `${(value / 24).toFixed(1)} days`
}

export function formatMetrics(metrics: Metrics): string {
  const dependabotTotal = Object.values(metrics.dependabot).reduce((a, b) => a + b, 0)
  const dependabotDetail =
    dependabotTotal === 0
      ? 'no Dependabot PRs closed'
      : Object.entries(metrics.dependabot)
          .filter(([, count]) => count > 0)
          .map(([outcome, count]) => `${outcome}: ${count}`)
          .join(', ')
  const patches =
    metrics.timeToPatch.length === 0
      ? 'no alerts fixed'
      : metrics.timeToPatch
          .map((alert) => `#${alert.number} ${alert.severity}: ${hours(alert.hours)}`)
          .join('; ')
  const rows = [
    ['PRs merged', String(metrics.mergedCount)],
    ['First-pass CI', share(metrics.firstPassCi.passed, metrics.firstPassCi.total)],
    [
      'Rework (commits after the first CI run, per PR)',
      metrics.reworkPerPr === null ? 'n/a' : metrics.reworkPerPr.toFixed(2),
    ],
    ['Median time, PR opened to merged', hours(metrics.medianHoursToMerge)],
    ['Median time, merged to production', hours(metrics.medianHoursMergeToProduction)],
    ['Dependabot outcomes', dependabotDetail],
    ['Agent share of merged PRs', share(metrics.agentShare.agent, metrics.agentShare.total)],
    [
      'Change failure (deploys followed within 7 days by a production-fix or revert PR)',
      share(metrics.changeFailure.failed, metrics.changeFailure.deploys),
    ],
    ['Time to patch (alert opened to production)', patches],
  ]
  return [
    `Metrics for ${metrics.month} (scripts/metrics.ts)`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
  ].join('\n')
}
