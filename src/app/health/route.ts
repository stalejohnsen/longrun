import { getDb } from '../../db/client'
import { isDatabaseHealthy } from '../../db/health'

// Spec 0001: 200 when the database is reachable, 503 otherwise; no internal details.
export const dynamic = 'force-dynamic'

export async function GET() {
  const healthy = await isDatabaseHealthy(getDb())
  return Response.json(
    { status: healthy ? 'ok' : 'unavailable' },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
