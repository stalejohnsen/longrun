import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createDb } from '../../src/db/client'
import { isDatabaseHealthy } from '../../src/db/health'
import { createPool } from '../../src/db/pool'
import { databaseConfig, startPostgres } from '../helpers/postgres'

let container: StartedPostgreSqlContainer

beforeAll(async () => {
  container = await startPostgres()
})

afterAll(async () => {
  await container?.stop()
})

describe('database health (AC16)', () => {
  test('is healthy when the database answers', async () => {
    const db = createDb(createPool(databaseConfig(container)))
    try {
      expect(await isDatabaseHealthy(db)).toBe(true)
    } finally {
      await db.destroy()
    }
  })

  test('is unhealthy when the database cannot be reached', async () => {
    const unreachable = { ...databaseConfig(container), port: 1 }
    const db = createDb(createPool(unreachable))
    try {
      expect(await isDatabaseHealthy(db, 2_000)).toBe(false)
    } finally {
      await db.destroy()
    }
  })
})
