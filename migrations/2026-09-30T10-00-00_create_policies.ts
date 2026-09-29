import { sql, type Kysely } from 'kysely'

// Spec 0005: organisation-wide lifecycle policies. Expand-only (three new tables, nothing
// changed in `components`), so the previous app version keeps working during a slot swap
// (ADR 0004, DR-19). Limits mirror src/domain/policy.ts. `longrun_app` gets DML on these
// tables through the default privileges in infra/database/grants.sql.
export async function up(db: Kysely<unknown>): Promise<void> {
  // One row for the whole organisation (spec 0005: one set for all).
  await db.schema
    .createTable('policy_settings')
    .addColumn('id', 'smallint', (column) =>
      column
        .primaryKey()
        .defaultTo(1)
        .check(sql`id = 1`),
    )
    .addColumn('eos_warning_months', 'smallint', (column) =>
      column
        .notNull()
        .defaultTo(6)
        .check(sql`eos_warning_months between 1 and 36`),
    )
    .addColumn('require_known_owner', 'boolean', (column) => column.notNull().defaultTo(false))
    .addColumn('require_end_of_support', 'boolean', (column) => column.notNull().defaultTo(false))
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    // Null only for the seeded defaults; otherwise the ID of the user who saved (not shown, DR-17).
    .addColumn('updated_by', 'text', (column) =>
      column.check(sql`char_length(updated_by) between 1 and 200`),
    )
    .execute()
  await sql`insert into policy_settings default values`.execute(db)

  await db.schema
    .createTable('technology_rules')
    .addColumn('id', 'uuid', (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('product', 'text', (column) =>
      column
        .notNull()
        .unique()
        .check(sql`product ~ '^[a-z0-9._-]{1,100}$'`),
    )
    .addColumn('rule', 'text', (column) =>
      column.notNull().check(sql`rule in ('approved', 'banned')`),
    )
    .addColumn('major_version', 'smallint', (column) =>
      column.check(sql`major_version between 0 and 999`),
    )
    .addColumn('note', 'text', (column) =>
      column.check(sql`char_length(note) between 1 and 200 and btrim(note) = note`),
    )
    .addColumn('updated_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('updated_by', 'text', (column) =>
      column.notNull().check(sql`char_length(updated_by) between 1 and 200`),
    )
    .execute()

  await db.schema
    .createTable('teams')
    .addColumn('id', 'uuid', (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (column) =>
      column.notNull().check(sql`char_length(name) between 1 and 100 and btrim(name) = name`),
    )
    .addColumn('created_at', 'timestamptz', (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn('created_by', 'text', (column) =>
      column.notNull().check(sql`char_length(created_by) between 1 and 200`),
    )
    .execute()
  // Team names are unique regardless of case (spec 0005).
  await sql`create unique index teams_name_lower_idx on teams (lower(name))`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('teams').execute()
  await db.schema.dropTable('technology_rules').execute()
  await db.schema.dropTable('policy_settings').execute()
}
