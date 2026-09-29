import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createDb } from '../../src/db/client'
import { createComponent, endOfSupportOverview, listComponents } from '../../src/db/components'
import type { Database } from '../../src/db/database'
import { migrateToLatest } from '../../src/db/migrate'
import { createPool } from '../../src/db/pool'
import { endOfSupportWindow } from '../../src/domain/end-of-support-window'
import { databaseConfig, startPostgres } from '../helpers/postgres'

// Spec 0005 "Data" and P15, against real Postgres with the real migrations (DR-19).

let container: StartedPostgreSqlContainer
let db: Kysely<Database>

beforeAll(async () => {
  container = await startPostgres()
  db = createDb(createPool(databaseConfig(container)))
  await migrateToLatest(db as unknown as Kysely<unknown>, 'migrations')
})

afterAll(async () => {
  await db?.destroy()
  await container?.stop()
})

async function rejects(statement: ReturnType<typeof sql>, pattern: RegExp) {
  await expect(statement.execute(db)).rejects.toThrow(pattern)
}

describe('policy settings', () => {
  test('one row with the defaults is seeded', async () => {
    expect(await db.selectFrom('policy_settings').selectAll().execute()).toEqual([
      expect.objectContaining({
        id: 1,
        eos_warning_months: 6,
        require_known_owner: false,
        require_end_of_support: false,
        updated_by: null,
      }),
    ])
  })

  test('there can be only one row, and the window stays within 1–36', async () => {
    await rejects(sql`insert into policy_settings (id) values (2)`, /check constraint/)
    await rejects(sql`insert into policy_settings default values`, /duplicate key/)
    await rejects(sql`update policy_settings set eos_warning_months = 0`, /check constraint/)
    await rejects(sql`update policy_settings set eos_warning_months = 37`, /check constraint/)
  })
})

describe('technology rules', () => {
  test('stores a valid rule', async () => {
    await sql`insert into technology_rules (product, rule, major_version, note, updated_by)
      values ('nodejs', 'approved', 22, 'Use the LTS.', 'user-1')`.execute(db)
    expect(
      await db
        .selectFrom('technology_rules')
        .select(['product', 'rule', 'major_version'])
        .execute(),
    ).toEqual([{ product: 'nodejs', rule: 'approved', major_version: 22 }])
  })

  test.each([
    ['a product outside the endoflife.date format', 'Node JS', 'banned', null, null],
    ['an unknown rule', 'ruby', 'maybe', null, null],
    ['a major version above 999', 'ruby', 'banned', 1000, null],
    ['an empty note', 'ruby', 'banned', null, ''],
    ['a note with surrounding spaces', 'ruby', 'banned', null, ' x'],
    ['a note over 200 characters', 'ruby', 'banned', null, 'x'.repeat(201)],
  ])('rejects %s', async (_case, product, rule, majorVersion, note) => {
    await rejects(
      sql`insert into technology_rules (product, rule, major_version, note, updated_by)
        values (${product}, ${rule}, ${majorVersion}, ${note}, 'u')`,
      /check constraint/,
    )
  })

  test('a product has at most one rule (spec 0005 E2)', async () => {
    await rejects(
      sql`insert into technology_rules (product, rule, updated_by) values ('nodejs', 'banned', 'u')`,
      /duplicate key/,
    )
  })
})

describe('teams', () => {
  test('team names are unique regardless of case (spec 0005 E2)', async () => {
    await sql`insert into teams (name, created_by) values ('Platform team', 'user-1')`.execute(db)
    await rejects(
      sql`insert into teams (name, created_by) values ('PLATFORM TEAM', 'user-2')`,
      /duplicate key/,
    )
  })

  test('names are 1–100 characters without surrounding spaces', async () => {
    await rejects(sql`insert into teams (name, created_by) values ('', 'u')`, /check constraint/)
    await rejects(sql`insert into teams (name, created_by) values (' x', 'u')`, /check constraint/)
    await rejects(
      sql`insert into teams (name, created_by) values (${'x'.repeat(101)}, 'u')`,
      /check constraint/,
    )
  })
})

describe('P15: expand-only', () => {
  test('spec 0001 queries work unchanged after the migration', async () => {
    await createComponent(db, {
      name: 'Node.js',
      version: '24',
      whereUsed: 'Longrun',
      owner: 'Platform team',
      eol: null,
      endOfSupport: { date: '2027-01-31', source: 'manual' },
    })
    expect((await listComponents(db)).map((component) => component.name)).toEqual(['Node.js'])
    const overview = await endOfSupportOverview(
      db,
      endOfSupportWindow(12, new Date('2026-09-29T12:00:00Z')),
    )
    expect(overview.withinWindow.map((component) => component.name)).toEqual(['Node.js'])
  })

  test('the components table is unchanged', async () => {
    const columns = await sql<{ column_name: string }>`
      select column_name from information_schema.columns
      where table_name = 'components' order by ordinal_position`.execute(db)
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'id',
      'name',
      'version',
      'where_used',
      'owner',
      'eol_product',
      'eol_release',
      'end_of_support',
      'date_source',
      'looked_up_at',
      'created_at',
      'updated_at',
    ])
  })
})
