import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDb } from '../../src/db/client'
import { createComponent, getComponent, listComponents } from '../../src/db/components'
import type { Database } from '../../src/db/database'
import { migrateToLatest } from '../../src/db/migrate'
import { createPool } from '../../src/db/pool'
import {
  editComponent,
  lookUpAgain,
  MESSAGES,
  registerComponent,
  type ServiceDeps,
} from '../../src/lib/component-service'
import type { LookupResult } from '../../src/lib/endoflife'
import { databaseConfig, startPostgres } from '../helpers/postgres'

// Spec 0001 register/edit/look-up-again behaviour against real Postgres, with a stub lookup.

let container: StartedPostgreSqlContainer
let db: Kysely<Database>
const now = new Date('2026-09-27T12:00:00Z')

function deps(result: LookupResult = { kind: 'found', date: '2028-04-30' }) {
  const lookUp = vi.fn(async () => result)
  return { deps: { db, lookUp, now: () => now } satisfies ServiceDeps, lookUp }
}

function form(fields: Record<string, string | Blob>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

const required = {
  name: 'Node.js',
  version: '24.12.0',
  whereUsed: 'Longrun web app',
  owner: 'Platform team',
}

beforeAll(async () => {
  container = await startPostgres()
  db = createDb(createPool(databaseConfig(container)))
  await migrateToLatest(db as unknown as Kysely<unknown>, 'migrations')
})

afterAll(async () => {
  await db?.destroy()
  await container?.stop()
})

beforeEach(async () => {
  await sql`truncate components`.execute(db)
})

describe('register', () => {
  test('AC2: a found endoflife.date date is stored with its source and lookup time', async () => {
    const { deps: d, lookUp } = deps({ kind: 'found', date: '2028-04-30' })
    const result = await registerComponent(
      d,
      form({ ...required, eolProduct: 'nodejs', eolRelease: '24' }),
    )
    expect(lookUp).toHaveBeenCalledWith('nodejs', '24')
    expect(result).toMatchObject({
      ok: true,
      component: {
        endOfSupport: { date: '2028-04-30', source: 'endoflife.date', lookedUpAt: now },
      },
    })
  })

  test('AC3: without a product, a manual date is stored as manual and no lookup happens', async () => {
    const { deps: d, lookUp } = deps()
    const result = await registerComponent(
      d,
      form({ ...required, manualEndOfSupport: '2027-06-30' }),
    )
    expect(lookUp).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: true,
      component: { endOfSupport: { date: '2027-06-30', source: 'manual' } },
    })
  })

  test('AC4: without a product and without a date, the component has no date', async () => {
    const { deps: d } = deps()
    const result = await registerComponent(d, form(required))
    expect(result).toMatchObject({ ok: true, component: { endOfSupport: null } })
  })

  test('Q3: a found date wins over a manual date', async () => {
    const { deps: d } = deps({ kind: 'found', date: '2028-04-30' })
    const result = await registerComponent(
      d,
      form({
        ...required,
        eolProduct: 'nodejs',
        eolRelease: '24',
        manualEndOfSupport: '2030-01-01',
      }),
    )
    expect(result).toMatchObject({
      ok: true,
      component: { endOfSupport: { date: '2028-04-30', source: 'endoflife.date' } },
    })
  })

  test('no announced date: the manual date is used when given', async () => {
    const { deps: d } = deps({ kind: 'no-date' })
    const result = await registerComponent(
      d,
      form({
        ...required,
        eolProduct: 'nodejs',
        eolRelease: '26',
        manualEndOfSupport: '2030-01-01',
      }),
    )
    expect(result).toMatchObject({
      ok: true,
      component: { endOfSupport: { date: '2030-01-01', source: 'manual' } },
    })
  })

  test('no announced date and no manual date: saved without a date, with a notice', async () => {
    const { deps: d } = deps({ kind: 'no-date' })
    const result = await registerComponent(
      d,
      form({ ...required, eolProduct: 'nodejs', eolRelease: '26' }),
    )
    expect(result).toMatchObject({
      ok: true,
      notice: 'eol-no-date',
      component: { endOfSupport: null, eol: { product: 'nodejs', release: '26' } },
    })
  })

  test('E5: not found on endoflife.date → error on the product field, nothing saved, values kept', async () => {
    const { deps: d } = deps({ kind: 'not-found' })
    const result = await registerComponent(
      d,
      form({ ...required, eolProduct: 'nodejs', eolRelease: '999' }),
    )
    expect(result).toEqual({
      ok: false,
      state: {
        fieldErrors: { eolProduct: MESSAGES.notFoundOnEndOfLife },
        formError: undefined,
        values: { ...required, eolProduct: 'nodejs', eolRelease: '999', manualEndOfSupport: '' },
      },
    })
    expect(await listComponents(db)).toEqual([])
  })

  test('E6: lookup unavailable → form error, nothing saved, values kept', async () => {
    const { deps: d } = deps({ kind: 'unavailable' })
    const result = await registerComponent(
      d,
      form({ ...required, eolProduct: 'nodejs', eolRelease: '24' }),
    )
    expect(result).toMatchObject({
      ok: false,
      state: { formError: MESSAGES.lookupUnavailable, fieldErrors: {} },
    })
    expect(await listComponents(db)).toEqual([])
  })

  test('E1/E2/E3: invalid input returns per-field errors, keeps the values, saves nothing and does not look up', async () => {
    const { deps: d, lookUp } = deps()
    const result = await registerComponent(
      d,
      form({
        name: '  ',
        version: 'x'.repeat(51),
        whereUsed: 'app',
        owner: 'team',
        eolProduct: 'nodejs',
      }),
    )
    expect(result).toMatchObject({
      ok: false,
      state: {
        fieldErrors: {
          name: 'Enter a value.',
          version: 'Use at most 50 characters.',
          eolRelease: 'Enter the release too.',
        },
        values: {
          name: '  ',
          whereUsed: 'app',
          owner: 'team',
          eolProduct: 'nodejs',
          eolRelease: '',
        },
      },
    })
    expect(lookUp).not.toHaveBeenCalled()
    expect(await listComponents(db)).toEqual([])
  })

  test('E4: disallowed product characters never reach the lookup', async () => {
    const { deps: d, lookUp } = deps()
    const result = await registerComponent(
      d,
      form({ ...required, eolProduct: '../admin', eolRelease: '24' }),
    )
    expect(result).toMatchObject({ ok: false })
    expect(lookUp).not.toHaveBeenCalled()
  })

  test('E9: a file instead of text is rejected and not echoed back', async () => {
    const { deps: d } = deps()
    const result = await registerComponent(d, form({ ...required, name: new File(['x'], 'x.txt') }))
    expect(result).toMatchObject({
      ok: false,
      state: { fieldErrors: { name: 'Enter a value.' }, values: { name: '' } },
    })
  })

  test('fields that are not part of the form are ignored', async () => {
    const { deps: d } = deps()
    const result = await registerComponent(
      d,
      form({ ...required, id: '00000000-0000-4000-8000-000000000000', $ACTION_ID_x: '1' }),
    )
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.component.id).not.toBe('00000000-0000-4000-8000-000000000000')
  })
})

describe('edit', () => {
  test('AC7: changing the release triggers a new lookup and updates date, source and lookup time', async () => {
    const existing = await createComponent(db, {
      ...required,
      eol: { product: 'nodejs', release: '22' },
      endOfSupport: {
        date: '2027-04-30',
        source: 'endoflife.date',
        lookedUpAt: new Date('2026-01-01T00:00:00Z'),
      },
    })
    const { deps: d, lookUp } = deps({ kind: 'found', date: '2028-04-30' })
    const result = await editComponent(
      d,
      existing.id,
      form({ ...required, eolProduct: 'nodejs', eolRelease: '24' }),
    )
    expect(lookUp).toHaveBeenCalledWith('nodejs', '24')
    expect(result).toMatchObject({
      ok: true,
      component: { endOfSupport: { date: '2028-04-30', lookedUpAt: now } },
    })
  })

  test('unchanged product and release keep the stored looked-up date without a lookup', async () => {
    const lookedUpAt = new Date('2026-01-01T00:00:00Z')
    const existing = await createComponent(db, {
      ...required,
      eol: { product: 'nodejs', release: '24' },
      endOfSupport: { date: '2028-04-30', source: 'endoflife.date', lookedUpAt },
    })
    const { deps: d, lookUp } = deps()
    const result = await editComponent(
      d,
      existing.id,
      form({ ...required, owner: 'New team', eolProduct: 'nodejs', eolRelease: '24' }),
    )
    expect(lookUp).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: true,
      component: { owner: 'New team', endOfSupport: { date: '2028-04-30', lookedUpAt } },
    })
  })

  test('removing the product and release switches to the manual date', async () => {
    const existing = await createComponent(db, {
      ...required,
      eol: { product: 'nodejs', release: '24' },
      endOfSupport: { date: '2028-04-30', source: 'endoflife.date', lookedUpAt: now },
    })
    const { deps: d } = deps()
    const result = await editComponent(
      d,
      existing.id,
      form({ ...required, manualEndOfSupport: '2029-01-01' }),
    )
    expect(result).toMatchObject({
      ok: true,
      component: { eol: null, endOfSupport: { date: '2029-01-01', source: 'manual' } },
    })
  })

  test('unchanged product and release with no announced date: the manual date applies, no lookup', async () => {
    const existing = await createComponent(db, {
      ...required,
      eol: { product: 'nodejs', release: '26' },
      endOfSupport: null,
    })
    const { deps: d, lookUp } = deps()
    const result = await editComponent(
      d,
      existing.id,
      form({
        ...required,
        eolProduct: 'nodejs',
        eolRelease: '26',
        manualEndOfSupport: '2030-06-30',
      }),
    )
    expect(lookUp).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: true,
      component: { endOfSupport: { date: '2030-06-30', source: 'manual' } },
    })
  })

  test('E1: invalid input when editing returns per-field errors and changes nothing', async () => {
    const existing = await createComponent(db, { ...required, eol: null, endOfSupport: null })
    const { deps: d } = deps()
    const result = await editComponent(d, existing.id, form({ ...required, owner: ' ' }))
    expect(result).toMatchObject({ ok: false, state: { fieldErrors: { owner: 'Enter a value.' } } })
    expect((await getComponent(db, existing.id))?.owner).toBe('Platform team')
  })

  test.each([
    [{ kind: 'not-found' }, { fieldErrors: { eolProduct: MESSAGES.notFoundOnEndOfLife } }],
    [{ kind: 'unavailable' }, { formError: MESSAGES.lookupUnavailable, fieldErrors: {} }],
  ] as const)('a failed lookup when editing (%o) changes nothing', async (result, expected) => {
    const existing = await createComponent(db, {
      ...required,
      eol: { product: 'nodejs', release: '22' },
      endOfSupport: { date: '2027-04-30', source: 'endoflife.date', lookedUpAt: now },
    })
    const { deps: d } = deps(result)
    const outcome = await editComponent(
      d,
      existing.id,
      form({ ...required, eolProduct: 'nodejs', eolRelease: '24' }),
    )
    expect(outcome).toMatchObject({ ok: false, state: expected })
    expect((await getComponent(db, existing.id))?.eol).toEqual({ product: 'nodejs', release: '22' })
  })

  test('a changed release with no announced date saves without a date and returns the notice', async () => {
    const existing = await createComponent(db, {
      ...required,
      eol: { product: 'nodejs', release: '24' },
      endOfSupport: { date: '2028-04-30', source: 'endoflife.date', lookedUpAt: now },
    })
    const { deps: d } = deps({ kind: 'no-date' })
    expect(
      await editComponent(
        d,
        existing.id,
        form({ ...required, eolProduct: 'nodejs', eolRelease: '26' }),
      ),
    ).toMatchObject({ ok: true, notice: 'eol-no-date', component: { endOfSupport: null } })
  })

  test('E8: editing a component that no longer exists reports not found', async () => {
    const { deps: d } = deps()
    expect(await editComponent(d, '11111111-2222-4333-8444-555555555555', form(required))).toEqual({
      ok: false,
      notFound: true,
    })
  })
})

describe('look up again (AC7a)', () => {
  async function stored() {
    return createComponent(db, {
      ...required,
      eol: { product: 'nodejs', release: '24' },
      endOfSupport: {
        date: '2028-04-30',
        source: 'endoflife.date',
        lookedUpAt: new Date('2026-01-01T00:00:00Z'),
      },
    })
  }

  test('a different date from endoflife.date replaces the stored date and updates the lookup time', async () => {
    const existing = await stored()
    const { deps: d } = deps({ kind: 'found', date: '2028-10-31' })
    expect(await lookUpAgain(d, existing.id)).toMatchObject({
      ok: true,
      changed: true,
      component: { endOfSupport: { date: '2028-10-31', lookedUpAt: now } },
    })
  })

  test.each([{ kind: 'unavailable' }, { kind: 'not-found' }, { kind: 'no-date' }] as const)(
    'on %o the stored date is kept and the user is told',
    async (result) => {
      const existing = await stored()
      const { deps: d } = deps(result)
      const outcome = await lookUpAgain(d, existing.id)
      expect(outcome).toMatchObject({
        ok: false,
        reason: result.kind,
        message: expect.stringMatching(/stored date is kept/),
      })
      expect((await getComponent(db, existing.id))?.endOfSupport).toMatchObject({
        date: '2028-04-30',
      })
    },
  )

  test('a component without a product and release cannot be looked up', async () => {
    const existing = await createComponent(db, { ...required, eol: null, endOfSupport: null })
    const { deps: d, lookUp } = deps()
    expect(await lookUpAgain(d, existing.id)).toMatchObject({
      ok: false,
      reason: 'no-eol',
      message: 'This component has no endoflife.date product and release.',
    })
    expect(lookUp).not.toHaveBeenCalled()
  })

  test('the same date from endoflife.date still refreshes the lookup time', async () => {
    const existing = await stored()
    const { deps: d } = deps({ kind: 'found', date: '2028-04-30' })
    expect(await lookUpAgain(d, existing.id)).toMatchObject({
      ok: true,
      changed: false,
      component: { endOfSupport: { date: '2028-04-30', lookedUpAt: now } },
    })
  })

  test('E8: a component that no longer exists reports not found', async () => {
    const { deps: d } = deps()
    expect(await lookUpAgain(d, '11111111-2222-4333-8444-555555555555')).toEqual({
      ok: false,
      notFound: true,
    })
  })
})

describe('E10: database unavailable', () => {
  test('saving fails with an error (the page shows a generic error)', async () => {
    const broken = createDb(createPool({ ...databaseConfig(container), port: 1 }))
    try {
      await expect(
        registerComponent(
          { db: broken, lookUp: async () => ({ kind: 'no-date' }), now: () => now },
          form(required),
        ),
      ).rejects.toThrow()
    } finally {
      await broken.destroy()
    }
  })
})
