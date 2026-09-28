import { describe, expect, it } from 'vitest'
import {
  computeMetrics,
  dependabotOutcome,
  formatMetrics,
  median,
  monthRange,
  type MonthData,
  type PullRequest,
} from '../../../scripts/metrics/compute.ts'

// Spec 0004 "Measurement" (M1): the monthly metrics from repository data.

function pr(overrides: Partial<PullRequest>): PullRequest {
  return {
    number: 1,
    title: 'Change',
    author: 'owner',
    labels: [],
    body: '',
    headRef: 'feat/x',
    createdAt: '2026-10-01T08:00:00Z',
    mergedAt: '2026-10-01T10:00:00Z',
    closedAt: '2026-10-01T10:00:00Z',
    mergedBy: 'owner',
    commitAuthors: [],
    ...overrides,
  }
}

function month(overrides: Partial<MonthData>): MonthData {
  return {
    month: '2026-10',
    merged: [],
    dependabotClosed: [],
    ciRuns: [],
    deploys: [],
    alerts: [],
    ...overrides,
  }
}

describe('monthRange', () => {
  it('covers a calendar month in UTC, including December', () => {
    expect(monthRange('2026-10')).toEqual({
      start: new Date('2026-10-01T00:00:00Z'),
      end: new Date('2026-11-01T00:00:00Z'),
    })
    expect(monthRange('2026-12').end).toEqual(new Date('2027-01-01T00:00:00Z'))
  })

  it.each(['2026-9', 'September', '2026-13', '2026-00'])('rejects %s', (value) => {
    expect(() => monthRange(value)).toThrow()
  })
})

describe('median', () => {
  it('handles empty, odd and even lists', () => {
    expect(median([])).toBeNull()
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})

describe('first-pass CI and rework', () => {
  it('uses the first CI run of each PR, and counts extra commits as rework', () => {
    const metrics = computeMetrics(
      month({
        merged: [
          pr({ number: 1, headRef: 'a', mergedAt: '2026-10-02T00:00:00Z' }),
          pr({ number: 2, headRef: 'b', mergedAt: '2026-10-02T00:00:00Z' }),
          pr({ number: 3, headRef: 'no-ci', mergedAt: '2026-10-02T00:00:00Z' }),
        ],
        ciRuns: [
          {
            headBranch: 'a',
            headSha: 's1',
            createdAt: '2026-10-01T09:00:00Z',
            firstAttemptConclusion: 'success',
          },
          {
            headBranch: 'b',
            headSha: 't2',
            createdAt: '2026-10-01T10:00:00Z',
            firstAttemptConclusion: 'success',
          },
          {
            headBranch: 'b',
            headSha: 't1',
            createdAt: '2026-10-01T09:00:00Z',
            firstAttemptConclusion: 'failure',
          },
          {
            headBranch: 'b',
            headSha: 't3',
            createdAt: '2026-10-01T11:00:00Z',
            firstAttemptConclusion: 'success',
          },
          // After the merge: not part of the PR.
          {
            headBranch: 'a',
            headSha: 's9',
            createdAt: '2026-10-03T00:00:00Z',
            firstAttemptConclusion: 'failure',
          },
        ],
      }),
    )
    expect(metrics.firstPassCi).toEqual({ passed: 1, total: 2 })
    expect(metrics.reworkPerPr).toBe(1)
  })

  it('reports n/a without CI runs', () => {
    const metrics = computeMetrics(month({ merged: [pr({})] }))
    expect(metrics.firstPassCi).toEqual({ passed: 0, total: 0 })
    expect(metrics.reworkPerPr).toBeNull()
  })
})

describe('lead times', () => {
  it('measures opened to merged, and merged to the first production deploy after it', () => {
    const metrics = computeMetrics(
      month({
        merged: [
          pr({ number: 1, createdAt: '2026-10-01T08:00:00Z', mergedAt: '2026-10-01T10:00:00Z' }),
          pr({ number: 2, createdAt: '2026-10-01T08:00:00Z', mergedAt: '2026-10-01T12:00:00Z' }),
        ],
        deploys: [
          { startedAt: '2026-10-01T09:00:00Z', finishedAt: '2026-10-01T09:30:00Z' },
          { startedAt: '2026-10-01T13:00:00Z', finishedAt: '2026-10-01T14:00:00Z' },
        ],
      }),
    )
    expect(metrics.medianHoursToMerge).toBe(3)
    expect(metrics.medianHoursMergeToProduction).toBe(3)
  })

  it('leaves merged-to-production empty when nothing was deployed after the merge', () => {
    expect(computeMetrics(month({ merged: [pr({})] })).medianHoursMergeToProduction).toBeNull()
  })
})

describe('Dependabot outcomes', () => {
  const dependabot = { author: 'dependabot[bot]', commitAuthors: ['dependabot[bot]'] }

  it('classifies merged Dependabot PRs by who merged and who committed', () => {
    expect(dependabotOutcome(pr({ ...dependabot, mergedBy: 'github-actions[bot]' }), [])).toBe(
      'auto-merged',
    )
    expect(dependabotOutcome(pr({ ...dependabot, mergedBy: 'owner' }), [])).toBe(
      'owner, as proposed',
    )
    expect(
      dependabotOutcome(pr({ ...dependabot, commitAuthors: ['dependabot[bot]', 'owner'] }), []),
    ).toBe('owner fix')
  })

  it('credits the agent when an agent PR that links the closed Dependabot PR was merged', () => {
    const closed = pr({ ...dependabot, number: 7, mergedAt: null, mergedBy: null })
    const agentFix = pr({ number: 8, labels: ['agent'], body: 'Supersedes Dependabot #7.' })
    const unrelated = pr({ number: 9, labels: ['agent'], body: 'See #70.' })
    expect(dependabotOutcome(closed, [agentFix])).toBe('agent fix')
    expect(dependabotOutcome(closed, [unrelated])).toBe('closed')
  })

  it('counts outcomes for the month', () => {
    const metrics = computeMetrics(
      month({
        dependabotClosed: [
          pr({ ...dependabot, mergedBy: 'github-actions[bot]' }),
          pr({ ...dependabot, mergedBy: 'github-actions[bot]' }),
          pr({ ...dependabot, mergedAt: null, mergedBy: null }),
        ],
      }),
    )
    expect(metrics.dependabot).toMatchObject({ 'auto-merged': 2, closed: 1, 'agent fix': 0 })
  })
})

describe('agent share and change failure', () => {
  it('counts merged PRs with the agent label', () => {
    const metrics = computeMetrics(month({ merged: [pr({ labels: ['agent'] }), pr({}), pr({})] }))
    expect(metrics.agentShare).toEqual({ agent: 1, total: 3 })
  })

  it('marks a deploy failed when a production-fix or revert PR is merged within 7 days after it', () => {
    const metrics = computeMetrics(
      month({
        deploys: [
          { startedAt: '2026-10-02T00:00:00Z', finishedAt: '2026-10-02T01:00:00Z' },
          { startedAt: '2026-10-20T00:00:00Z', finishedAt: '2026-10-20T01:00:00Z' },
          // Outside the month: not counted.
          { startedAt: '2026-11-02T00:00:00Z', finishedAt: '2026-11-02T01:00:00Z' },
        ],
        merged: [
          pr({ labels: ['production-fix'], mergedAt: '2026-10-05T00:00:00Z' }),
          pr({ title: 'Revert "Something"', mergedAt: '2026-10-01T00:00:00Z' }),
        ],
      }),
    )
    expect(metrics.changeFailure).toEqual({ failed: 1, deploys: 2 })
  })
})

describe('time to patch', () => {
  it('measures alerts fixed in the month from opening to the next production deploy', () => {
    const metrics = computeMetrics(
      month({
        alerts: [
          {
            number: 1,
            severity: 'critical',
            createdAt: '2026-10-01T00:00:00Z',
            fixedAt: '2026-10-02T00:00:00Z',
          },
          {
            number: 2,
            severity: 'high',
            createdAt: '2026-10-10T00:00:00Z',
            fixedAt: '2026-10-30T00:00:00Z',
          },
          {
            number: 3,
            severity: 'low',
            createdAt: '2026-09-01T00:00:00Z',
            fixedAt: '2026-09-02T00:00:00Z',
          },
          { number: 4, severity: 'high', createdAt: '2026-10-01T00:00:00Z', fixedAt: null },
        ],
        deploys: [{ startedAt: '2026-10-02T06:00:00Z', finishedAt: '2026-10-03T00:00:00Z' }],
      }),
    )
    expect(metrics.timeToPatch).toEqual([
      { number: 1, severity: 'critical', hours: 48 },
      { number: 2, severity: 'high', hours: null },
    ])
  })
})

describe('formatMetrics', () => {
  it('prints a Markdown table with readable values', () => {
    const table = formatMetrics(
      computeMetrics(
        month({
          merged: [pr({ labels: ['agent'], headRef: 'a' })],
          ciRuns: [
            {
              headBranch: 'a',
              headSha: 's',
              createdAt: '2026-10-01T09:00:00Z',
              firstAttemptConclusion: 'success',
            },
          ],
          dependabotClosed: [
            pr({
              author: 'dependabot[bot]',
              commitAuthors: ['dependabot[bot]'],
              mergedBy: 'github-actions[bot]',
            }),
          ],
          deploys: [{ startedAt: '2026-10-01T11:00:00Z', finishedAt: '2026-10-04T10:00:00Z' }],
          alerts: [
            {
              number: 5,
              severity: 'high',
              createdAt: '2026-10-01T00:00:00Z',
              fixedAt: '2026-10-01T05:00:00Z',
            },
          ],
        }),
      ),
    )
    expect(table).toContain('| Metric | Value |')
    expect(table).toContain('| First-pass CI | 100% (1 of 1) |')
    expect(table).toContain('| Rework (commits after the first CI run, per PR) | 0.00 |')
    expect(table).toContain('| Median time, PR opened to merged | 2.0 h |')
    expect(table).toContain('| Median time, merged to production | 3.0 days |')
    expect(table).toContain('| Dependabot outcomes | auto-merged: 1 |')
    expect(table).toContain('| Agent share of merged PRs | 100% (1 of 1) |')
    expect(table).toContain('#5 high: 3.4 days')
  })

  it('says n/a when there is nothing to measure', () => {
    const table = formatMetrics(computeMetrics(month({})))
    expect(table).toContain('| First-pass CI | n/a (none) |')
    expect(table).toContain('| Rework (commits after the first CI run, per PR) | n/a |')
    expect(table).toContain('no Dependabot PRs closed')
    expect(table).toContain('no alerts fixed')
  })
})
