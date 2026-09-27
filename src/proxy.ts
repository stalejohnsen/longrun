import { NextResponse, type NextRequest } from 'next/server'
import { getUser } from './lib/auth/current-user'
import { getConfig } from './lib/config'
import { buildContentSecurityPolicy, createNonce } from './lib/security-headers'

// Runs before every page, route handler and server action (ADR 0002, spec 0001 AC14/AC15).
// App Service built-in auth is the first line of defence; this is the second.
// Server actions must still check the user themselves.

export function proxy(request: NextRequest) {
  const config = getConfig()
  const nonce = createNonce()
  const csp = buildContentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === 'development',
    upgradeInsecureRequests: config.inAzure,
  })

  // /health is the one anonymous route (CLAUDE.md, ADR 0002 amendment): App Service warm-up
  // and the pipeline smoke test call it without an identity. It reveals only ok/unavailable
  // and the build version.
  const isHealth = request.nextUrl.pathname === '/health'
  const authenticated = isHealth || getUser(request.headers, config) !== null

  if (!authenticated) {
    const response = new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
    response.headers.set('Content-Security-Policy', csp)
    return response
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  // Everything except build assets that carry no user data.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
