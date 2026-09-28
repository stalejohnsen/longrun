import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// ADR 0003: one runner, three projects. No retries: flaky tests are fixed, not retried.
export default defineConfig({
  plugins: [react()],
  test: {
    retry: 0,
    coverage: {
      provider: 'v8',
      include: ['src/**', 'scripts/claude-hooks/**/*.ts', 'scripts/metrics/**'],
      exclude: [
        // Covered by end-to-end tests against the production build (ADR 0003).
        'src/app/**',
        'src/instrumentation.ts',
        // Run as a child process with plain Node in test/db/migrate.int.test.ts, invisible to v8 coverage here.
        'src/db/migrate.ts',
        // Hook entry point (stdin/stdout wiring): run as a child process in test/scripts/claude-hooks.
        'scripts/claude-hooks/pre-tool-use.ts',
      ],
      // Thresholds only go up (CLAUDE.md, ADR 0003).
      thresholds: { statements: 97, branches: 96, functions: 94, lines: 98 },
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
