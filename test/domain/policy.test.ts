import { describe, expect, it } from 'vitest'
import {
  policySettingsInputSchema,
  teamInputSchema,
  technologyRuleInputSchema,
} from '../../src/domain/policy'

// Spec 0005 E1: input rules for policies, technology rules and teams (DR-06: messages name
// the fix and never echo the rejected value).

function errors(result: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
  )
}

describe('policy settings', () => {
  it('accepts a window and reads checkboxes', () => {
    expect(
      policySettingsInputSchema.parse({ warningMonths: ' 12 ', requireKnownOwner: 'on' }),
    ).toEqual({
      warningMonths: 12,
      requireKnownOwner: true,
      requireEndOfSupport: false,
    })
  })

  it.each(['0', '37', '1.5', 'six', '', '-1'])('rejects a window of %j', (value) => {
    expect(errors(policySettingsInputSchema.safeParse({ warningMonths: value }))).toEqual({
      warningMonths: 'Enter a whole number from 1 to 36.',
    })
  })
})

describe('technology rules', () => {
  it('accepts a full rule and trims', () => {
    expect(
      technologyRuleInputSchema.parse({
        product: ' nodejs ',
        rule: 'approved',
        majorVersion: '22',
        note: ' Use the LTS. ',
      }),
    ).toEqual({ product: 'nodejs', rule: 'approved', majorVersion: 22, note: 'Use the LTS.' })
  })

  it('treats empty optional fields as not given', () => {
    expect(
      technologyRuleInputSchema.parse({
        product: 'mongodb',
        rule: 'banned',
        majorVersion: ' ',
        note: '',
      }),
    ).toEqual({ product: 'mongodb', rule: 'banned', majorVersion: undefined, note: undefined })
  })

  it('rejects invalid fields with messages that name the fix', () => {
    expect(
      errors(
        technologyRuleInputSchema.safeParse({
          product: 'Node JS',
          rule: 'maybe',
          majorVersion: '1000',
          note: 'x'.repeat(201),
        }),
      ),
    ).toEqual({
      product:
        'Use lowercase letters, digits, dots, underscores or hyphens (as on endoflife.date).',
      rule: 'Choose approved or banned.',
      majorVersion: 'Enter a whole number from 0 to 999.',
      note: 'Use at most 200 characters.',
    })
  })

  it('requires a product', () => {
    expect(errors(technologyRuleInputSchema.safeParse({ product: '  ', rule: 'banned' }))).toEqual({
      product: 'Enter a value.',
    })
  })
})

describe('teams', () => {
  it('trims and limits team names', () => {
    expect(teamInputSchema.parse({ name: '  Platform team ' })).toEqual({ name: 'Platform team' })
    expect(errors(teamInputSchema.safeParse({ name: ' ' }))).toEqual({ name: 'Enter a value.' })
    expect(errors(teamInputSchema.safeParse({ name: 'x'.repeat(101) }))).toEqual({
      name: 'Use at most 100 characters.',
    })
  })
})
