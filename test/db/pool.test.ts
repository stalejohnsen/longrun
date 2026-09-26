import { beforeEach, describe, expect, test, vi } from 'vitest'

const getToken = vi.fn()
const credentialOptions: unknown[] = []

vi.mock('@azure/identity', () => ({
  ManagedIdentityCredential: class {
    constructor(options: unknown) {
      credentialOptions.push(options)
    }
    getToken = getToken
  },
}))

const { POSTGRES_TOKEN_SCOPE, createPool, managedIdentityPassword } =
  await import('../../src/db/pool')

const database = {
  host: 'db.example',
  port: 5432,
  name: 'longrun',
  user: 'longrun-app',
  ssl: true,
  password: undefined,
  managedIdentityClientId: undefined,
}

beforeEach(() => {
  getToken.mockReset()
  credentialOptions.length = 0
})

describe('managed identity database password (ADR 0004)', () => {
  test('requests a token for the Postgres scope with the configured identity', async () => {
    getToken.mockResolvedValue({ token: 'entra-token', expiresOnTimestamp: Date.now() + 3_600_000 })
    const password = managedIdentityPassword('0b8c6c3e-5a6f-4d3e-9a2b-1c2d3e4f5a6b')
    expect(await password()).toBe('entra-token')
    expect(getToken).toHaveBeenCalledWith(POSTGRES_TOKEN_SCOPE)
    expect(POSTGRES_TOKEN_SCOPE).toBe('https://ossrdbms-aad.database.windows.net/.default')
    expect(credentialOptions).toEqual([{ clientId: '0b8c6c3e-5a6f-4d3e-9a2b-1c2d3e4f5a6b' }])
  })

  test('fails when the identity returns no token', async () => {
    getToken.mockResolvedValue(null)
    await expect(managedIdentityPassword('0b8c6c3e-5a6f-4d3e-9a2b-1c2d3e4f5a6b')()).rejects.toThrow(
      'Managed identity returned no database token',
    )
  })
})

describe('createPool', () => {
  test('uses managed identity when no password is configured', async () => {
    const pool = createPool({
      ...database,
      managedIdentityClientId: '0b8c6c3e-5a6f-4d3e-9a2b-1c2d3e4f5a6b',
    })
    expect(credentialOptions).toHaveLength(1)
    expect(pool.options.ssl).toEqual({ rejectUnauthorized: true })
    expect(pool.options.maxLifetimeSeconds).toBe(1800)
    await pool.end()
  })

  test('uses a configured password without creating a credential', async () => {
    const pool = createPool({ ...database, password: 'local', ssl: false })
    expect(credentialOptions).toHaveLength(0)
    expect(pool.options.ssl).toBe(false)
    await pool.end()
  })

  test('refuses to create a pool without any credential', () => {
    expect(() => createPool(database)).toThrow('No database credential configured')
  })
})
