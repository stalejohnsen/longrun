import { defineConfig, devices } from '@playwright/test'
import { principalHeader } from './test/helpers/principal'

const port = Number(process.env.E2E_PORT ?? 3100)

// ADR 0003: end-to-end tests run against the standalone production build with a real
// Postgres; no retries. Outside App Service nothing injects the identity header, so
// browser tests send one; security tests create their own contexts without it.
export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    extraHTTPHeaders: { 'x-ms-client-principal': principalHeader() },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node test/e2e/server.ts',
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}/health`,
    // Playwright treats 2xx, 3xx and 400–403 as ready, so the 401 without identity counts.
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
