# Longrun – plan

Status: draft
Last updated: 2026-09-27

## Background

Teams run many technology components (runtimes, frameworks, databases, operating systems, libraries) and lose track of when each one reaches end of support. That shows up late as a rushed upgrade or an unsupported production system.

Longrun is a small lifecycle register. Users record the components they use and see which ones reach end of support soon. It is also a learning project: the main goal is to practise agentic coding on Azure with a production-grade setup (IaC, OIDC deployments, managed identity, tests, specs, ADRs). Keeping it small is part of that goal.

## Goals

- Register a technology component with name, version, where it is used and owner.
- Show which registered components reach end of support within a window the user chooses (typically 6–12 months).
- Run on Azure with a secure-by-default setup: Entra ID sign-in, managed identity to the database, no secrets in code or pipeline.
- Deliver every change through spec, PR, CI and automated deployment.
- Show, with recorded evidence, whether an AI-generated codebase stays maintainable end to end over time: dependency updates, CVE patching and major upgrades ([spec 0003](../specs/0003-maintenance-and-supply-chain.md)).

## Non-goals

- Automated discovery or scanning of components (SBOMs, repo scanning, cloud inventory).
- Notifications (email, Teams, etc.).
- Multi-tenant support or organisation management beyond Entra ID sign-in.
- Anything else not described in a spec in `specs/`.

## Users

Engineers and team leads in one organisation who own systems and need to plan upgrades. They sign in with Entra ID.

## Architecture (decided)

| Concern            | Choice                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language / runtime | TypeScript on Node LTS                                                                                                                                           |
| Web framework      | Next.js (App Router) with React, server-rendered first ([ADR 0001](adr/0001-web-framework-and-rendering.md))                                                     |
| Hosting            | Azure App Service (Linux), single environment with a staging slot; deploy to staging, verify, then swap                                                          |
| Database           | Azure Database for PostgreSQL Flexible Server (Entra-only auth); `pg` + Kysely, Kysely Migrator run from CI ([ADR 0004](adr/0004-data-access-and-migrations.md)) |
| Secrets            | Azure Key Vault (Key Vault references, managed identity)                                                                                                         |
| Observability      | Application Insights, structured logging                                                                                                                         |
| Infrastructure     | Bicep                                                                                                                                                            |
| CI/CD              | GitHub Actions with OIDC to Azure                                                                                                                                |
| Identity           | Entra ID user sign-in via App Service built-in auth, secretless ([ADR 0002](adr/0002-authentication-mechanism.md)); managed identity for database access         |
| Validation         | Zod 4 at every boundary: forms, route handlers, identity header, config, endoflife.date ([ADR 0005](adr/0005-validation-library.md))                             |
| Testing            | Vitest (unit, component, integration with Testcontainers Postgres), Playwright end-to-end ([ADR 0003](adr/0003-test-runner.md))                                  |

End-of-support dates come from endoflife.date where available, with manual entry as the fallback. That data is treated as untrusted: validated, called with timeouts, and failures handled (the user can still enter a date manually).

## Decisions pending

None. All stack decisions from `CLAUDE.md` are recorded in `docs/adr/` (0001–0005). New choices need a new ADR.

## Phases

Each phase is one or more small PRs. A phase with code starts with a spec in `specs/`.

### Phase 0 – Foundations

- Repository, `CLAUDE.md`, this plan.
- ADRs for the pending decisions above.
- Spec for the first feature (component register).

### Phase 1 – Application skeleton

- Node/TypeScript project, lint, typecheck, test setup, health endpoint.
- Fill in the Commands section of `CLAUDE.md`.
- CI workflow: install with `npm ci`, lint, typecheck, unit and integration tests (Testcontainers Postgres).

### Phase 2 – Infrastructure and deployment

**Done 2026-09-27.** First production deploy: run 36308152554. The app reaches PostgreSQL over a private endpoint, and the database has no firewall rules.

Spec [0002](../specs/0002-deployment.md), ADR [0007](adr/0007-infrastructure-and-deployment.md). Four PRs:

1. ADR 0007 and spec 0002.
2. Bootstrap Bicep (owner-run) and runbooks: bootstrap, database roles.
3. Main Bicep, with Bicep build and lint in CI.
4. Deploy workflow (manual start on `main` → CI gate → build → infra → migrations → staging → verify → swap), migration token support, rollback and first-deployment runbooks.

### Phase 3 – Authentication

- Entra ID sign-in; every route except health requires authentication.
- App connects to PostgreSQL with managed identity.

### Phase 4 – Component register

**Done 2026-09-27** with spec [0001](../specs/0001-component-register.md): PRs C1 (#24), C2 (#25), C3a (#28), C3b (#29).

- Create, list, edit and delete components (exact scope set by the spec).
- Database migrations for the component table.

### Phase 5 – End-of-support view

**Done 2026-09-27**: endoflife.date lookup in C2 (#25), the view in C4.

- Look up end-of-support dates from endoflife.date when the product is supported; manual entry otherwise.
- View of components reaching end of support within a user-chosen window.

### Phase 6 – Maintenance and supply-chain security

Spec [0003](../specs/0003-maintenance-and-supply-chain.md), ADR [0008](adr/0008-dependency-updates-and-supply-chain.md). **Done 2026-09-27** (#33–#36, #38; #37 added approval before the swap). No app features. Five PRs:

1. ADR 0008 and spec 0003.
2. GitHub settings runbook (public repository, security features, ruleset, environment reviewers).
3. `.npmrc` `min-release-age`, Dependabot configuration, auto-merge workflow.
4. CI gates: `npm audit`, `npm audit signatures`, zizmor.
5. Runbooks (security patch, major upgrade, monthly review) and the maintenance log.

### Phase 7 – Agent governance and the closed loop

Spec [0004](../specs/0004-agent-governance-and-closed-loop.md), ADR [0009](adr/0009-agent-in-the-loop.md). Guardrail hooks and skills, metrics, and scheduled Claude routines that triage failing Dependabot PRs and run the monthly review. The owner still merges and deploys. Five PRs:

1. ADR 0009 and spec 0004.
2. `.claude/settings.json`, hooks with tests, skills, a shorter `CLAUDE.md`.
3. Metrics script and the September numbers.
4. Routines runbook; the owner creates the routines.
5. First month's review and learnings.

## Quality bar

- Every acceptance criterion and error case in a spec has a test.
- Integration tests run against real PostgreSQL.
- Lint, typecheck and all tests pass before a task is done.
- Migrations are backward compatible (expand/contract) so slot swaps are safe.

## Product decisions

Decided 2026-09-26. Specs build on these.

| Question                           | Decision                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source of end-of-support dates     | Looked up from endoflife.date when the product is supported there; otherwise entered manually.                                                               |
| "Where it is used"                 | Free text.                                                                                                                                                   |
| Owner                              | Free-text name (not linked to an Entra ID user or team).                                                                                                     |
| End-of-support window              | Chosen by the user (6–12 months is the typical range).                                                                                                       |
| Who may edit or delete a component | Anyone signed in.                                                                                                                                            |
| Environments                       | One Azure environment. The App Service staging slot is used for pre-production verification, then swapped into production. No separate dev/test environment. |
