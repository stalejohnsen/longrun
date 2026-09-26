import { readFileSync } from 'node:fs'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
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
