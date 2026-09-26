import type { Kysely } from 'kysely'

// Test-only migration used to prove that migrations load and apply (ADR 0004).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('migration_probe')
    .addColumn('id', 'integer', (column) => column.primaryKey())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('migration_probe').execute()
}
