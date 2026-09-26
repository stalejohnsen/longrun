import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3100)

// ADR 0003: end-to-end tests run against a production build; no retries
export default defineConfig({
  testDir: 'test/e2e',
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm start`,
    env: { PORT: String(port), HOSTNAME: '127.0.0.1' },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
