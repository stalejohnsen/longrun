import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Self-contained server for App Service (ADR 0001)
  output: 'standalone',
  // Version-skew protection during staging slot swaps (ADR 0001); set by CI to the commit SHA
  deploymentId: process.env.DEPLOYMENT_ID,
  poweredByHeader: false,
  reactStrictMode: true,
}

export default nextConfig
