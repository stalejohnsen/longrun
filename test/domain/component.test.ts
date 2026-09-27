import { describe, expect, test } from 'vitest'
import { componentInputSchema, LIMITS } from '../../src/domain/component'

const valid = {
  name: 'Node.js',
  version: '24.12.0',
  whereUsed: 'Longrun web app',
  owner: 'Platform team',
}

function fieldErrors(input: Record<string, unknown>) {
  const result = componentInputSchema.safeParse(input)
  if (result.success) return {}
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  )
}

describe('component input (spec 0001 Data)', () => {
  test('accepts the required fields and trims them', () => {
    const result = componentInputSchema.parse({
      name: '  Node.js ',
      version: ' 24.12.0',
      whereUsed: 'Longrun web app ',
      owner: ' Platform team ',
    })
    expect(result).toEqual({ ...valid })
  })

  test('accepts an endoflife.date product and release, and a manual date', () => {
    expect(
      componentInputSchema.parse({
        ...valid,
        eolProduct: 'nodejs',
        eolRelease: '24',
        manualEndOfSupport: '2028-04-30',
      }),
    ).toMatchObject({ eolProduct: 'nodejs', eolRelease: '24', manualEndOfSupport: '2028-04-30' })
  })

  test('treats empty optional fields as not given', () => {
    const result = componentInputSchema.parse({
      ...valid,
      eolProduct: ' ',
      eolRelease: '',
      manualEndOfSupport: '',
    })
    expect(result.eolProduct).toBeUndefined()
    expect(result.eolRelease).toBeUndefined()
    expect(result.manualEndOfSupport).toBeUndefined()
  })

  test.each(['name', 'version', 'whereUsed', 'owner'])(
    'E1: %s that is missing, empty or whitespace is rejected',
    (field) => {
      expect(fieldErrors({ ...valid, [field]: undefined })[field]).toBe('Enter a value.')
      expect(fieldErrors({ ...valid, [field]: '' })[field]).toBe('Enter a value.')
      expect(fieldErrors({ ...valid, [field]: '   ' })[field]).toBe('Enter a value.')
    },
  )

  test.each([
    ['name', LIMITS.name],
    ['version', LIMITS.version],
    ['whereUsed', LIMITS.whereUsed],
    ['owner', LIMITS.owner],
  ] as const)('E2: %s accepts %i characters and rejects one more', (field, max) => {
    expect(fieldErrors({ ...valid, [field]: 'x'.repeat(max) })[field]).toBeUndefined()
    expect(fieldErrors({ ...valid, [field]: 'x'.repeat(max + 1) })[field]).toBe(
      `Use at most ${max} characters.`,
    )
  })

  test('E3: a product without a release, or a release without a product, is rejected', () => {
    expect(fieldErrors({ ...valid, eolProduct: 'nodejs' })).toEqual({
      eolRelease: 'Enter the release too.',
    })
    expect(fieldErrors({ ...valid, eolRelease: '24' })).toEqual({
      eolProduct: 'Enter the product too.',
    })
  })

  test.each(['../etc', 'node/js', 'node js', 'NodeJS', 'nodejs?x=1', '%2e%2e'])(
    'E4: product %j with disallowed characters is rejected',
    (product) => {
      expect(fieldErrors({ ...valid, eolProduct: product, eolRelease: '24' }).eolProduct).toMatch(
        /^Use lowercase letters/,
      )
    },
  )

  test.each(['../24', '24/lts', '24 lts', '24#x'])(
    'E4: release %j with disallowed characters is rejected',
    (release) => {
      expect(
        fieldErrors({ ...valid, eolProduct: 'nodejs', eolRelease: release }).eolRelease,
      ).toMatch(/^Use letters/)
    },
  )

  test('E4: product and release longer than their limits are rejected', () => {
    const errors = fieldErrors({
      ...valid,
      eolProduct: 'a'.repeat(LIMITS.eolProduct + 1),
      eolRelease: '1'.repeat(LIMITS.eolRelease + 1),
    })
    expect(errors.eolProduct).toBe(`Use at most ${LIMITS.eolProduct} characters.`)
    expect(errors.eolRelease).toBe(`Use at most ${LIMITS.eolRelease} characters.`)
  })

  test.each(['2026-02-30', '2026-02-29', '2026-13-01', '30.04.2028', 'tomorrow'])(
    'E7: manual date %j that is not a valid calendar date is rejected',
    (date) => {
      expect(fieldErrors({ ...valid, manualEndOfSupport: date }).manualEndOfSupport).toBe(
        'Enter a valid date (YYYY-MM-DD).',
      )
    },
  )

  test('E7: a leap day in a leap year is accepted', () => {
    expect(fieldErrors({ ...valid, manualEndOfSupport: '2028-02-29' })).toEqual({})
  })

  test('E9: a field that is not text (for example a file) is rejected', () => {
    const file = new File(['x'], 'x.txt')
    expect(fieldErrors({ ...valid, name: file }).name).toBe('Enter a value.')
    expect(fieldErrors({ ...valid, eolProduct: file }).eolProduct).toBe('Enter text.')
  })

  test('error messages never contain the rejected value', () => {
    const secretLooking = 'x'.repeat(LIMITS.owner) + 'leaked-value'
    expect(JSON.stringify(fieldErrors({ ...valid, owner: secretLooking }))).not.toContain(
      'leaked-value',
    )
  })
})
