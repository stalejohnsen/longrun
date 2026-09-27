import { ManagedIdentityCredential } from '@azure/identity'
import pg from 'pg'
import type { Config } from '../lib/config'

// Entra token scope for Azure Database for PostgreSQL (ADR 0004).
export const POSTGRES_TOKEN_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default'

type PasswordProvider = () => Promise<string>

// pg parses `date` into a JavaScript Date at local midnight, which shifts calendar dates in
// non-UTC time zones (2026-03-01 became 2026-02-28T23:00Z in testing). Keep dates as
// YYYY-MM-DD strings for this pool only; other types use pg's defaults.
export const dateAsString: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: string) =>
    oid === pg.types.builtins.DATE
      ? (value: string) => value
      : pg.types.getTypeParser(oid, format as 'text')) as pg.CustomTypesConfig['getTypeParser'],
}

// Tokens are valid for 5–60 minutes. pg calls the password function for every new
// connection, and connections are recycled well before a token could expire.
export function managedIdentityPassword(clientId: string): PasswordProvider {
  const credential = new ManagedIdentityCredential({ clientId })
  return async () => {
    const token = await credential.getToken(POSTGRES_TOKEN_SCOPE)
    if (!token) {
      throw new Error('Managed identity returned no database token')
    }
    return token.token
  }
}

export function createPool(
  database: Config['database'],
  passwordProvider?: PasswordProvider,
): pg.Pool {
  const password =
    passwordProvider ??
    database.password ??
    (database.managedIdentityClientId
      ? managedIdentityPassword(database.managedIdentityClientId)
      : undefined)
  if (password === undefined) {
    throw new Error('No database credential configured')
  }
  const pool = new pg.Pool({
    host: database.host,
    port: database.port,
    database: database.name,
    user: database.user,
    password,
    ssl: database.ssl ? { rejectUnauthorized: true } : false,
    types: dateAsString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Recycle connections before an Entra token (max 60 minutes) could expire.
    maxLifetimeSeconds: 30 * 60,
  })
  // Idle clients emit errors through the pool when the database restarts or the network
  // drops; without a listener Node treats it as uncaught and the process can crash
  // (node-postgres Pool docs). The pool discards the client itself; we only log it, with the
  // error name and SQLSTATE only, because messages can contain connection details.
  pool.on('error', (error: Error & { code?: string }) => {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'idle database connection failed',
        name: error.name,
        code: error.code,
      }),
    )
  })
  return pool
}
