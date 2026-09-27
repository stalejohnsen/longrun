// Starts the production (standalone) server for end-to-end tests against a real
// Postgres in a container (ADR 0003). Run by Playwright's webServer after `npm run build`.
import { spawn } from 'node:child_process'
import { Kysely, PostgresDialect } from 'kysely'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { createPool } from '../../src/db/pool.ts'
import { databaseConfig, databaseEnv, startPostgres } from '../helpers/postgres.ts'
import { startEndOfLifeStub } from './endoflife-stub.ts'

const container = await startPostgres()
const endOfLife = await startEndOfLifeStub()

const db = new Kysely<unknown>({
  dialect: new PostgresDialect({ pool: createPool(databaseConfig(container)) }),
})
try {
  await migrateToLatest(db, 'migrations')
} finally {
  await db.destroy()
}

const prepare = spawn(process.execPath, ['scripts/prepare-standalone.mjs'], { stdio: 'inherit' })
await new Promise<void>((resolve, reject) =>
  prepare.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`prepare exited ${code}`)),
  ),
)

const server = spawn(process.execPath, ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: {
    NODE_ENV: 'production',
    PATH: process.env.PATH ?? '',
    PORT: process.env.PORT ?? '3100',
    HOSTNAME: '127.0.0.1',
    LONGRUN_DEV_IDENTITY: 'false',
    ENDOFLIFE_BASE_URL: endOfLife.baseUrl,
    ...databaseEnv(container),
  },
})

async function shutdown(code: number) {
  server.kill()
  endOfLife.server.close()
  await container.stop()
  process.exit(code)
}

server.on('exit', (code) => void shutdown(code ?? 1))
process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))
