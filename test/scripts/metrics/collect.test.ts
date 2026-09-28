import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { collectMonth, type Gh } from '../../../scripts/metrics/collect.ts'

// Spec 0004 M1: collection through a fake gh, and validation of GitHub responses.

const repo = 'owner/repo'

function pull(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `PR ${number}`,
    body: null,
    user: { login: 'owner' },
    labels: [],
    head: { ref: `feat/${number}` },
    created_at: '2026-10-01T08:00:00Z',
    merged_at: '2026-10-01T10:00:00Z',
    closed_at: '2026-10-01T10:00:00Z',
    merged_by: { login: 'owner' },
    ...overrides,
  }
}

function fakeGh(responses: Record<string, unknown>, calls: string[] = []): Gh {
  return (path) => {
    calls.push(path)
    const key = Object.keys(responses).find((prefix) => path.startsWith(prefix))
    if (key === undefined) throw new Error(`Unexpected gh call: ${path}`)
    return JSON.stringify(responses[key])
  }
}

const base = {
  [`repos/${repo}/actions/workflows/ci.yml/runs`]: {
    workflow_runs: [
      {
        id: 10,
        head_branch: 'feat/1',
        head_sha: 'a',
        created_at: '2026-10-01T09:00:00Z',
        updated_at: '2026-10-01T09:05:00Z',
        conclusion: 'success',
        run_attempt: 2,
      },
    ],
  },
  [`repos/${repo}/actions/runs/10/attempts/1`]: { conclusion: 'failure' },
  [`repos/${repo}/actions/workflows/deploy.yml/runs`]: {
    workflow_runs: [
      {
        id: 20,
        head_branch: 'main',
        head_sha: 'd',
        created_at: '2026-10-01T11:00:00Z',
        updated_at: '2026-10-01T12:00:00Z',
        conclusion: 'success',
        run_attempt: 1,
      },
      {
        id: 21,
        head_branch: 'main',
        head_sha: 'e',
        created_at: '2026-10-02T11:00:00Z',
        updated_at: '2026-10-02T11:10:00Z',
        conclusion: 'success',
        run_attempt: 1,
      },
    ],
  },
  [`repos/${repo}/actions/runs/20/jobs`]: {
    jobs: [{ steps: [{ name: 'Swap staging into production', conclusion: 'success' }] }],
  },
  // An infra-only deploy: no swap, so not a production deploy.
  [`repos/${repo}/actions/runs/21/jobs`]: {
    jobs: [{ steps: [{ name: 'Deploy infrastructure', conclusion: 'success' }] }, {}],
  },
  [`repos/${repo}/dependabot/alerts`]: [
    {
      number: 3,
      created_at: '2026-10-01T00:00:00Z',
      fixed_at: '2026-10-01T09:00:00Z',
      security_advisory: { severity: 'high' },
    },
  ],
}

function searchResponse(path: string): unknown {
  const query = decodeURIComponent(path)
  if (query.includes('author:app/dependabot')) return { items: [{ number: 2 }] }
  return { items: [{ number: 1 }] }
}

describe('collectMonth', () => {
  it('collects merged PRs, Dependabot PRs, CI runs, production deploys and fixed alerts', () => {
    const calls: string[] = []
    const responses = {
      ...base,
      [`repos/${repo}/pulls/1`]: pull(1, { body: 'Text', labels: [{ name: 'agent' }] }),
      [`repos/${repo}/pulls/2/commits`]: [
        { author: { login: 'dependabot[bot]' } },
        { author: null },
      ],
      [`repos/${repo}/pulls/2`]: pull(2, {
        user: { login: 'dependabot[bot]' },
        merged_at: null,
        merged_by: null,
      }),
    }
    const gh = fakeGh(responses, calls)
    const data = collectMonth(
      (path) => (path.startsWith('search/') ? JSON.stringify(searchResponse(path)) : gh(path)),
      repo,
      '2026-10',
    )

    expect(data.merged).toEqual([
      expect.objectContaining({
        number: 1,
        labels: ['agent'],
        body: 'Text',
        headRef: 'feat/1',
        commitAuthors: [],
      }),
    ])
    expect(data.dependabotClosed).toEqual([
      expect.objectContaining({
        number: 2,
        author: 'dependabot[bot]',
        body: '',
        mergedBy: null,
        commitAuthors: ['dependabot[bot]', 'unknown'],
      }),
    ])
    expect(data.ciRuns).toEqual([
      {
        headBranch: 'feat/1',
        headSha: 'a',
        createdAt: '2026-10-01T09:00:00Z',
        firstAttemptConclusion: 'failure',
      },
    ])
    expect(data.deploys).toEqual([
      { startedAt: '2026-10-01T11:00:00Z', finishedAt: '2026-10-01T12:00:00Z' },
    ])
    expect(data.alerts).toEqual([
      {
        number: 3,
        severity: 'high',
        createdAt: '2026-10-01T00:00:00Z',
        fixedAt: '2026-10-01T09:00:00Z',
      },
    ])
    // CI runs are looked up 60 days back, so PRs opened before the month still count.
    expect(calls.find((path) => path.includes('ci.yml'))).toContain(
      'created=2026-08-02..2026-10-31',
    )
  })

  it('pages through search results', () => {
    const pages: string[] = []
    const gh: Gh = (path) => {
      if (path.startsWith('search/')) {
        pages.push(path)
        const full = path.endsWith('page=1') && !path.includes('dependabot')
        return JSON.stringify({
          items: full ? Array.from({ length: 100 }, () => ({ number: 1 })) : [],
        })
      }
      if (path.startsWith(`repos/${repo}/pulls/`)) return JSON.stringify(pull(1))
      return fakeGh(base)(path)
    }
    const data = collectMonth(gh, repo, '2026-10')
    expect(data.merged).toHaveLength(100)
    expect(pages.filter((path) => !decodeURIComponent(path).includes('dependabot'))).toHaveLength(2)
  })

  it('rejects unexpected GitHub responses', () => {
    const gh: Gh = (path) =>
      path.startsWith('search/') ? JSON.stringify({ items: [{ number: 'one' }] }) : '{}'
    expect(() => collectMonth(gh, repo, '2026-10')).toThrow(ZodError)
  })

  it('stops loudly instead of undercounting when there are 100 or more fixed alerts', () => {
    const alerts = Array.from({ length: 100 }, (_, index) => ({
      number: index,
      created_at: '2026-10-01T00:00:00Z',
      fixed_at: null,
      security_advisory: { severity: 'low' },
    }))
    const gh = fakeGh({ ...base, [`repos/${repo}/dependabot/alerts`]: alerts })
    expect(() =>
      collectMonth(
        (path) => (path.startsWith('search/') ? JSON.stringify({ items: [] }) : gh(path)),
        repo,
        '2026-10',
      ),
    ).toThrow('add cursor pagination')
  })
})
