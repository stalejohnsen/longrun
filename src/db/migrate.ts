import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Kysely } from 'kysely'
import { FileMigrationProvider, Migrator, type MigrationResult } from 'kysely/migration'

// Runs pending migrations with Kysely's Migrator, which takes a database-level lock
// so concurrent runs are serialized (ADR 0004). Only `up` is used outside tests.
// Since Kysely 0.29 the migrator lives in the `kysely/migration` entry point.
export async function migrateToLatest(
  db: Kysely<unknown>,
  migrationFolder: string,
): Promise<MigrationResult[]> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve(migrationFolder),
      // Absolute Windows paths are not valid ESM specifiers; import via file URLs.
      import: (file) => import(pathToFileURL(file).href),
    }),
  })
  const { error, results } = await migrator.migrateToLatest()
  if (error) {
    throw error instanceof Error ? error : new Error('Migration failed')
  }
  return results ?? []
}
