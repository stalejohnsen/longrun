# Learnings

Short, durable lessons from working on Longrun. One line each, newest last. `CLAUDE.md` holds the rules; this file holds the lessons behind them.

- Stacked PRs: merge bottom-up and delete each base branch on merge, or GitHub merges the next PR into the old branch instead of `main`. The repository now deletes head branches on merge automatically (2026-09-26).
- Library docs can lag the released package: Kysely's website still showed `Migrator` imported from `kysely`, but 0.29 moved it to `kysely/migration`. Trust a failing test and the package's own exports over examples (2026-09-26).
- Next.js 16 only logs errors thrown from `instrumentation.ts` `register()` and keeps serving; exit explicitly when startup validation fails (2026-09-26).
- GitHub OIDC subjects for repositories created after 2026-07-15 include immutable IDs (`repo:owner@ownerId/repo@repoId:...`). Build federated credential subjects from `gh api repos/OWNER/REPO` IDs, not names; the first deploy failed with AADSTS700213 (2026-09-26).
- The pipeline (Contributor on one resource group) cannot register resource providers. A new resource type in Bicep (for example `Microsoft.Network`) needs the owner to register its provider first, or the deploy fails with `MissingSubscriptionRegistration` (2026-09-26).
- App Service built-in auth answers unauthenticated non-browser requests (e.g. curl) with `401` and a `WWW-Authenticate: Bearer` challenge, and redirects browsers (`302`) straight to `login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize`, not via `/.auth/login/aad`. Check both, with and without browser headers (2026-09-27).
- Deleting PostgreSQL Flexible Server firewall rules took about 5 seconds each, while creating (or re-applying) them took about a minute each. Measure an operation before designing around it (2026-09-27).
- Before designing a mechanism, look for the platform's documented, common pattern. A custom scheme for letting the pipeline call a slot behind built-in auth (and telling app tokens from users) was replaced by the standard one: anonymous `/health`, swap warm-up on `/health`, and an anonymous smoke test (2026-09-27).
- Don't mix clocks: `created_at` came from the database (`now()`) and `updated_at` from the app (`new Date()`), so with a few milliseconds of skew an update looked older than the creation. This showed up as a flaky test and was a real bug. Timestamps compared with each other come from one clock (2026-09-27).
- A `pg` pool needs an `error` listener: idle connections report database restarts and network drops through it, and without a listener Node can crash the process (node-postgres Pool docs). Found when CI on `main` failed with unhandled `57P01` errors as a test container shut down (2026-09-27).
