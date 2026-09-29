import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POLICIES,
  evaluatePolicies,
  majorVersion,
  productOf,
  type EvaluatedComponent,
  type Policies,
} from '../../src/domain/policy-evaluation'

// Spec 0005 "Evaluation": P1, P3–P8. Reasons are checked by exact text (DR-04, DR-20).

const today = '2026-09-29'

function component(overrides: Partial<EvaluatedComponent> = {}): EvaluatedComponent {
  return {
    id: 'c1',
    name: 'Node.js',
    version: '24.15.0',
    owner: 'Platform team',
    eol: null,
    endOfSupport: null,
    ...overrides,
  }
}

function policies(overrides: Partial<Policies> = {}): Policies {
  return { ...DEFAULT_POLICIES, ...overrides }
}

function reasons(c: EvaluatedComponent, p: Policies = policies()) {
  return evaluatePolicies([c], p, today).map(({ severity, reason }) => ({ severity, reason }))
}

describe('P1: end of support with a 6-month window', () => {
  it.each([
    ['2026-09-28', 'breach', 'Past end of support since 2026-09-28.'],
    ['2026-09-29', 'warning', 'End of support 2026-09-29, within the 6-month warning window.'],
    ['2027-03-29', 'warning', 'End of support 2027-03-29, within the 6-month warning window.'],
  ])('a date of %s is a %s', (date, severity, reason) => {
    expect(reasons(component({ endOfSupport: { date } }))).toEqual([{ severity, reason }])
  })

  it('a date after the window end is not flagged', () => {
    expect(reasons(component({ endOfSupport: { date: '2027-03-30' } }))).toEqual([])
  })

  it('uses the configured window (P2)', () => {
    const later = component({ endOfSupport: { date: '2027-09-29' } })
    expect(reasons(later)).toEqual([])
    expect(reasons(later, policies({ warningMonths: 12 }))).toEqual([
      {
        severity: 'warning',
        reason: 'End of support 2027-09-29, within the 12-month warning window.',
      },
    ])
  })

  it('the default window is 6 months', () => {
    expect(DEFAULT_POLICIES.warningMonths).toBe(6)
  })
})

describe('P3: owner must be a known team', () => {
  const known = policies({ requireKnownOwner: true, teams: ['Platform team', 'Payments'] })

  it('an unknown owner is a warning', () => {
    expect(reasons(component({ owner: 'Somebody' }), known)).toEqual([
      { severity: 'warning', reason: 'Owner "Somebody" is not a known team.' },
    ])
  })

  it('matching ignores case and surrounding spaces', () => {
    expect(reasons(component({ owner: '  platform TEAM ' }), known)).toEqual([])
  })

  it('does nothing while the policy is off', () => {
    expect(reasons(component({ owner: 'Somebody' }), policies({ teams: [] }))).toEqual([])
  })
})

describe('P4: end-of-support date must be known', () => {
  it('a component without a date is a warning when the policy is on', () => {
    expect(reasons(component(), policies({ requireEndOfSupport: true }))).toEqual([
      { severity: 'warning', reason: 'End-of-support date is unknown.' },
    ])
  })

  it('does nothing while the policy is off', () => {
    expect(reasons(component())).toEqual([])
  })
})

describe('P5, P6: technology rules', () => {
  const rule = (overrides: Partial<Policies['technologyRules'][number]>) =>
    policies({
      technologyRules: [
        { product: 'nodejs', rule: 'banned', majorVersion: null, note: null, ...overrides },
      ],
    })
  const node = (version: string) => component({ version, eol: { product: 'nodejs' } })

  it('banned without a version flags every matching component, with the note', () => {
    expect(reasons(node('24'), rule({ note: 'Use Deno instead.' }))).toEqual([
      { severity: 'breach', reason: 'nodejs is banned. Use Deno instead.' },
    ])
  })

  it('banned below N flags only lower major versions', () => {
    expect(reasons(node('20.18.1'), rule({ majorVersion: 22 }))).toEqual([
      { severity: 'breach', reason: 'nodejs below version 22 is banned; this is version 20.' },
    ])
    expect(reasons(node('22.0.0'), rule({ majorVersion: 22 }))).toEqual([])
  })

  it('approved from N flags lower major versions', () => {
    expect(reasons(node('v20'), rule({ rule: 'approved', majorVersion: 22 }))).toEqual([
      { severity: 'breach', reason: 'Version 20 of nodejs is below the approved minimum 22.' },
    ])
    expect(reasons(node('24'), rule({ rule: 'approved', majorVersion: 22 }))).toEqual([])
  })

  it('approved without a minimum flags nothing', () => {
    expect(reasons(node('4'), rule({ rule: 'approved' }))).toEqual([])
  })

  it('products without a rule get no technology flag', () => {
    expect(reasons(component({ eol: { product: 'python' } }), rule({}))).toEqual([])
  })
})

describe('P7: product matching', () => {
  it('uses the endoflife.date product when set', () => {
    expect(productOf({ name: 'Node runtime', eol: { product: 'nodejs' } })).toBe('nodejs')
  })

  it('otherwise uses the lowercased, trimmed name', () => {
    expect(productOf({ name: '  MongoDB ', eol: null })).toBe('mongodb')
    const banned = policies({
      technologyRules: [{ product: 'mongodb', rule: 'banned', majorVersion: null, note: null }],
    })
    expect(reasons(component({ name: 'MongoDB' }), banned)).toEqual([
      { severity: 'breach', reason: 'mongodb is banned.' },
    ])
  })
})

describe('P8: unreadable versions', () => {
  it('majorVersion reads the first whole number', () => {
    expect(majorVersion('24.15')).toBe(24)
    expect(majorVersion('v20')).toBe(20)
    expect(majorVersion('17-alpine')).toBe(17)
    expect(majorVersion('latest')).toBeNull()
  })

  it('a versioned rule on an unreadable version is a warning, never a guess', () => {
    const versioned = policies({
      technologyRules: [{ product: 'nodejs', rule: 'approved', majorVersion: 22, note: null }],
    })
    expect(
      reasons(component({ version: 'latest', eol: { product: 'nodejs' } }), versioned),
    ).toEqual([
      { severity: 'warning', reason: `Version "latest" can't be checked against the nodejs rule.` },
    ])
  })
})

describe('evaluatePolicies', () => {
  it('returns one flag per broken policy, tagged with component and policy', () => {
    const everything = policies({
      requireKnownOwner: true,
      technologyRules: [{ product: 'nodejs', rule: 'approved', majorVersion: 22, note: null }],
    })
    const flags = evaluatePolicies(
      [
        component({
          id: 'a',
          version: '20',
          owner: 'Nobody',
          eol: { product: 'nodejs' },
          endOfSupport: { date: '2026-04-30' },
        }),
        component({ id: 'b', endOfSupport: { date: '2030-01-01' } }),
      ],
      everything,
      today,
    )
    expect(
      flags.map(({ componentId, policy, severity }) => [componentId, policy, severity]),
    ).toEqual([
      ['a', 'end-of-support', 'breach'],
      ['a', 'known-owner', 'warning'],
      ['a', 'technology', 'breach'],
      ['b', 'known-owner', 'warning'],
    ])
  })
})
