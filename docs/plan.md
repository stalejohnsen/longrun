# Longrun – plan

Status: draft
Last updated: 2026-09-26

## Background

Teams run many technology components (runtimes, frameworks, databases, operating systems, libraries) and lose track of when each one reaches end of support. That shows up late as a rushed upgrade or an unsupported production system.

Longrun is a small lifecycle register. Users record the components they use and see which ones reach end of support soon. It is also a learning project: the main goal is to practise agentic coding on Azure with a production-grade setup (IaC, OIDC deployments, managed identity, tests, specs, ADRs). Keeping it small is part of that goal.

## Goals

- Register a technology component with name, version, where it is used and owner.
- Show which registered components reach end of support within a window the user chooses (typically 6–12 months).
- Run on Azure with a secure-by-default setup: Entra ID sign-in, managed identity to the database, no secrets in code or pipeline.
- Deliver every change through spec, PR, CI and automated deployment.

## Non-goals

- Automated discovery or scanning of components (SBOMs, repo scanning, cloud inventory).
- Notifications (email, Teams, etc.).
- Multi-tenant support or organisation management beyond Entra ID sign-in.
- Anything else not described in a spec in `specs/`.

## Users

Engineers and team leads in one organisation who own systems and need to plan upgrades. They sign in with Entra ID.

## Architecture (decided)

| Concern | Choice |
| --- | --- |
| Language / runtime | TypeScript on Node LTS |
| Web framework | Next.js (App Router) with React, server-rendered first ([ADR 0001](adr/0001-web-framework-and-rendering.md)) |
| Hosting | Azure App Service (Linux), single environment with a staging slot; deploy to staging, verify, then swap |
| Database | Azure Database for PostgreSQL Flexible Server |
| Secrets | Azure Key Vault (Key Vault references, managed identity) |
| Observability | Application Insights, structured logging |
| Infrastructure | Bicep |
| CI/CD | GitHub Actions with OIDC to Azure |
| Identity | Entra ID for user sign-in; managed identity for database access |

End-of-support dates come from endoflife.date where available, with manual entry as the fallback. That data is treated as untrusted: validated, called with timeouts, and failures handled (the user can still enter a date manually).

## Decisions pending (ADRs to write)

Each needs an ADR in `docs/adr/` with options and trade-offs before code depends on it:

1. Test runner (must cover React components; see ADR 0001)
2. Database driver / query layer
3. Migration tool
4. Validation library
5. Authentication mechanism (App Service built-in auth vs. in-app OIDC library)

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

- Bicep for App Service, PostgreSQL Flexible Server, Key Vault, Application Insights.
- GitHub Actions deployment with OIDC; deploy to staging slot, then swap.
- Runbook in `docs/runbooks/` for first-time setup (federated credential, role assignments; these require explicit approval).

### Phase 3 – Authentication

- Entra ID sign-in; every route except health requires authentication.
- App connects to PostgreSQL with managed identity.

### Phase 4 – Component register

- Create, list, edit and delete components (exact scope set by the spec).
- Database migrations for the component table.

### Phase 5 – End-of-support view

- Look up end-of-support dates from endoflife.date when the product is supported; manual entry otherwise.
- View of components reaching end of support within a user-chosen window.

## Quality bar

- Every acceptance criterion and error case in a spec has a test.
- Integration tests run against real PostgreSQL.
- Lint, typecheck and all tests pass before a task is done.
- Migrations are backward compatible (expand/contract) so slot swaps are safe.

## Product decisions

Decided 2026-09-26. Specs build on these.

| Question | Decision |
| --- | --- |
| Source of end-of-support dates | Looked up from endoflife.date when the product is supported there; otherwise entered manually. |
| "Where it is used" | Free text. |
| Owner | Free-text name (not linked to an Entra ID user or team). |
| End-of-support window | Chosen by the user (6–12 months is the typical range). |
| Who may edit or delete a component | Anyone signed in. |
| Environments | One Azure environment. The App Service staging slot is used for pre-production verification, then swapped into production. No separate dev/test environment. |
