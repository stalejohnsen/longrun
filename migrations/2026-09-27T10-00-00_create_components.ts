import { sql, type Kysely } from 'kysely'

// Spec 0001: registered technology components. Expand-only (new table), so the previous app
// version keeps working during a slot swap (ADR 0004). Length and format rules mirror
// src/domain/component.ts so the database rejects invalid rows even if the app has a bug.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('components')
    .addColumn('id', 'uuid', (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (column) =>
      column.notNull().check(sql`char_length(name) between 1 and 100 and btrim(name) = name`),
    )
    .addColumn('version', 'text', (column) =>
      column
        .notNull()
        .check(sql`char_length(version) between 1 and 50 and btrim(version) = version`),
    )
    .addColumn('where_used', 'text', (column) =>
      column
        .notNull()
        .check(sql`char_length(where_used) between 1 and 500 and btrim(where_used) = where_used`),
    )
    .addColumn('owner', 'text', (column) =>
      column.notNull().check(sql`char_length(owner) between 1 and 100 and btrim(owner) = owner`),
    )
    .addColumn('eol_product', 'text', (column) =>
      column.check(sql`eol_product ~ '^[a-z0-9._-]{1,100}$'`),
    )
    .addColumn('eol_release', 'text', (column) =>
      column.check(sql`eol_release ~ '^[A-Za-z0-9._-]{1,50}$'`),
    )
    .addColumn('end_of_support', 'date')
    .addColumn('date_source', 'text', (column) =>
      column.check(sql`date_source in ('endoflife.date', 'manual')`),
    )
    .addColumn('looked_up_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    // Product and release are given together or not at all (spec 0001 E3).
    .addCheckConstraint('components_eol_pair', sql`(eol_product is null) = (eol_release is null)`)
    // A date always has a source, and a source always has a date.
    .addCheckConstraint(
      'components_date_source',
      sql`(end_of_support is null) = (date_source is null)`,
    )
    // Only looked-up dates carry a lookup time.
    .addCheckConstraint(
      'components_looked_up_at',
      sql`(looked_up_at is not null) = (date_source is not distinct from 'endoflife.date')`,
    )
    .execute()

  // List and end-of-support view order by date, then name (spec 0001).
  await db.schema
    .createIndex('components_end_of_support_name_idx')
    .on('components')
    .columns(['end_of_support', 'name'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('components').execute()
}
