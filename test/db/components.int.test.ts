import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { createDb } from '../../src/db/client'
import {
  createComponent,
  deleteComponent,
  endOfSupportOverview,
  getComponent,
  listComponents,
  updateComponent,
  type ComponentData,
} from '../../src/db/components'
import type { Database } from '../../src/db/database'
import { migrateToLatest } from '../../src/db/migrate'
import { createPool } from '../../src/db/pool'
import { endOfSupportWindow } from '../../src/domain/end-of-support-window'
import { databaseConfig, startPostgres } from '../helpers/postgres'

// Spec 0001 data behaviour against real Postgres with the real migrations (ADR 0003/0004).

let container: StartedPostgreSqlContainer
let db: Kysely<Database>

const base: ComponentData = {
  name: 'Node.js',
  version: '24.12.0',
  whereUsed: 'Longrun web app',
  owner: 'Platform team',
  eol: null,
  endOfSupport: null,
}

function manual(name: string, date: string | null): ComponentData {
  return { ...base, name, endOfSupport: date ? { date, source: 'manual' } : null }
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
  test('AC3: a manual date is stored with source manual', async () => {
    const created = await createComponent(db, manual('Node.js', '2028-04-30'))
    expect(await getComponent(db, created.id)).toMatchObject({
      name: 'Node.js',
      endOfSupport: { date: '2028-04-30', source: 'manual' },
      eol: null,
    })
  })

  test('AC4: a component without a date is stored without one', async () => {
    const created = await createComponent(db, base)
    expect((await getComponent(db, created.id))?.endOfSupport).toBeNull()
  })

  test('AC2 (storage): a looked-up date keeps its source, product, release and lookup time', async () => {
    const lookedUpAt = new Date('2026-09-27T08:00:00Z')
    const created = await createComponent(db, {
      ...base,
      eol: { product: 'nodejs', release: '24' },
      endOfSupport: { date: '2028-04-30', source: 'endoflife.date', lookedUpAt },
    })
    expect(await getComponent(db, created.id)).toMatchObject({
      eol: { product: 'nodejs', release: '24' },
      endOfSupport: { date: '2028-04-30', source: 'endoflife.date', lookedUpAt },
    })
  })

  test('calendar dates round-trip unchanged in a non-UTC time zone', async () => {
    // pg's default date parser shifts dates east of UTC (src/db/pool.ts); CI runs in UTC, so
    // force a positive offset for this test.
    const previous = process.env.TZ
    process.env.TZ = 'Europe/Oslo'
    try {
      for (const date of ['2026-03-01', '2026-10-25', '2028-02-29', '2026-12-31']) {
        const created = await createComponent(db, manual(`c-${date}`, date))
        expect((await getComponent(db, created.id))?.endOfSupport?.date).toBe(date)
      }
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })
})

describe('list', () => {
  test('AC5: by end-of-support date ascending, unknown dates last, ties by name', async () => {
    await createComponent(db, manual('Zeta', null))
    await createComponent(db, manual('Beta', '2027-01-01'))
    await createComponent(db, manual('Alpha', '2027-01-01'))
    await createComponent(db, manual('Gamma', '2026-12-01'))
    await createComponent(db, manual('Alpha unknown', null))
    expect((await listComponents(db)).map((c) => c.name)).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
      'Alpha unknown',
      'Zeta',
    ])
  })
})

describe('edit and delete', () => {
  test('AC6: editing updates every field and the update time', async () => {
    const created = await createComponent(db, manual('Node.js', '2028-04-30'))
    const updated = await updateComponent(db, created.id, {
      name: 'PostgreSQL',
      version: '17.11',
      whereUsed: 'Longrun database',
      owner: 'Data team',
      eol: { product: 'postgresql', release: '17' },
      endOfSupport: {
        date: '2029-11-08',
        source: 'endoflife.date',
        lookedUpAt: new Date('2026-09-27T09:00:00Z'),
      },
    })
    expect(updated).toMatchObject({
      name: 'PostgreSQL',
      version: '17.11',
      whereUsed: 'Longrun database',
      owner: 'Data team',
      eol: { product: 'postgresql', release: '17' },
      endOfSupport: { date: '2029-11-08', source: 'endoflife.date' },
    })
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
  })

  test('AC8 (storage): a deleted component is gone', async () => {
    const created = await createComponent(db, base)
    expect(await deleteComponent(db, created.id)).toBe(true)
    expect(await getComponent(db, created.id)).toBeUndefined()
    expect(await listComponents(db)).toEqual([])
  })

  test('E8: editing or deleting a component that no longer exists reports not found', async () => {
    const created = await createComponent(db, base)
    await deleteComponent(db, created.id)
    expect(await updateComponent(db, created.id, base)).toBeUndefined()
    expect(await deleteComponent(db, created.id)).toBe(false)
  })

  test.each(['not-a-uuid', "'; drop table components; --", ''])(
    'E8: id %j that is not a UUID is treated as not found',
    async (id) => {
      expect(await getComponent(db, id)).toBeUndefined()
      expect(await updateComponent(db, id, base)).toBeUndefined()
      expect(await deleteComponent(db, id)).toBe(false)
    },
  )
})

describe('end-of-support overview', () => {
  const now = new Date('2026-09-27T12:00:00Z')

  test('AC9: the window includes today + N months and excludes the day after', async () => {
    await createComponent(db, manual('On the edge', '2027-09-27'))
    await createComponent(db, manual('One day later', '2027-09-28'))
    const overview = await endOfSupportOverview(db, endOfSupportWindow(12, now))
    expect(overview.withinWindow.map((c) => c.name)).toEqual(['On the edge'])
  })

  test('AC10: a date of today is in the window, not already unsupported', async () => {
    await createComponent(db, manual('Ends today', '2026-09-27'))
    const overview = await endOfSupportOverview(db, endOfSupportWindow(12, now))
    expect(overview.withinWindow.map((c) => c.name)).toEqual(['Ends today'])
    expect(overview.alreadyUnsupported).toEqual([])
  })

  test('AC11: past dates are listed as already unsupported, by date then name', async () => {
    await createComponent(db, manual('Yesterday B', '2026-09-26'))
    await createComponent(db, manual('Yesterday A', '2026-09-26'))
    await createComponent(db, manual('Long ago', '2020-01-01'))
    const overview = await endOfSupportOverview(db, endOfSupportWindow(12, now))
    expect(overview.alreadyUnsupported.map((c) => c.name)).toEqual([
      'Long ago',
      'Yesterday A',
      'Yesterday B',
    ])
  })

  test('AC12: components without a date are excluded and counted', async () => {
    await createComponent(db, manual('Unknown 1', null))
    await createComponent(db, manual('Unknown 2', null))
    await createComponent(db, manual('Known', '2027-01-01'))
    const overview = await endOfSupportOverview(db, endOfSupportWindow(12, now))
    expect(overview.withinWindow.map((c) => c.name)).toEqual(['Known'])
    expect(overview.alreadyUnsupported).toEqual([])
    expect(overview.withoutDateCount).toBe(2)
  })
})

describe('database constraints (defence in depth)', () => {
  test.each([
    ['name too long', { name: 'x'.repeat(101) }],
    ['name not trimmed', { name: ' Node.js' }],
    ['product without release', { eol_product: 'nodejs' }],
    ['product with disallowed characters', { eol_product: '../x', eol_release: '1' }],
    ['date without source', { end_of_support: '2027-01-01' }],
    ['source without date', { date_source: 'manual' }],
    [
      'looked-up date without lookup time',
      { end_of_support: '2027-01-01', date_source: 'endoflife.date' },
    ],
    [
      'lookup time on a manual date',
      { end_of_support: '2027-01-01', date_source: 'manual', looked_up_at: new Date() },
    ],
    ['unknown source', { end_of_support: '2027-01-01', date_source: 'guess' }],
  ])('rejects a row with %s', async (_case, overrides) => {
    const row = {
      name: 'Node.js',
      version: '24',
      where_used: 'web app',
      owner: 'team',
      ...overrides,
    }
    await expect(
      db
        .insertInto('components')
        .values(row as never)
        .execute(),
    ).rejects.toThrow(/violates check constraint/)
  })
})
