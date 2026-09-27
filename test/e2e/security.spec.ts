import { expect, test, type APIRequestContext } from '@playwright/test'

// A context without the default identity header from playwright.config.ts.
async function anonymous(
  playwright: { request: { newContext: (options: object) => Promise<APIRequestContext> } },
  baseURL: string | undefined,
) {
  return playwright.request.newContext({ baseURL, extraHTTPHeaders: {} })
}

test.describe('authentication (AC14)', () => {
  test('rejects pages without an identity', async ({ playwright, baseURL }) => {
    const context = await anonymous(playwright, baseURL)
    expect((await context.get('/')).status()).toBe(401)
    expect((await context.get('/does-not-exist')).status()).toBe(401)
    await context.dispose()
  })

  test('rejects a forged identity header', async ({ playwright, baseURL }) => {
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { 'x-ms-client-principal': 'forged' },
    })
    expect((await context.get('/')).status()).toBe(401)
    await context.dispose()
  })
})

test.describe('health (AC16, anonymous per ADR 0002 amendment)', () => {
  test('reports ok and the build version without an identity, and nothing else', async ({
    playwright,
    baseURL,
  }) => {
    const context = await anonymous(playwright, baseURL)
    const response = await context.get('/health')
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      version: process.env.DEPLOYMENT_ID ?? 'development',
    })
    expect(response.headers()['cache-control']).toContain('no-store')
    await context.dispose()
  })
})

test.describe('security headers (AC15)', () => {
  test('pages carry a nonce-based CSP and the static security headers', async ({ request }) => {
    const response = await request.get('/')
    expect(response.status()).toBe(200)
    const headers = response.headers()
    const csp = headers['content-security-policy'] ?? ''
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
    expect(csp).not.toContain('unsafe-eval')
    expect(headers['strict-transport-security']).toContain('max-age=31536000')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['x-powered-by']).toBeUndefined()
  })

  test('each response gets a fresh nonce', async ({ request }) => {
    const nonceOf = async () =>
      /'nonce-([^']+)'/.exec(
        (await request.get('/')).headers()['content-security-policy'] ?? '',
      )?.[1]
    expect(await nonceOf()).not.toBe(await nonceOf())
  })

  test('the page runs without CSP violations', async ({ page }) => {
    const violations: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
        violations.push(message.text())
      }
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Longrun' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(violations).toEqual([])
  })

  test('static assets carry the static security headers', async ({ page, request }) => {
    await page.goto('/')
    const script = await page.locator('script[src^="/_next/static/"]').first().getAttribute('src')
    expect(script).toBeTruthy()
    const response = await request.get(script ?? '')
    expect(response.status()).toBe(200)
    expect(response.headers()['x-content-type-options']).toBe('nosniff')
  })
})
