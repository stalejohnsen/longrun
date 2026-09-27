# 0002 – Authentication mechanism

Status: Accepted
Date: 2026-09-26

## Context

`CLAUDE.md` decides that users sign in with Entra ID and that authentication is required on every route except the health endpoint. It does not decide _where_ sign-in happens. ADR 0001 chose Next.js (server-rendered first) on App Service Linux with a staging slot. It also noted that keeping unauthenticated traffic away from Next.js limits exposure to pre-auth framework vulnerabilities such as CVE-2025-55182.

Requirements:

- Entra ID workforce sign-in (one tenant). Every signed-in user may read and edit (plan: "anyone signed in").
- No secrets in the repo, pipeline or plain app settings. Prefer managed identity over secrets.
- Works with the staging-slot-then-swap deployment.
- Few dependencies, little security-sensitive code of our own.
- Works for local development and automated tests.

Facts checked on 2026-09-26 (Microsoft Learn, npm registry):

**App Service built-in authentication**

- It runs in a separate container in front of the app on Linux. It handles the sign-in flow, the session cookie and token validation. It passes the user identity to the app in `X-MS-CLIENT-PRINCIPAL*` headers, and the docs state that external requests are not allowed to set these headers ([user identities](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities)).
- It can use a **managed identity federated credential instead of a client secret**: a user-assigned managed identity plus the slot-sticky setting `OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID`. This works for workforce tenants only. Without either a secret or this credential, it falls back to the implicit flow, which Microsoft does not recommend ([Entra provider](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-provider-aad)).
- It has built-in checks for allowed tenants and identities (`WEBSITE_AUTH_AAD_ALLOWED_TENANTS`, `defaultAuthorizationPolicy`).
- It rejects cookie-authenticated cross-site `POST`s from browsers (CSRF mitigation) ([overview](https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization)).
- It is configurable in Bicep through `Microsoft.Web/sites/config` `authsettingsV2`, including `globalValidation.requireAuthentication`, `unauthenticatedClientAction` and `excludedPaths` ([template reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.web/sites/config-authsettingsv2)).
- **Slots:**
  - During a swap, the target slot's authentication settings are applied to the source slot, so they stay with the slot, not the code.
  - "Swap with preview" is **not available** when authentication is enabled.
  - Managed identities are not swapped.
  - Microsoft recommends a separate app registration per slot ([staging slots](https://learn.microsoft.com/en-us/azure/app-service/deploy-staging-slots)).
- **Health check** integrates with built-in auth with no extra settings. With a custom auth system, the health path must allow anonymous access ([health check](https://learn.microsoft.com/en-us/azure/app-service/monitor-instances-health-check)).

**In-app libraries** (versions from npm)

- `@azure/msal-node` 7.0.0: Microsoft's official library, 2 direct dependencies.
- `openid-client` 6.8.8: generic OpenID Connect client, 2 direct dependencies.
- `better-auth` 1.7.6: full auth framework, 17 direct dependencies including database adapters and a telemetry package. It needs its own database tables.
- `next-auth` (Auth.js): v5 is still `5.0.0-beta.32` and the project is now maintained by the Better Auth team, which recommends Better Auth for new projects ([announcement](https://better-auth.com/blog/authjs-joins-better-auth)).

## Options

### A. App Service built-in authentication (Easy Auth), app reads the identity headers

- Pros:
  - Unauthenticated requests never reach Next.js.
  - No sign-in, session or token code in the app.
  - Zero npm dependencies.
  - Secretless via the managed identity federated credential.
  - Configured in Bicep.
  - Health check works without opening a public path.
- Cons:
  - Tied to App Service, which is acceptable because the hosting is already decided.
  - Does not exist locally, so development and tests need a stand-in identity (see Consequences).
  - One app registration and one user-assigned managed identity per slot.
  - No swap with preview.
  - We learn less about OIDC internals.

### B. MSAL Node in the app

- Pros:
  - Official Microsoft library, few dependencies, full control.
  - Can be secretless by using a managed-identity token as a client assertion.
- Cons:
  - We write session handling, cookie encryption, sign-in state/PKCE handling and sign-out ourselves. That is security-critical code to own and test.
  - Needs a session encryption key, which is a secret in Key Vault.
  - Every request reaches Next.js before auth runs.

### C. `openid-client` in the app

- Pros: well-maintained generic OpenID Connect client, small.
- Cons: same as B (own session code, a session secret, auth runs inside Next.js), with less Entra-specific help.

### D. Better Auth (rejected)

- Pros: complete framework with sessions included.
- Rejected because:
  - Large dependency tree with a telemetry package included.
  - Needs its own tables and migrations.
  - It solves problems we don't have (multiple providers, email/password, organisations).

### E. Auth.js / NextAuth v5 (rejected)

- Rejected because v5 has been in beta for a long time and its maintainers recommend another library for new projects.

## Decision

**A: App Service built-in authentication** with the Microsoft Entra provider:

- Workforce tenant, single tenant; `WEBSITE_AUTH_AAD_ALLOWED_TENANTS` limited to our tenant.
- `requireAuthentication: true`, `unauthenticatedClientAction: RedirectToLoginPage`.
- **No client secret.** A user-assigned managed identity with a federated identity credential on the app registration (`OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID`, slot-sticky).
- One app registration and one user-assigned identity per slot (production, staging), as Microsoft recommends.
- Issuer URL on the v2.0 endpoint (`https://login.microsoftonline.com/<tenant-id>/v2.0`).
- **Health endpoint:** not excluded by default, because the platform health check works with built-in auth. `/health` is added to `excludedPaths` only if we later need external uptime monitoring. `CLAUDE.md` allows this exception.

The app still defends itself. It does not assume the platform is configured correctly.

## Consequences

### App code (defence in depth)

- One server-side helper parses and validates `X-MS-CLIENT-PRINCIPAL` with a schema and returns the user (object ID and display name) or nothing.
- Every page, server action and route handler requires a user. A missing or invalid header returns 401. This is also checked centrally in Next.js `proxy`, but each server action checks again, because server actions must not rely on page-level checks alone.
- The app fails at startup in Azure if it cannot confirm that built-in auth is enabled. **Verified (skeleton PR B):** App Service injects the read-only variable `WEBSITE_AUTH_ENABLED` when built-in authentication is enabled ([app settings reference](https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings)). "In Azure" is detected by the read-only `WEBSITE_SITE_NAME`, which the platform injects and the app cannot unset. The exact value format of `WEBSITE_AUTH_ENABLED` is accepted case-insensitively. **Confirmed on the first deployment (2026-09-27):** the app starts in Azure, so the platform's value passes config validation.
- Sign-out links to `/.auth/logout`.
- User names and IDs are not logged (`CLAUDE.md`: no personal data in logs).

### Local development and tests

- A development-only stand-in identity provides a fixed test user. It is enabled only by `LONGRUN_DEV_IDENTITY=true`, and the app refuses to start if that setting is present **in Azure**. (Refined from "with `NODE_ENV=production`": the end-to-end tests run a production build locally, so the Azure signal is the reliable boundary.) This is security-sensitive and has its own tests.
- The principal parser accepts the object ID under both the mapped claim name (`http://schemas.microsoft.com/identity/claims/objectidentifier`) and `oid`, and exposes only the object ID. **Confirmed on the first deployment (2026-09-27):** browser sign-in by the owner and the pipeline's app-only token both pass the parser.
- Tests cover:
  - valid header → user;
  - missing or invalid header → 401;
  - stand-in identity refused in production;
  - every server action rejects unauthenticated calls.

### Infrastructure (needs explicit approval per `CLAUDE.md`)

- Bicep: `authsettingsV2` for each slot, user-assigned identities, and slot-sticky app settings.
- App registrations and federated identity credentials are Entra objects, not Azure resources. How they are provisioned (Bicep extension, script or runbook) is decided in the infrastructure phase. Creating them requires your explicit approval.
- `docs/runbooks/` gets a runbook for the one-time Entra setup.

### Deployment

- Swaps are plain swaps (no preview). We verify the staging slot on its own URL before swapping, signed in through its own app registration.

### Scope

- Authorization stays simple: any signed-in user in the tenant may read and edit. If a spec later needs roles, Entra app roles appear as claims in the same header.

## Follow-up

- Verify the "built-in auth is enabled" signal and the exact header claim names in the skeleton task, with tests.
- Test runner, database driver/query layer, migration tool, validation library ADRs.
