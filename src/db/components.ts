import { sql, type Kysely, type Selectable } from 'kysely'
import { z } from 'zod'
import type { EndOfSupportWindow } from '../domain/end-of-support-window'
import type { ComponentsTable, Database } from './database'

// Data access for spec 0001 components. Kysely builds parameterized SQL only (ADR 0004).

export type EndOfSupport =
  { date: string; source: 'manual' } | { date: string; source: 'endoflife.date'; lookedUpAt: Date }

export type ComponentData = {
  name: string
  version: string
  whereUsed: string
  owner: string
  eol: { product: string; release: string } | null
  endOfSupport: EndOfSupport | null
}

export type Component = ComponentData & {
  id: string
  createdAt: Date
  updatedAt: Date
}

export type EndOfSupportOverview = {
  alreadyUnsupported: Component[]
  withinWindow: Component[]
  withoutDateCount: number
}

type Row = Selectable<ComponentsTable>

function toComponent(row: Row): Component {
  let endOfSupport: EndOfSupport | null = null
  if (row.end_of_support !== null && row.date_source === 'manual') {
    endOfSupport = { date: row.end_of_support, source: 'manual' }
  } else if (
    row.end_of_support !== null &&
    row.date_source === 'endoflife.date' &&
    row.looked_up_at
  ) {
    endOfSupport = {
      date: row.end_of_support,
      source: 'endoflife.date',
      lookedUpAt: row.looked_up_at,
    }
  }
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    whereUsed: row.where_used,
    owner: row.owner,
    eol:
      row.eol_product !== null && row.eol_release !== null
        ? { product: row.eol_product, release: row.eol_release }
        : null,
    endOfSupport,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toColumns(data: ComponentData) {
  return {
    name: data.name,
    version: data.version,
    where_used: data.whereUsed,
    owner: data.owner,
    eol_product: data.eol?.product ?? null,
    eol_release: data.eol?.release ?? null,
    end_of_support: data.endOfSupport?.date ?? null,
    date_source: data.endOfSupport?.source ?? null,
    looked_up_at:
      data.endOfSupport?.source === 'endoflife.date' ? data.endOfSupport.lookedUpAt : null,
  }
}

// Ids come from URLs; anything that is not a UUID cannot exist (spec 0001 E8).
const isId = (id: string) => z.uuid().safeParse(id).success

export async function createComponent(
  db: Kysely<Database>,
  data: ComponentData,
): Promise<Component> {
  const row = await db
    .insertInto('components')
    .values(toColumns(data))
    .returningAll()
    .executeTakeFirstOrThrow()
  return toComponent(row)
}

export async function getComponent(
  db: Kysely<Database>,
  id: string,
): Promise<Component | undefined> {
  if (!isId(id)) return undefined
  const row = await db.selectFrom('components').selectAll().where('id', '=', id).executeTakeFirst()
  return row ? toComponent(row) : undefined
}

// Spec 0001 "List": by end-of-support date ascending, unknown dates last, ties by name.
export async function listComponents(db: Kysely<Database>): Promise<Component[]> {
  const rows = await db
    .selectFrom('components')
    .selectAll()
    .orderBy('end_of_support', (order) => order.asc().nullsLast())
    .orderBy('name')
    .orderBy('id')
    .execute()
  return rows.map(toComponent)
}

// Returns undefined when the component no longer exists (spec 0001 E8).
export async function updateComponent(
  db: Kysely<Database>,
  id: string,
  data: ComponentData,
): Promise<Component | undefined> {
  if (!isId(id)) return undefined
  const row = await db
    .updateTable('components')
    // Database clock, like created_at; mixing app and database clocks made updates look older.
    .set({ ...toColumns(data), updated_at: sql<Date>`now()` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()
  return row ? toComponent(row) : undefined
}

// Returns false when the component no longer exists (spec 0001 E8).
export async function deleteComponent(db: Kysely<Database>, id: string): Promise<boolean> {
  if (!isId(id)) return false
  const result = await db.deleteFrom('components').where('id', '=', id).executeTakeFirst()
  return result.numDeletedRows > 0n
}

// Spec 0001 "End-of-support view": past dates, dates from today up to and including the end
// of the window, and the number of components without a date.
export async function endOfSupportOverview(
  db: Kysely<Database>,
  window: EndOfSupportWindow,
): Promise<EndOfSupportOverview> {
  const [pastRows, windowRows, counted] = await Promise.all([
    db
      .selectFrom('components')
      .selectAll()
      .where('end_of_support', '<', window.today)
      .orderBy('end_of_support')
      .orderBy('name')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('components')
      .selectAll()
      .where('end_of_support', '>=', window.today)
      .where('end_of_support', '<=', window.until)
      .orderBy('end_of_support')
      .orderBy('name')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('components')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('end_of_support', 'is', null)
      .executeTakeFirstOrThrow(),
  ])
  return {
    alreadyUnsupported: pastRows.map(toComponent),
    withinWindow: windowRows.map(toComponent),
    withoutDateCount: Number(counted.count),
  }
}
