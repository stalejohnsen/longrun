import { getDb } from '../../db/client'
import { isDatabaseHealthy } from '../../db/health'

// Spec 0001: 200 when the database is reachable, 503 otherwise. Anonymous (ADR 0002
// amendment), so it reports only the status and the build version (commit SHA).
export const dynamic = 'force-dynamic'

export async function GET() {
  const healthy = await isDatabaseHealthy(getDb())
  return Response.json(
    { status: healthy ? 'ok' : 'unavailable', version: process.env.LONGRUN_VERSION },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
