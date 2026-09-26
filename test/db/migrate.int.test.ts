import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg from 'pg'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { databaseEnv, startPostgres } from '../helpers/postgres'

const run = promisify(execFile)
let container: StartedPostgreSqlContainer

beforeAll(async () => {
  container = await startPostgres()
})

afterAll(async () => {
  await container?.stop()
})

// Runs the real CLI with plain Node (built-in TypeScript support), as CI will (ADR 0004).
async function migrate() {
  const { stdout } = await run(
    process.execPath,
    ['scripts/migrate.ts', 'test/fixtures/migrations'],
    {
      env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', ...databaseEnv(container) },
    },
  )
  return stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { msg: string; applied?: number; status?: string })
}

test('applies pending TypeScript migrations and is idempotent', async () => {
  const first = await migrate()
  expect(first).toContainEqual(expect.objectContaining({ msg: 'migration', status: 'Success' }))
  expect(first.at(-1)).toMatchObject({ msg: 'migrations complete', applied: 1 })

  const client = new pg.Client({ connectionString: container.getConnectionUri() })
  await client.connect()
  try {
    const tables = await client.query(
      "select 1 from information_schema.tables where table_name = 'migration_probe'",
    )
    expect(tables.rowCount).toBe(1)
  } finally {
    await client.end()
  }

  const second = await migrate()
  expect(second.at(-1)).toMatchObject({ msg: 'migrations complete', applied: 0 })
})
