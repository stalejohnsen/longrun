# Spec 0002 – Deployment to Azure

Status: Ready
Date: 2026-09-26
Related: [plan](../docs/plan.md) phase 2, ADRs [0002](../docs/adr/0002-authentication-mechanism.md), [0004](../docs/adr/0004-data-access-and-migrations.md), [0007](../docs/adr/0007-infrastructure-and-deployment.md)

## Summary

Every change merged to `main` is built once and deployed to Azure. Infrastructure and database changes are applied first, the new version is verified in the staging slot, and it is swapped into production after the owner approves.

## In scope

- Bicep for bootstrap (owner-run) and main (pipeline-run) infrastructure (ADR 0007).
- A deploy workflow with infrastructure deployment, migrations, staging deployment, verification, approval and swap.
- Runbooks: bootstrap, database bootstrap, first-deployment checks, rollback.

## Out of scope

- Custom domain, private networking, Key Vault, autoscale, multiple environments.
- Feature work (spec 0001 components).

## Behaviour

### Pull requests

- CI (existing) also builds and lints all Bicep files offline (`bicep build` / `bicep lint`).
- No Azure access from pull requests.

### Deploy (started manually on `main`)

The owner starts the `Deploy` workflow on `main` (Actions → Deploy → Run workflow). There is no automatic trigger. Steps 1–6 run in the `staging` job (GitHub environment `staging`, no reviewer). Steps 7–8 run in the `production` job, which waits for **the owner's approval in the `production` environment** after the owner has reviewed staging. Mode `infra-only` stops after step 3; it is used once, before the database bootstrap (`docs/runbooks/first-deployment.md`).

_(Amended 2026-09-27: at first the repository was private, where GitHub offers no environment reviewers on this plan, so the manual start was the approval. The repository is now public (ADR 0008), and the approval sits before the swap, where the owner can review staging first.)_

1. **Build:** the standalone bundle is built once, with `DEPLOYMENT_ID` = commit SHA, and stored as a workflow artifact. Every later step uses this artifact.
2. **CI gate:** the workflow refuses to run unless the `verify` and `infra` CI checks succeeded for the commit.
3. **Infrastructure:** `what-if` output is shown in the job log, then `infra/main` is deployed. The staging slot gets the Node.js runtime from `.node-version`. The production slot keeps the runtime it runs now, read from Azure. A new runtime reaches production only through the swap, because App Service swaps the Node.js version with the slot ([which settings are swapped](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots#which-settings-are-swapped)).
4. **Migrations:**
   - A temporary firewall rule `ci-migration-<run id>` is added for the runner's IP address.
   - `scripts/migrate.ts` runs as `longrun_migrator` using the runner's Entra token.
   - The rule is removed in an always-run step.
5. **Staging:** the bundle is deployed to the `staging` slot, and the job waits until the anonymous `/health` reports the new version (commit SHA).
6. **Verify:**
   - Unauthenticated requests to staging are stopped by built-in auth: a non-browser request gets `401` with a `WWW-Authenticate: Bearer` challenge, and a browser request is redirected (`302`) to the tenant's Microsoft Entra authorize endpoint (`scripts/ci/check-signin-required.sh`).
   - The anonymous `GET /health` reports `"status":"ok"`. The pipeline has no identity in the app (ADR 0002 amendment).
7. **Approval, then swap:** the `production` job waits for the owner, who reviews staging (its URL is on the run page) and approves or rejects. It checks that staging still serves the reviewed commit, then swaps `staging` into production. App Service first warms up `/health` on the slot and stops the swap unless it returns 200.
8. **Post-swap check:** production requires sign-in, checked the same way as staging (401 challenge for clients, 302 to Microsoft Entra for browsers), and `/health` reports the new commit.

## Acceptance criteria

| #   | Criterion                                                                                                                                                                                                                                                         | Verified by                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D1  | The deploy workflow runs only for commits on `main` whose CI succeeded.                                                                                                                                                                                           | Workflow trigger config, reviewed in PR                                                                          |
| D2  | Pull requests build and lint all Bicep without Azure credentials.                                                                                                                                                                                                 | CI job                                                                                                           |
| D3  | The same build artifact is deployed to staging and swapped to production. No rebuild happens after approval.                                                                                                                                                      | Workflow structure; `DEPLOYMENT_ID` check in step 5                                                              |
| D4  | Production does not change before the owner approves in the `production` environment, after reviewing staging. Infrastructure, migrations and staging run before that approval, only for a deploy the owner started on `main` with green CI (amended 2026-09-27). | Environment protection rule; job structure                                                                       |
| D5  | A failed migration stops the deployment before staging is touched.                                                                                                                                                                                                | Job dependencies                                                                                                 |
| D6  | The temporary firewall rule is removed on success and on failure.                                                                                                                                                                                                 | Always-run step; runbook check after first deployment                                                            |
| D7  | Staging verification fails the deployment unless sign-in is enforced on `/` and the anonymous `/health` reports `ok`.                                                                                                                                             | Verify step                                                                                                      |
| D8  | Production is only changed by the swap, and only after D7 passes. This includes the Node.js runtime: the infrastructure step never changes the production slot's runtime.                                                                                         | Job dependencies                                                                                                 |
| D9  | The repository and GitHub hold no credentials. Identifiers (tenant, subscription, client IDs, database administrator) are environment secrets only so logs mask them (ADR 0007, amended).                                                                         | Review; `gh secret list --env production` and `--env staging` show only those identifiers; no repository secrets |
| D10 | The pipeline identity has `Contributor` on `rg-longrun` only. No Graph permissions, no role-assignment rights.                                                                                                                                                    | Bootstrap Bicep review; runbook check                                                                            |
| D11 | Rollback is a documented second swap.                                                                                                                                                                                                                             | `docs/runbooks/rollback.md`                                                                                      |
| D12 | In production, the app starts only with built-in auth enabled and managed identity configured (spec 0001 config rules).                                                                                                                                           | First-deployment runbook                                                                                         |

## Error cases

- **E1** `what-if` or the infrastructure deployment fails → the workflow stops. Nothing is deployed and no migration runs.
- **E2** Adding the firewall rule fails → the workflow stops before migrations.
- **E3** The staging deployment never reports the new `DEPLOYMENT_ID` within 10 minutes → the workflow fails and there is no swap.
- **E4** Verification fails → no swap, and the job log shows which check failed without printing tokens.
- **E4a** The owner rejects the `production` job, or staging no longer serves the reviewed commit when approved → no swap; production is untouched. Migrations have already run, which is safe because they are backward compatible.
- **E5** The swap fails → the job fails. If an instance fails to restart during the swap, App Service reverts the swap itself ([staging slots](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots)). Otherwise, follow the rollback runbook.

## Follow-ups tracked here

- ~~Server actions must reject app-only principals~~ Resolved 2026-09-27: no application can call the app any more; only the slot's own client ID is accepted (ADR 0002 amendment).
- ~~Confirm on first deployment~~ **Confirmed 2026-09-27** (deploy run 36308152554):
  - `WEBSITE_AUTH_ENABLED`: the app starts in Azure, so config validation accepts the platform's value.
  - Principal claim names: the owner signed in with a browser and sees the Longrun page, and the pipeline's app-only token passed the app's identity check on staging.
  - Health-ping headers: App Service `HealthCheckStatus` was 100 in every 5-minute interval after the swap, so the platform's pings are accepted by `/health`.
