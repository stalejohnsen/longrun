# 0007 – Infrastructure layout and deployment

Status: Accepted
Date: 2026-09-26

## Context

Phase 2 of the plan deploys Longrun to Azure. The stack is already decided in `CLAUDE.md` and ADRs 0001–0006:

- App Service Linux with a staging slot;
- PostgreSQL Flexible Server with Entra-only authentication;
- Application Insights;
- Bicep for everything;
- GitHub Actions with OIDC;
- App Service built-in authentication, secretless;
- migrations run from CI as `longrun_migrator`.

`CLAUDE.md` also requires:

- least privilege for every identity;
- no manual or ad-hoc resource changes;
- explicit approval for role assignments, federated credentials and Key Vault access.

Choices made with the owner on 2026-09-26: region `swedencentral`, cheapest possible SKUs, public database access with firewall rules, Key Vault deferred, PostgreSQL 17, and staging verified through built-in auth.

Facts checked on 2026-09-26:

- **Deployment slots** require Standard, Premium or Isolated ([staging slots](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots)).
- **Retail prices in `swedencentral`** ([Azure Retail Prices API](https://prices.azure.com/api/retail/prices)):
  - App Service Linux **P0v3 $0.089/hour** (about $65/month), S1 $0.095/hour, B1 $0.018/hour (no slots);
  - PostgreSQL Flexible Server Burstable **B1ms $0.0199/hour** (about $15/month) plus storage.
- **PostgreSQL** majors 14–18 are available; 17.11 is the current 17 minor ([supported versions](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-supported-versions)).
- **Microsoft Graph Bicep** (app registrations, federated credentials) has been GA since July 2025 (`microsoftgraph/v1.0:1.0.0`, Bicep ≥ 0.36.1) ([what's new](https://learn.microsoft.com/en-us/graph/templates/bicep/whats-new)).
- **Slot swap behaviour:** authentication settings stay with the slot, managed identities are not swapped, and swap with preview is unavailable with built-in auth (ADR 0002).

## Decision

### Two Bicep layers

| Layer              | Deployed by                                                          | Changes      | Contents  |
| ------------------ | -------------------------------------------------------------------- | ------------ | --------- |
| `infra/bootstrap/` | The owner, from their machine, with their own Azure and Entra rights | Rarely       | See below |
| `infra/main/`      | The pipeline (`Contributor` on the resource group only)              | Every deploy | See below |

**Bootstrap** contains:

- Resource group `rg-longrun` in `swedencentral`.
- User-assigned identities `id-longrun-pipeline`, `id-longrun-app-prod` and `id-longrun-app-staging`.
- A GitHub OIDC federated credential on the pipeline identity, subject `repo:stalejohnsen/longrun:environment:production` only.
- Two Entra app registrations for built-in auth (production and staging). Each trusts its slot's identity through a federated credential, so there is no client secret (ADR 0002).
- `Contributor` for the pipeline identity on `rg-longrun`.
- A monthly cost budget with alerts (default $100).

**Main** contains:

- Log Analytics workspace and Application Insights (workspace-based).
- App Service plan **P0v3** Linux, one instance.
- Web app plus `staging` slot:
  - `NODE|24-lts`, startup command `node server.js` on the standalone bundle;
  - HTTPS only, TLS 1.2 minimum, FTP disabled;
  - health check path `/health`;
  - each slot uses its own user-assigned identity;
  - `authsettingsV2` per slot as ADR 0002 specifies;
  - slot-sticky app settings for identity and database user.
- PostgreSQL Flexible Server **B1ms**, version **17**, 32 GB storage, no HA, 7-day backups:
  - **Entra-only authentication**, with the owner as Entra admin for bootstrap only;
  - public access with firewall rules for the web app's outbound IP addresses;
  - no "allow all Azure services" rule.

The pipeline never gets Microsoft Graph permissions or the right to assign roles. **Main contains no role assignments.**

### Deployment workflow (`.github/workflows/deploy.yml`)

Runs after CI succeeds on `main`, in GitHub environment `production`, which requires the owner's approval:

1. Build the standalone bundle once, with `DEPLOYMENT_ID` set to the commit SHA.
2. Run `what-if` on `infra/main`, then deploy it.
3. Run migrations (see below).
4. Deploy the bundle to the `staging` slot.
5. Verify staging (spec 0002).
6. Swap `staging` into production.

### Migrations over public access (exception)

GitHub-hosted runners have changing IP addresses. The migration job therefore:

1. adds a **temporary** firewall rule for its own IP address;
2. runs `scripts/migrate.ts` as `longrun_migrator`, authenticated with the pipeline identity's Entra token;
3. **always** removes the rule, even on failure.

This is a pipeline-automated, short-lived change outside Bicep. It is a **deliberate, documented exception** to `CLAUDE.md`'s "never change resources via ad-hoc CLI". It is scoped to one firewall rule named `ci-migration-<run id>`. The alternative is private networking with a runner inside Azure; it was rejected for now on cost and complexity. Revisit it if the app handles sensitive data.

### Staging verification through built-in auth

The staging slot's auth settings allow tokens from the pipeline identity (`allowedApplications`); production's do not. The pipeline requests a token for the staging app registration and calls `/health`. That proves auth, app and database work together before the swap.

Risk: staging uses the production database, so this caller could in principle reach other routes. Mitigations:

- the pipeline only calls `/health`;
- spec 0001's server actions require a signed-in **user**, and app-only principals are rejected once features land (tracked in spec 0002).

### Database roles

The owner, as Entra admin, creates these once by following `docs/runbooks/database-bootstrap.md`:

- `longrun_migrator`: the pipeline identity; owns the schema.
- `longrun_app`: both slot identities; DML only.

### Not now

- **Key Vault:** deferred until the first secret exists. Nothing needs one today.
- **Private networking, custom domain, autoscale, Front Door:** out of scope for now.

## Consequences

- Monthly cost is roughly $85 plus storage and log ingestion. The App Service plan is billed while it exists, even if the app is stopped.
- The owner runs the bootstrap once. Re-running it is idempotent. Changes to bootstrap need the owner again, which is intended, because it holds all identity and role changes.
- Non-secret identifiers go into GitHub **variables** of the `production` environment: tenant, subscription and pipeline client ID. There are no GitHub secrets.
- The migration CLI must support a token from the runner's Azure login (not managed identity). This is a small change in `src/db/pool.ts` and config, made in the deploy-workflow PR.
- The three items left open in PR B are confirmed during the first deployment (runbook): the `WEBSITE_AUTH_ENABLED` value, the principal claim names, and the health-ping headers.
