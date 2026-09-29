# CLAUDE.md

Longrun is a lifecycle register: users register technology components (name, version, where used, owner) and see which reach end of support within a chosen window. It is a learning project for agentic coding on Azure, and its main question is whether an AI-generated codebase stays maintainable over time. Keep it small; no features outside a spec. Plan: `docs/plan.md`. Decisions: `docs/adr/` (index in its README). Specs: `specs/`.

## Stack (changing any item needs an ADR)

TypeScript on Node LTS · Next.js App Router, server-rendered first (ADR 0001) · App Service (Linux) with built-in Entra auth; the app still validates the identity header everywhere (0002) · PostgreSQL Flexible Server with managed identity, `pg` + Kysely, raw SQL only via Kysely `sql`, Kysely Migrator run from CI as `longrun_migrator`, app role without DDL (0004) · Zod 4 at every boundary, Zod 4 APIs only (0005) · Vitest + Testcontainers, Playwright against a production build, no retries (0003) · ESLint 9 + Prettier; TypeScript pinned to 6.0.x (0006) · Bicep, GitHub Actions with OIDC, Key Vault, Application Insights (0007) · Dependabot, zizmor, CodeQL (0008) · Claude routines for maintenance (0009). Any other new library, service or tool needs an ADR draft with options and trade-offs; do not pick on your own.

## Workflow

- New work starts as an intent in `intents/` (the owner's words: what and why), then a spec in `specs/`. No code without a spec; if it is missing or unclear, stop and ask.
- Apply the organisation design rules (`org-design-rules` skill, DR-01 to DR-21) while writing specs and while building UI or data. Specs cite the rules they rely on.
- Start every task with a short plan: files, tests, risks. Wait for approval on anything touching infra, auth, security or dependencies.
- One task per branch and PR; small diffs. Update docs, specs and ADRs in the same PR as the code.
- When unsure, ask. Do not guess about Azure behaviour, library APIs or versions; check official docs.
- Before designing a mechanism, find the platform's documented, commonly used pattern and prefer it.
- After a PR, return the working copy to an up-to-date `main`.

## Commands (Node >= 24.15, see `.node-version`; Docker for Testcontainers)

`npm ci` · `npm run lint` · `npm run format:check` · `npm run typecheck` · `npm test` (unit, component) · `npm run test:integration` · `npm run test:e2e` (first time `npx playwright install chromium`) · `npm run test:coverage` (as in CI) · `npm run test:all` · `npm run db:migrate` · `npm run dev` · `npm run build && npm start`. Local setup: `docs/runbooks/local-development.md`. Run lint, typecheck and all tests before declaring a task done.

## Layout

`intents/` · `src/` app · `test/` mirrors `src/` · `migrations/` · `infra/` Bicep · `specs/` · `scripts/` (CI, migrations, Claude hooks) · `.claude/` (settings, hooks, skills) · `docs/adr/`, `docs/runbooks/`, `docs/lifecycle.md`, `docs/learnings.md`, `docs/maintenance-log.md`.

## Security (secure by default)

- Validate all external input with a schema at the boundary (HTTP, external APIs, config). Parameterized queries only.
- No secrets in the repo, pipeline variables or plain app settings; use managed identity and Key Vault references.
- Least privilege for every identity. HTTPS only, security headers; authentication on every route except `/health`.
- Never log personal data, tokens or secrets; structured logging only.
- Treat external API data (e.g. endoflife.date) as untrusted: validate, time out, handle failure.

## Testing

Tests describe behaviour from the spec; every acceptance criterion and error case has a test. Integration tests use real Postgres. Flaky tests are fixed, never retried or skipped.

## Dependencies

Few runtime dependencies; prefer built-ins. A new one needs a one-paragraph justification (why, alternatives, maintenance) and a `docs/lifecycle.md` row if it has a support end. No install scripts, no `npm install` in CI, lockfile committed, Actions pinned to a full SHA.

## Database and infrastructure

- Schema changes only via new migrations; never edit an applied one. Migrations are expand/contract, so the previous version works during the slot swap.
- All Azure resources in Bicep; no manual or ad-hoc CLI changes, except temporary, always-removed PostgreSQL firewall rules for CI migrations and the owner's database bootstrap (ADR 0007).
- `infra/bootstrap/` (identities, federated credentials, app registrations, role assignments) is deployed only by the owner; `infra/main/` has no role assignments. Never create or change role assignments, federated credentials or Key Vault access without explicit approval.

## Never

Weaken a test, lint rule, coverage threshold or CI check to get green · commit secrets, connection strings or `.env` files · add services, libraries or hosting models without an ADR · silence errors with empty catch blocks. Hooks in `.claude/settings.json` enforce part of this (spec 0004); a block is a stop sign, never something to work around.

## Learnings

When I correct you on something likely to recur, suggest a one-line addition here or to `docs/learnings.md`.
