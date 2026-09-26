import { createHash, timingSafeEqual } from 'node:crypto'

// App Service health check pings carry `x-ms-auth-internal-token`, which equals the
// Base64 SHA-256 hash of WEBSITE_AUTH_ENCRYPTION_KEY (spec 0001, /health).

export const HEALTH_TOKEN_HEADER = 'x-ms-auth-internal-token'

export function isValidHealthToken(
  headerValue: string | null | undefined,
  encryptionKey: string | undefined,
): boolean {
  if (!headerValue || !encryptionKey) {
    return false
  }
  const expected = createHash('sha256').update(encryptionKey, 'utf8').digest()
  const actual = Buffer.from(headerValue, 'base64')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
