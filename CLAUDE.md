# CLAUDE.md

## Project

Longrun is a lifecycle register: users register technology components (name, version, where they are used, owner) and see which ones reach end of support within a window they choose (typically 6–12 months). It is a learning project for agentic coding on Azure. Keep it small. Do not add features that are not in a spec.

Plan and background: `docs/plan.md`. Decisions: `docs/adr/`. Specs: `specs/`.

## Stack

Decided (changing any of these requires an ADR):

- TypeScript on Node LTS
- Azure App Service (Linux), Azure Database for PostgreSQL Flexible Server, Azure Key Vault, Application Insights
- Bicep for all infrastructure
- GitHub Actions with OIDC to Azure
- Entra ID for user sign-in and for database access (managed identity, no passwords)
- Next.js (App Router) with React, server-rendered first; client components only where a spec needs them (ADR 0001)
- App Service built-in authentication for Entra ID sign-in, secretless via managed identity federated credential; the app still validates the identity header on every page, server action and route handler (ADR 0002)
- Vitest for unit, component and integration tests (Testcontainers Postgres); Playwright end-to-end against a production build; no automatic retries (ADR 0003)
- `pg` + Kysely for queries (raw SQL only via Kysely `sql` tag); Kysely Migrator with TypeScript migrations run from CI as `longrun_migrator`; the app role has no DDL rights (ADR 0004)
- Zod 4 for validation at every boundary; use Zod 4 APIs, not Zod 3 examples (ADR 0005)
- ESLint (flat config, `eslint-config-next` presets) and Prettier; TypeScript pinned to 6.0.x and ESLint to 9 until upstream support allows upgrades (ADR 0006, `docs/lifecycle.md`)

Any other new library, service or tool needs an ADR draft with options and trade-offs; do not pick on your own.

## Workflow

- No code without a spec in `specs/`. If the spec is missing or unclear, stop and ask.
- Start every task with a short plan: files to change, tests to add, risks. Wait for approval on anything touching infra, auth, security or dependencies.
- One task per branch and PR. Keep diffs small.
- Update docs, specs and ADRs in the same PR as the code they describe.
- When you are unsure, ask. Do not guess about Azure behaviour, library APIs or versions; check official docs.
- Before designing a mechanism, find the platform's documented, commonly used pattern and prefer it.

## Commands

Requires Node 24 (>= 24.15; see `.node-version`) and Docker (for Testcontainers).

- Install: `npm ci`
- Lint / format / typecheck: `npm run lint`, `npm run format:check`, `npm run typecheck`
- Unit and component tests: `npm test`
- Integration tests (Testcontainers Postgres): `npm run test:integration`
- End-to-end tests (production build, Playwright): `npm run test:e2e` (first time: `npx playwright install chromium`)
- Unit, component and integration tests with coverage thresholds (as in CI): `npm run test:coverage`
- All tests: `npm run test:all`
- Apply migrations: `npm run db:migrate` (see `docs/runbooks/local-development.md`)
- Run locally: `npm run dev` (configuration in `docs/runbooks/local-development.md`); production bundle: `npm run build && npm start`

Run lint, typecheck and all tests before declaring a task done.

## Repository layout

- `src/` application code
- `test/` tests, mirroring `src/`
- `migrations/` versioned database migrations
- `infra/` Bicep
- `specs/` feature specs
- `docs/adr/`, `docs/runbooks/`, `docs/lifecycle.md`, `docs/learnings.md`

## Security (secure by default)

- Validate all external input with a schema at the boundary (HTTP, external APIs, config).
- Parameterized queries only. No string-built SQL.
- No secrets anywhere in the repo, pipeline variables or plain app settings. Use Key Vault references and managed identity.
- Least privilege for every identity: app, pipeline, database roles.
- HTTPS only, security headers, secure defaults. Authentication is required on every route except the health endpoint.
- Never log personal data, tokens or secrets. Use structured logging.
- Treat data from external APIs (e.g. endoflife.date) as untrusted: validate, time out, handle failure.

## Testing

- Tests describe behaviour from the spec, not implementation details.
- Every acceptance criterion and error case in a spec has a test.
- Integration tests run against real Postgres, not mocks.
- Flaky tests are fixed, not retried or skipped.

## Dependencies

- Keep direct runtime dependencies few. Prefer Node and platform built-ins.
- A new dependency needs a one-paragraph justification in the PR: why, alternatives, maintenance status. Add it to `docs/lifecycle.md` if it has a support end date.
- Never add install scripts, never use `npm install` in CI, always commit the lockfile.
- GitHub Actions are pinned to a full commit SHA.

## Database

- All schema changes via migrations in `migrations/`. Never edit an applied migration.
- Migrations must be backward compatible (expand/contract) so the previous app version still works during slot swap.

## Infrastructure

- All Azure resources are defined in Bicep. Never create or change resources manually or via ad-hoc CLI commands. The only exceptions are temporary, always-removed PostgreSQL firewall rules for the CI migration job and the owner's database bootstrap (ADR 0007).
- Do not create or modify role assignments, federated credentials or Key Vault access without explicit approval.
- Two Bicep layers (ADR 0007): `infra/bootstrap/` holds all identities, federated credentials, app registrations and role assignments and is deployed only by the owner; `infra/main/` is deployed by the pipeline and must contain no role assignments.

## Never

- Disable, skip or weaken a test, lint rule, coverage/mutation threshold or CI check to get a green build.
- Commit secrets, connection strings or `.env` files.
- Introduce services, libraries or hosting models outside the decided stack without an ADR.
- Silence errors with empty catch blocks.

## Learnings

When I correct you on something that is likely to recur, suggest a one-line addition to this file or to `docs/learnings.md`.
