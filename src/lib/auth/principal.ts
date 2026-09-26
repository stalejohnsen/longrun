import { z } from 'zod'

// Parses the identity header injected by App Service built-in authentication (ADR 0002).
// Any failure means "no user". The header is only trustworthy behind App Service
// authentication; config validation refuses to start in Azure without it.

export const PRINCIPAL_HEADER = 'x-ms-client-principal'

// Entra object ID. App Service maps claim names by default, so accept both forms.
const OBJECT_ID_CLAIMS = new Set([
  'http://schemas.microsoft.com/identity/claims/objectidentifier',
  'oid',
])

const MAX_HEADER_LENGTH = 16_384
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

const principalSchema = z.object({
  auth_typ: z.string().min(1),
  claims: z.array(z.object({ typ: z.string().max(512), val: z.string().max(4_096) })).max(500),
})

export type User = { id: string }

export function parsePrincipal(headerValue: string | null | undefined): User | null {
  if (!headerValue || headerValue.length > MAX_HEADER_LENGTH || !BASE64.test(headerValue)) {
    return null
  }
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf8'))
  } catch {
    // Not JSON: treat as unauthenticated.
    return null
  }
  const parsed = principalSchema.safeParse(payload)
  if (!parsed.success) {
    return null
  }
  const objectId = parsed.data.claims.find((claim) => OBJECT_ID_CLAIMS.has(claim.typ))?.val
  const id = z.uuid().safeParse(objectId)
  return id.success ? { id: id.data } : null
}
