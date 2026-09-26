// Applies database migrations. Runs with Node's built-in TypeScript support:
//   node scripts/migrate.ts [migrations-folder]
// In CI it runs as the `longrun_migrator` role before deploying to staging (ADR 0004).
import { Kysely, PostgresDialect } from 'kysely'
import { migrateToLatest } from '../src/db/migrate.ts'
import { createPool } from '../src/db/pool.ts'
import { parseConfig } from '../src/lib/config.ts'

const folder = process.argv[2] ?? 'migrations'
const config = parseConfig(process.env)
const db = new Kysely<unknown>({
  dialect: new PostgresDialect({ pool: createPool(config.database) }),
})

try {
  const results = await migrateToLatest(db, folder)
  for (const result of results) {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'migration',
        name: result.migrationName,
        status: result.status,
      }),
    )
  }
  console.log(
    JSON.stringify({ level: 'info', msg: 'migrations complete', applied: results.length }),
  )
} finally {
  await db.destroy()
}
