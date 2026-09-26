// Security headers (CLAUDE.md: secure defaults). The CSP uses a per-request nonce,
// following the Next.js CSP guide; static headers apply to every response.

export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64')
}

export function buildContentSecurityPolicy(
  nonce: string,
  options: { development: boolean; upgradeInsecureRequests: boolean },
): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' ${options.development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  if (options.upgradeInsecureRequests) {
    directives.push('upgrade-insecure-requests')
  }
  return directives.join('; ')
}
