import type { NextConfig } from 'next'
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers'

const nextConfig: NextConfig = {
  // Self-contained server for App Service (ADR 0001)
  output: 'standalone',
  // Version-skew protection during staging slot swaps (ADR 0001); set by CI to the commit SHA
  deploymentId: process.env.DEPLOYMENT_ID,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    // Applies to every response, including static assets; the CSP is set per request in proxy.ts
    return [{ source: '/:path*', headers: [...STATIC_SECURITY_HEADERS] }]
  },
}

export default nextConfig
