import type { ColumnType, Generated } from 'kysely'

// Kysely table types (ADR 0004). Keep in step with migrations/.

export type DateSource = 'endoflife.date' | 'manual'

export interface ComponentsTable {
  id: Generated<string>
  name: string
  version: string
  where_used: string
  owner: string
  eol_product: string | null
  eol_release: string | null
  // Calendar date as YYYY-MM-DD (src/db/pool.ts disables pg's local-time Date conversion).
  end_of_support: string | null
  date_source: DateSource | null
  looked_up_at: Date | null
  created_at: ColumnType<Date, never, never>
  updated_at: ColumnType<Date, never, Date>
}

export interface Database {
  components: ComponentsTable
}
