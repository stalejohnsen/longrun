import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// ADR 0003: one runner, three projects. No retries: flaky tests are fixed, not retried.
export default defineConfig({
  plugins: [react()],
  test: {
    retry: 0,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.int.test.ts', 'test/e2e/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['test/**/*.test.tsx'],
          exclude: ['test/e2e/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/**/*.int.test.ts'],
          // Containers take time to start; generous but bounded
          hookTimeout: 120_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
})
