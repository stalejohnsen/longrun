import { Kysely, PostgresDialect } from 'kysely'
import { getConfig } from '../lib/config'
import type { Database } from './database'
import { createPool } from './pool'

export function createDb(pool: ReturnType<typeof createPool>): Kysely<Database> {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) })
}

let db: Kysely<Database> | undefined

// One pool per server process.
export function getDb(): Kysely<Database> {
  db ??= createDb(createPool(getConfig().database))
  return db
}
