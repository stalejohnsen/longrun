import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createPool } from '../../src/db/pool'
import { databaseConfig, startPostgres } from '../helpers/postgres'

let container: StartedPostgreSqlContainer

beforeAll(async () => {
  container = await startPostgres()
})

afterAll(async () => {
  await container?.stop()
})

// ADR 0004: Entra tokens expire, so every new connection must ask for a fresh one.
test('asks the password provider for every new connection', async () => {
  let calls = 0
  const config = databaseConfig(container)
  const pool = createPool({ ...config, password: undefined }, async () => {
    calls += 1
    return config.password ?? ''
  })
  try {
    const first = await pool.connect()
    const second = await pool.connect()
    const result = await first.query<{ ok: number }>('select 1 as ok')
    expect(result.rows[0]?.ok).toBe(1)
    first.release()
    second.release()
    expect(calls).toBe(2)
  } finally {
    await pool.end()
  }
})
