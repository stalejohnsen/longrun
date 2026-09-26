import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// ADR 0003: one runner, three projects. No retries: flaky tests are fixed, not retried.
export default defineConfig({
  plugins: [react()],
  test: {
    retry: 0,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        // Covered by end-to-end tests against the production build (ADR 0003).
        'src/app/**',
        'src/instrumentation.ts',
        // Run as a child process with plain Node in test/db/migrate.int.test.ts, invisible to v8 coverage here.
        'src/db/migrate.ts',
      ],
      // Thresholds only go up (CLAUDE.md, ADR 0003).
      thresholds: { statements: 95, branches: 93, functions: 90, lines: 96 },
    },
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
