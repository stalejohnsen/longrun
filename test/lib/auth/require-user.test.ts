import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { principalHeader, TEST_OBJECT_ID } from '../../helpers/principal'

// Spec 0001 AC14 / ADR 0002: every server action checks the user itself.

let requestHeaders = new Headers()
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }))

async function load() {
  vi.resetModules()
  return import('../../../src/lib/auth/require-user')
}

beforeEach(() => {
  vi.stubEnv('DATABASE_HOST', 'localhost')
  vi.stubEnv('DATABASE_NAME', 'longrun')
  vi.stubEnv('DATABASE_USER', 'longrun')
  vi.stubEnv('DATABASE_PASSWORD', 'test')
  vi.stubEnv('LONGRUN_DEV_IDENTITY', 'false')
})

afterEach(() => {
  vi.unstubAllEnvs()
  requestHeaders = new Headers()
})

test('returns the signed-in user from the identity header', async () => {
  requestHeaders = new Headers({ 'x-ms-client-principal': principalHeader() })
  const { requireUser } = await load()
  expect(await requireUser()).toEqual({ id: TEST_OBJECT_ID })
})

test.each([
  ['no identity header', new Headers()],
  ['a forged identity header', new Headers({ 'x-ms-client-principal': 'forged' })],
])('throws UnauthorizedError with %s', async (_case, headers) => {
  requestHeaders = headers
  const { requireUser, UnauthorizedError } = await load()
  await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError)
})
