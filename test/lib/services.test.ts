import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// The production wiring passes the configured endoflife.date base URL to the lookup.

const lookUpEndOfLife = vi.fn(async () => ({ kind: 'no-date' as const }))
const db = { marker: 'db' }
vi.mock('../../src/lib/endoflife', () => ({ lookUpEndOfLife }))
vi.mock('../../src/db/client', () => ({ getDb: () => db }))

beforeEach(() => {
  vi.stubEnv('DATABASE_HOST', 'localhost')
  vi.stubEnv('DATABASE_NAME', 'longrun')
  vi.stubEnv('DATABASE_USER', 'longrun')
  vi.stubEnv('DATABASE_PASSWORD', 'test')
  vi.stubEnv('ENDOFLIFE_BASE_URL', 'http://127.0.0.1:4010')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('uses the app database, the configured endoflife.date URL and the current time', async () => {
  vi.resetModules()
  const { serviceDeps } = await import('../../src/lib/services')
  const deps = serviceDeps()
  expect(deps.db).toBe(db)
  await deps.lookUp('nodejs', '24')
  expect(lookUpEndOfLife).toHaveBeenCalledWith('nodejs', '24', { baseUrl: 'http://127.0.0.1:4010' })
  expect(Math.abs(deps.now().getTime() - Date.now())).toBeLessThan(1_000)
})
