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
- A GitHub OIDC federated credential on the pipeline identity, subject `repo:stalejohnsen@98233333/longrun@1389214305:environment:production` only. This is GitHub's immutable subject format (owner and repository IDs), the default for repositories created after 2026-07-15 ([changelog](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/)).
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
  - the app reaches it over a **private endpoint** (see below);
  - public access stays enabled but with **no permanent firewall rules** and no "allow all Azure services" rule. Only the temporary CI migration and owner bootstrap rules use it.
- **Private network path** (amended 2026-09-26):
  - virtual network `vnet-longrun` (`10.60.0.0/24`) with `snet-app` (`/26`, delegated to App Service) and `snet-private-endpoints` (`/28`);
  - a private endpoint for the PostgreSQL server (`postgresqlServer`) and the private DNS zone `privatelink.postgres.database.azure.com` linked to the VNet;
  - App Service virtual network integration on both slots. It isn't swapped, so each slot is configured, both on `snet-app`. Only private (RFC 1918) traffic goes through the VNet; internet egress is unchanged.

### Amendment 2026-09-26: private endpoint instead of outbound-IP firewall rules

The first design allowed the web app's `possibleOutboundIpAddresses` through firewall rules. That was **31 addresses**, while the app actually used 7; the rest are addresses App Service might switch to. Each Flexible Server firewall rule is a serialized server configuration change of about one minute, even when unchanged, so every deploy took about 30 extra minutes. A "skip if unchanged" check hid the cost, but it was a workaround: it didn't remove the dependency on an IP list we don't control, and a real change would still cost 30 minutes.

A private endpoint with App Service virtual network integration removes the dependency. It's Microsoft's recommended alternative, it works with public access and Entra authentication ([Private Link for Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private-link)), and it's more secure: app-to-database traffic never uses public addresses.

- Virtual network integration has no extra charge ([VNet integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration)).
- The private DNS zone costs $0.50/month.
- The private endpoint is billed per hour plus per GB processed ([Private Link pricing](https://azure.microsoft.com/pricing/details/private-link/)).

Rejected alternatives:

- **Only the 7 current outbound IPs:** breaks when App Service changes them.
- **"Allow all Azure services":** weakest network isolation.

The 31 legacy `app-outbound-*` rules are removed once, after the private path is verified (`docs/runbooks/remove-legacy-firewall-rules.md`).

The pipeline never gets Microsoft Graph permissions or the right to assign roles. **Main contains no role assignments.**

### Deployment workflow (`.github/workflows/deploy.yml`)

Started **manually** by the owner on `main` (`workflow_dispatch`); the manual start is the approval. It refuses commits whose CI didn't succeed and runs in GitHub environment `production`, the only OIDC subject trusted. _(Amended 2026-09-26: environment reviewers are not available for private repositories on the owner's GitHub plan, so the approval is the manual start.)_

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

The owner uses the same pattern once, during the database bootstrap: a rule named `owner-bootstrap` for their own IP address, removed at the end of `docs/runbooks/database-bootstrap.md`.

These are short-lived changes outside Bicep. It is a **deliberate, documented exception** to `CLAUDE.md`'s "never change resources via ad-hoc CLI". They are scoped to single firewall rules named `ci-migration-<run id>` and `owner-bootstrap`. The alternative is private networking with a runner inside Azure; it was rejected for now on cost and complexity. Revisit it if the app handles sensitive data.

### Staging verification (amended 2026-09-27)

The pipeline has **no access to the app**. It verifies staging with the anonymous `/health`, which reports the build version and database reachability, and with the sign-in check on `/`. App Service also warms up `/health` before every swap and stops the swap unless it returns 200 (`WEBSITE_SWAP_WARMUP_PING_PATH`/`STATUSES`) ([staging slots](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots), [App Service team guide](https://azure.github.io/AppService/2020/05/15/Robust-Apps-for-the-cloud.html)).

This replaces the first design, in which staging accepted the pipeline identity's token (ADR 0002 amendment).

### Database roles

The owner, as Entra admin, creates these once by following `docs/runbooks/database-bootstrap.md`:

- `longrun_migrator`: the pipeline identity; owns the schema.
- `longrun_app`: both slot identities; DML only.

### Monitoring

Application Insights is connected through App Service's agent (`ApplicationInsightsAgent_EXTENSION_VERSION=~3`). Node.js autoinstrumentation on Linux is **public preview** ([Monitor App Service](https://learn.microsoft.com/en-us/azure/app-service/monitor-app-service)). It needs no code or dependencies. Moving to code-based OpenTelemetry (GA) would need its own ADR, because it adds a dependency.

### Not now

- **Key Vault:** deferred until the first secret exists. Nothing needs one today.
- **Private networking, custom domain, autoscale, Front Door:** out of scope for now.

## Consequences

- Monthly cost is roughly $85 plus storage and log ingestion. The App Service plan is billed while it exists, even if the app is stopped.
- The owner runs the bootstrap once. Re-running it is idempotent. Changes to bootstrap need the owner again, which is intended, because it holds all identity and role changes.
- Non-secret identifiers go into GitHub **variables** of the `production` environment: tenant, subscription and pipeline client ID. There are no GitHub secrets.
- The migration job passes the pipeline identity's short-lived Entra token as `DATABASE_PASSWORD` to `scripts/migrate.ts` on the runner (outside Azure, where config allows a password). No code change is needed; the token is masked in logs.
- The three items left open in PR B are confirmed during the first deployment (runbook): the `WEBSITE_AUTH_ENABLED` value, the principal claim names, and the health-ping headers.
