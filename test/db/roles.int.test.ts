import { readFileSync } from 'node:fs'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg from 'pg'
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createDb } from '../../src/db/client'
import { migrateToLatest } from '../../src/db/migrate'
import { createPool } from '../../src/db/pool'
import { startPostgres } from '../helpers/postgres'

// ADR 0004: the app role can read and write data but cannot change the schema.
// Uses the same grants file the owner runs in Azure (infra/database/grants.sql).
// In Azure the login roles are created with pgaadauth_create_principal_with_oid; here they
// are plain password logins inside a throwaway container.

let container: StartedPostgreSqlContainer
const password = 'container-only'

async function connectAs(user: string): Promise<pg.Client> {
  const client = new pg.Client({
    host: container.getHost(),
    port: container.getPort(),
    database: 'longrun',
    user,
    password,
  })
  await client.connect()
  return client
}

beforeAll(async () => {
  container = await startPostgres('longrun')
  const admin = new pg.Client({ connectionString: container.getConnectionUri() })
  await admin.connect()
  try {
    for (const role of ['longrun_migrator', 'longrun_app_production', 'longrun_app_staging']) {
      await admin.query(`create role ${role} login password '${password}'`)
    }
    const grants = readFileSync('infra/database/grants.sql', 'utf8')
    await admin.query(grants)
    // Idempotent: running it twice must not fail.
    await admin.query(grants)
  } finally {
    await admin.end()
  }

  const migrator = await connectAs('longrun_migrator')
  try {
    await migrator.query('create table probe (id serial primary key, value text not null)')
  } finally {
    await migrator.end()
  }

  // The real migrations, run as the migrator as in CI (ADR 0004), so default privileges apply.
  const migratorDb = createDb(
    createPool({
      host: container.getHost(),
      port: container.getPort(),
      name: 'longrun',
      user: 'longrun_migrator',
      password,
      ssl: false,
      managedIdentityClientId: undefined,
    }),
  )
  try {
    await migrateToLatest(migratorDb as unknown as Kysely<unknown>, 'migrations')
  } finally {
    await migratorDb.destroy()
  }
})

afterAll(async () => {
  await container?.stop()
})

describe.each(['longrun_app_production', 'longrun_app_staging'])('%s', (role) => {
  test('can read and write rows in tables created by the migrator', async () => {
    const app = await connectAs(role)
    try {
      await app.query('insert into probe (value) values ($1)', [role])
      const result = await app.query<{ value: string }>(
        'select value from probe where value = $1',
        [role],
      )
      expect(result.rows).toEqual([{ value: role }])
      await app.query('update probe set value = $1 where value = $2', [`${role}-updated`, role])
      await app.query('delete from probe where value = $1', [`${role}-updated`])
    } finally {
      await app.end()
    }
  })

  test('can read and write the spec 0005 policy tables (default privileges)', async () => {
    const app = await connectAs(role)
    try {
      await app.query('update policy_settings set eos_warning_months = 12, updated_by = $1', [role])
      await app.query(
        "insert into technology_rules (product, rule, updated_by) values ($1, 'banned', $1)",
        [`p-${role.replace('longrun_app_', '')}`],
      )
      await app.query('insert into teams (name, created_by) values ($1, $1)', [role])
      const teams = await app.query<{ name: string }>('select name from teams where name = $1', [
        role,
      ])
      expect(teams.rows).toEqual([{ name: role }])
      await app.query('delete from teams where name = $1', [role])
    } finally {
      await app.end()
    }
  })

  test.each([
    ['create a table', 'create table not_allowed (id int)'],
    ['alter a table', 'alter table probe add column extra text'],
    ['drop a table', 'drop table probe'],
    ['truncate a table', 'truncate probe'],
  ])('cannot %s', async (_action, statement) => {
    const app = await connectAs(role)
    try {
      await expect(app.query(statement)).rejects.toThrow(/permission denied|must be owner/)
    } finally {
      await app.end()
    }
  })
})
