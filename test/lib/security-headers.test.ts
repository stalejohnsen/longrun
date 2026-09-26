import { describe, expect, test } from 'vitest'
import { buildContentSecurityPolicy, createNonce } from '../../src/lib/security-headers'

describe('content security policy', () => {
  test('allows scripts and styles only with the request nonce in production', () => {
    const csp = buildContentSecurityPolicy('abc123', {
      development: false,
      upgradeInsecureRequests: true,
    })
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(csp).toContain("style-src 'self' 'nonce-abc123'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain('upgrade-insecure-requests')
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('unsafe-inline')
  })

  test('allows eval and inline styles only in development', () => {
    const csp = buildContentSecurityPolicy('abc123', {
      development: true,
      upgradeInsecureRequests: false,
    })
    expect(csp).toContain("'unsafe-eval'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain('upgrade-insecure-requests')
  })

  test('creates a different nonce for every request', () => {
    expect(createNonce()).not.toBe(createNonce())
  })
})
