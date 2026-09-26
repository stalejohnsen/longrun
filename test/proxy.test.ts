import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HEALTH_TOKEN_HEADER } from '../src/lib/auth/health-token'
import { PRINCIPAL_HEADER } from '../src/lib/auth/principal'
import { principalHeader } from './helpers/principal'

const encryptionKey = 'test-encryption-key'
const healthToken = createHash('sha256').update(encryptionKey).digest('base64')

async function loadProxy() {
  // Config is cached per module instance; reload so each test sees its own environment.
  vi.resetModules()
  return (await import('../src/proxy')).proxy
}

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'http://localhost'), { headers })
}

beforeEach(() => {
  vi.stubEnv('DATABASE_HOST', 'localhost')
  vi.stubEnv('DATABASE_NAME', 'longrun')
  vi.stubEnv('DATABASE_USER', 'longrun')
  vi.stubEnv('DATABASE_PASSWORD', 'test')
  vi.stubEnv('WEBSITE_AUTH_ENCRYPTION_KEY', encryptionKey)
  vi.stubEnv('LONGRUN_DEV_IDENTITY', 'false')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('proxy authentication (AC14)', () => {
  test('rejects a page request without an identity with 401 and a CSP', async () => {
    const proxy = await loadProxy()
    const response = proxy(request('/'))
    expect(response.status).toBe(401)
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
  })

  test('lets a request with a valid identity through and passes the nonce on', async () => {
    const proxy = await loadProxy()
    const response = proxy(request('/', { [PRINCIPAL_HEADER]: principalHeader() }))
    expect(response.status).toBe(200)
    const csp = response.headers.get('Content-Security-Policy') ?? ''
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1]
    expect(nonce).toBeTruthy()
    // NextResponse.next forwards overridden request headers via this internal header list.
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce)
  })

  test('rejects a forged or malformed identity header', async () => {
    const proxy = await loadProxy()
    expect(proxy(request('/', { [PRINCIPAL_HEADER]: 'forged' })).status).toBe(401)
  })

  test('accepts the platform health token on /health only', async () => {
    const proxy = await loadProxy()
    expect(proxy(request('/health', { [HEALTH_TOKEN_HEADER]: healthToken })).status).toBe(200)
    expect(proxy(request('/', { [HEALTH_TOKEN_HEADER]: healthToken })).status).toBe(401)
  })

  test('rejects /health without an identity or with a wrong health token', async () => {
    const proxy = await loadProxy()
    expect(proxy(request('/health')).status).toBe(401)
    const wrong = createHash('sha256').update('wrong').digest('base64')
    expect(proxy(request('/health', { [HEALTH_TOKEN_HEADER]: wrong })).status).toBe(401)
  })

  test('accepts the stand-in identity only when enabled', async () => {
    vi.stubEnv('LONGRUN_DEV_IDENTITY', 'true')
    const proxy = await loadProxy()
    expect(proxy(request('/')).status).toBe(200)
  })
})
