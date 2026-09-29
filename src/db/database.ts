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

// Spec 0005. One row (id = 1), seeded by the migration.
export interface PolicySettingsTable {
  id: ColumnType<number, never, never>
  eos_warning_months: number
  require_known_owner: boolean
  require_end_of_support: boolean
  updated_at: ColumnType<Date, never, Date>
  updated_by: string | null
}

export type TechnologyRuleKind = 'approved' | 'banned'

export interface TechnologyRulesTable {
  id: Generated<string>
  product: string
  rule: TechnologyRuleKind
  major_version: number | null
  note: string | null
  updated_at: ColumnType<Date, never, Date>
  updated_by: string
}

export interface TeamsTable {
  id: Generated<string>
  name: string
  created_at: ColumnType<Date, never, never>
  created_by: string
}

export interface Database {
  components: ComponentsTable
  policy_settings: PolicySettingsTable
  technology_rules: TechnologyRulesTable
  teams: TeamsTable
}
