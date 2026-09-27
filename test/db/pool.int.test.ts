import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import pg from 'pg'
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

// node-postgres Pool docs: idle clients emit errors through the pool when the backend goes
// away; without a listener the process can crash. Simulate a database restart for one idle
// connection and check the app survives, logs safely and keeps working.
test('an idle connection killed by the database is logged and replaced, not fatal', async () => {
  const config = databaseConfig(container)
  const pool = createPool(config)
  const logged: string[] = []
  const errorLog = vi.spyOn(console, 'error').mockImplementation((line: string) => {
    logged.push(line)
  })
  try {
    const client = await pool.connect()
    const { rows } = await client.query<{ pid: number }>('select pg_backend_pid() as pid')
    client.release() // now idle in the pool

    const admin = new pg.Client({ connectionString: container.getConnectionUri() })
    await admin.connect()
    await admin.query('select pg_terminate_backend($1)', [rows[0]!.pid])
    await admin.end()

    await vi.waitFor(() => expect(logged.length).toBe(1))
    expect(JSON.parse(logged[0]!)).toEqual({
      level: 'error',
      msg: 'idle database connection failed',
      name: 'error',
      code: '57P01',
    })
    expect(logged[0]).not.toContain(config.password ?? 'unused')

    const after = await pool.query<{ ok: number }>('select 1 as ok')
    expect(after.rows[0]?.ok).toBe(1)
  } finally {
    errorLog.mockRestore()
    await pool.end()
  }
})
