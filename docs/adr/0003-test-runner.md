# 0003 – Test runner and test levels

Status: Proposed
Date: 2026-09-26

## Context

`CLAUDE.md` requires:

- tests that describe spec behaviour;
- a test for every acceptance criterion and error case;
- integration tests against real Postgres (Testcontainers);
- flaky tests fixed, never retried or skipped;
- lint, typecheck and all tests green before a task is done.

It also mentions coverage and mutation thresholds that must not be weakened.

ADR 0001 (Next.js, server-rendered first) and ADR 0002 (App Service built-in auth) add needs:

- Testing server logic: validation, database access, the identity-header helper, server actions.
- Testing React components, including async Server Components.
- Testing whole flows (sign-in stand-in, forms, security headers) against a production build.

Facts checked on 2026-09-26:

- The Next.js testing guide documents Vitest and Jest for unit tests, and Playwright and Cypress for end-to-end tests. It says: "Since `async` Server Components are new to the React ecosystem, Vitest currently does not support them … we recommend using **E2E tests** for `async` components." ([Next.js testing](https://nextjs.org/docs/app/guides/testing), [Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest))
- Jest's ESM support is still experimental and requires Node's `--experimental-vm-modules` flag ([Jest ESM](https://jestjs.io/docs/ecmascript-modules)).
- Versions and Node engine ranges (npm):
  - `vitest` 5.0.2 (Node ^22.12 / ^24 / >=26)
  - `jest` 30.5.2
  - `@playwright/test` 1.63.0 (Node >=20; an optional peer dependency of `next`)
  - `@testcontainers/postgresql` 12.1.0 (`testcontainers` needs Node >=22.22)
  - `jsdom` 30.1.1 (Node ^24.15)
  - `@stryker-mutator/vitest-runner` 10.0.0

## Test levels

| Level | What | Runs against |
| --- | --- | --- |
| Unit | Pure logic: validation schemas, date-window calculation, identity-header parsing, endoflife.date response handling | Node, in-process |
| Component | Synchronous Server Components and Client Components | Simulated browser DOM (jsdom) |
| Integration | Data access, migrations, server actions with a real database | Real Postgres in a container (Testcontainers) |
| End-to-end | User flows, async Server Components, auth enforcement (401 without identity), security headers and CSP | `next build` + `next start`, real Postgres, real browser |

## Options

### A. Vitest + React Testing Library + Testcontainers, with Playwright for end-to-end

- Pros:
  - Vitest is documented by Next.js and runs ESM and TypeScript natively.
  - One runner for unit, component and integration tests, each as a separate Vitest project.
  - Built-in coverage via `@vitest/coverage-v8`; Stryker has a Vitest runner if we add mutation testing.
  - Playwright is Next.js's optional peer dependency and covers the async Server Components that Vitest can't.
- Cons:
  - Two runners (Vitest and Playwright).
  - Several dev dependencies, listed below.
  - Vite is used only for tests, not for the app build.

### B. Jest + React Testing Library + Testcontainers, with Playwright (rejected)

- Pros: long track record, and Next.js provides `next/jest` configuration.
- Rejected because:
  - ESM support is still experimental.
  - It needs an extra transform setup.
  - It offers nothing over Vitest for our needs.

### C. Node built-in `node:test` + Playwright (rejected)

- Pros: zero dependencies for the runner itself.
- Rejected because:
  - Node's type stripping does not handle `.tsx` files.
  - It has no DOM environment, so component tests would still need a second runner.
  - Coverage thresholds and the mutation-testing integration are weaker.

### D. Cypress instead of Playwright for end-to-end (rejected)

- Rejected because Playwright is already Next.js's optional peer dependency, covers several browsers from one API, and runs well headless in CI.

## Decision (proposed)

**A:** Vitest for unit, component and integration tests; Testcontainers for real Postgres; Playwright for end-to-end.

Configuration rules:

- **Vitest projects:**
  - `unit` runs in a Node environment and is the default.
  - `component` uses jsdom and applies only to `*.test.tsx` files.
  - `integration` uses Testcontainers Postgres and runs serially per worker, each test file with its own database or schema.
- **Playwright:**
  - Runs against a production build (`next build && next start`), not `next dev`.
  - Uses the development stand-in identity from ADR 0002 and a Testcontainers Postgres.
  - Also includes one test proving that requests *without* an identity get 401.
- **No automatic retries anywhere:** `retries: 0` in Playwright and no `retry` in Vitest, as `CLAUDE.md` requires.
- **Coverage:** `@vitest/coverage-v8` with thresholds set once the skeleton exists. Thresholds may only go up.
- **Mutation testing** (Stryker): not added now. It gets its own proposal once there is enough domain logic to make it worthwhile. `CLAUDE.md` already forbids weakening it once it exists.
- Tests live in `test/`, mirroring `src/`. Playwright tests go in `test/e2e/`.

## Consequences

### Dev dependencies

Test-only; none ship to production:

- `vitest`, `@vitest/coverage-v8`
- `@vitejs/plugin-react`, `jsdom`
- `@testing-library/react`, `@testing-library/dom`
- `@testcontainers/postgresql`
- `@playwright/test`

`vite-tsconfig-paths` is added only if we use TypeScript path aliases.

### Node version

`jsdom` 30 needs Node 24.15 or newer, so `package.json` `engines` and App Service both target Node 24 (≥ 24.15).

### CI

- Needs Docker for Testcontainers; to be confirmed on GitHub-hosted Ubuntu runners in the CI task.
- Playwright browser binaries are downloaded with `npx playwright install --with-deps chromium`. That is a browser download, not a package install, and its version is fixed by the lockfile.

### Commands

`CLAUDE.md` Commands gets:

- unit and component tests (`npm test`);
- integration tests (`npm run test:integration`);
- end-to-end tests (`npm run test:e2e`).

### Async Server Components

These are covered by end-to-end tests only, until Vitest supports them. Keep data fetching in plain functions that are tested directly at the integration level, so end-to-end tests stay few.

## Follow-up

- Database driver/query layer, migration tool and validation library ADRs.
- Mutation testing proposal, later.
