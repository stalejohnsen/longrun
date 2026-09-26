import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg from 'pg'
import { afterAll, beforeAll, expect, test } from 'vitest'

// Proves the integration-test toolchain: a real Postgres in a container (ADR 0003)
let container: StartedPostgreSqlContainer

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
})

afterAll(async () => {
  await container?.stop()
})

test('connects to a real Postgres and runs a parameterized query', async () => {
  const client = new pg.Client({ connectionString: container.getConnectionUri() })
  await client.connect()
  try {
    const result = await client.query<{ value: number }>('select $1::int as value', [42])
    expect(result.rows[0]?.value).toBe(42)
  } finally {
    await client.end()
  }
})
