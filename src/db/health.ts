import { sql, type Kysely } from 'kysely'

// Returns true when the database answers a trivial query within the timeout.
export async function isDatabaseHealthy<DB>(db: Kysely<DB>, timeoutMs = 3_000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  const probe = sql<{ ok: number }>`select 1 as ok`
    .execute(db)
    .then((result) => result.rows[0]?.ok === 1)
    .catch((error: unknown) => {
      // Log the error class and SQLSTATE only; messages can contain connection details.
      const code = error instanceof Error && 'code' in error ? String(error.code) : undefined
      const name = error instanceof Error ? error.name : 'unknown'
      console.error(
        JSON.stringify({ level: 'error', msg: 'database health probe failed', name, code }),
      )
      return false
    })
  try {
    return await Promise.race([probe, timeout])
  } finally {
    clearTimeout(timer)
  }
}
