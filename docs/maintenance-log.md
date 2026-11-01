# Maintenance log

Evidence for Longrun's main question: does an AI-generated codebase stay maintainable end to end over time? (spec 0003). Append only. Rows are added when an update or alert is handled, and at the latest in the monthly review ([runbook](runbooks/monthly-review.md)).

**Kind:** `version` (Dependabot version update), `security` (vulnerability alert or advisory), `major` (major upgrade), `hardening` (a finding from security tooling). **Code changes by:** `none` (merged as proposed), `agent` (Claude changed code or config), `owner`.

## Updates and vulnerabilities

| Opened | Merged | Deployed | Kind | What | Severity | Window | Code changes by | Link |
| ------ | ------ | -------- | ---- | ---- | -------- | ------ | --------------- | ---- |

| 2026-10-06 – 2026-10-30 | – | – | version | 11 Dependabot update PRs closed without merge, superseded by newer grouped PRs: #54–#63, #66, #68 (`next` 16.3.7, 16.3.8; dev- and runtime-dependencies groups; github-actions group) | – | – | none | #54–#63, #66, #68 |
| 2026-10-19 – 2026-10-31 | – | – | version | 6 Dependabot PRs open, all with `verify` failing at "Audit runtime dependencies": dev-dependencies (9 updates), runtime-dependencies (7), github-actions (4), `vite` 8.3.1 → 8.3.4, `undici` 8.11.2 → 8.12.3, `next` 16.3.6 → 16.4.1 | – | – | none | #64, #69, #67, #65, #70, #71 |
| 2026-10-16 – 2026-10-31 | – | – | security | 26 Dependabot alerts opened in October, 24 open and 2 auto-dismissed (#9 `braces`, #22 `undici`). By package: `next` 14 (GHSA-cjq9-62q9-8jv4 high; GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr critical; GHSA-p3m5-59mp-jv5r high; others medium or low), `vite` 6, `@vitest/mocker` 2, `undici` 2, `@azure/msal-node` 1 (GHSA-xcx6-jx8p-x3h5, high). None fixed by 2026-11-01 | critical (3 distinct), high (4), medium, low | not fixed | – | Alerts #1–#28 |

| 2026-09-29 | 2026-09-29 | – (dev only) | version | `@playwright/test` 1.62.1 → 1.63.0, dev-dependencies group. Drill A: downgraded on purpose in #46 | – | – | none (auto-merged by `github-actions` 4 minutes after opening) | #48 |

## Findings from security tooling

| Found      | Fixed      | Tool           | Finding                                                                                                                                              | Severity                                | Code changes by | Link |
| ---------- | ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------- | ---- |
| 2026-09-27 | 2026-09-27 | Manual review  | Deploy logs printed the database administrator's sign-in name, tenant and subscription IDs (environment variables are not masked)                    | Personal data in logs                   | agent           | #32  |
| 2026-09-27 | 2026-09-27 | zizmor 1.30.1  | Dependabot cooldown shorter than 7 days (2 findings)                                                                                                 | Medium                                  | agent           | #36  |
| 2026-09-27 | 2026-09-27 | zizmor 1.30.1  | Step outputs expanded with `${{ }}` inside `run:` in `deploy.yml` (4 findings)                                                                       | Informational                           | agent           | #36  |
| 2026-09-28 | 2026-09-28 | G4 cloud check | Claude cloud sessions get GitHub MCP tools (merge, auto-merge, trigger workflows, write files through the API) that the guardrail hook did not cover | High (the agent could merge its own PR) | agent           | #44  |
| 2026-09-28 | 2026-09-28 | Manual review  | Code scanning ruleset rule for zizmor waited forever for results tied to a regenerated merge commit                                                  | Blocks merges                           | agent           | #41  |

## Drills and checks

Staged exercises. They test the automation and the agent's judgement; they are not real events and do not count in the metrics.

| Date       | Drill                            | What it tested                                                    | Outcome                                                                                                                                                                                                                                                                                                  | Link     |
| ---------- | -------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 2026-09-28 | G4 cloud checks (three sessions) | Do hooks and permission rules apply in a cloud session?           | Yes: test edit, `printenv` and force push blocked by hooks; the denied GitHub tools were absent from the session. Found the MCP tool gap (#44) and the proxy trust boundary (#45)                                                                                                                        | #44, #45 |
| 2026-09-29 | A: real Dependabot update        | Dependabot, grouping, auto-merge workflow, ruleset (spec 0003 M7) | Dependabot opened #48 for the downgraded `@playwright/test`; it merged itself when CI was green, with no person involved                                                                                                                                                                                 | #46, #48 |
| 2026-09-29 | B: breaking library change       | The triage agent's judgement under the guardrails (spec 0004 L1)  | Correct diagnosis and a one-line fix proposed in a comment; saw that `test/lib/services.test.ts` encodes the old API, so it opened no PR, changed no test and marked `needs-owner`. A later run correctly found no Dependabot PRs, but could not list security alerts (fixed: the skill now uses `curl`) | #47      |

## Monthly summaries

### September 2026 (baseline)

Spec 0003 delivered: #33 (ADR 0008, spec), #34 (GitHub settings), #35 (Dependabot, auto-merge, `min-release-age`), #36 (CI gates, zizmor), #37 (approval before the swap, runtime through the slot).

- **Numbers:** 0 update PRs, 0 security alerts, 0 open code scanning alerts. 2 deploys after the maintenance work started (#32 and #37).
- **Supply chain at baseline:** `npm audit` 0 vulnerabilities (runtime and dev). `npm audit signatures`: 641 packages with verified registry signatures, 128 with attestations.
- **Freshness:** everything is current except the two held tools:
  - ESLint 9.39.5, latest 10.11.0. ESLint 9 is past end of life (2026-08-06), held because the `eslint-config-next` plugins support only ESLint 9. Dev-only.
  - TypeScript 6.0.3, latest 7.0.2. Held because `typescript-eslint` supports `<6.1.0`.
- **What broke / what the agent fixed:** nothing broke. The agent fixed 7 findings (table above), all before merge.
- **Metrics** (`node scripts/metrics.ts 2026-09`, first run 2026-09-28; the first-pass CI and rework numbers match an independent count):

  | Metric                                          | Value                                                                                                                                    |
  | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
  | PRs merged                                      | 41                                                                                                                                       |
  | First-pass CI                                   | 97% (33 of 34; #1–#6 had no CI yet, #13 failed its first run)                                                                            |
  | Rework (commits after the first CI run, per PR) | 0.18                                                                                                                                     |
  | Median time, PR opened to merged                | 0.1 h                                                                                                                                    |
  | Median time, merged to production               | 20.6 h. **Not representative:** 15 deploy runs were deleted before the repository went public (#32), so only 2 deploys remain in the API |
  | Dependabot outcomes                             | no Dependabot PRs closed                                                                                                                 |
  | Agent share of merged PRs                       | 0% (routines start in October)                                                                                                           |
  | Change failure                                  | 0% (0 of 2 deploys)                                                                                                                      |
  | Time to patch                                   | no alerts fixed                                                                                                                          |

- **Coming up:**
  - Node 24 enters maintenance on 2026-10-20, and Node 26 becomes LTS on 2026-10-28. App Service lists `NODE:26` but not yet `NODE:26-lts` ([major-upgrade.md](runbooks/major-upgrade.md)).
  - Next.js 16 maintenance LTS ends 2027-10-21.

### October 2026

- **Numbers** (`node scripts/metrics.ts 2026-10`): 0 PRs merged, Dependabot outcomes closed: 11, no alerts fixed, no change failure data (no deploys). The deploy workflow had no runs in October (`gh run list` could not be used; the REST API listed none). The 2026-09 summary PR (#53) was still open on 2026-11-01.
- **Security alerts:** 28 alerts numbered, 26 opened in October, 24 open. Earliest open alert: 2026-10-16 (`next`, high, patched in 16.3.8). Newest: 2026-10-31 (`next`, critical, patched in 16.4.1). Code scanning: 0 open alerts. Time to fix: none fixed.
- **What broke:** since 2026-10-06 no Dependabot PR has merged. The 6 open ones fail the `verify` check in the step "Audit runtime dependencies" (run 41238005330 for #71; I did not read the audit output). The cause is not established here.
- **Agent fixes:** none this month.
- **Freshness** (`npm outdated`, 2026-11-01): behind latest: `@azure/identity` 4.13.3 → 4.14.0, `@playwright/test` 1.63.0 → 1.64.1, `@testcontainers/postgresql` 12.1.0 → 12.2.1, `kysely` 0.29.6 → 0.29.7, `next` 16.3.6 → 16.4.3, `pg` 8.23.0 → 8.23.1, `react`/`react-dom` 19.3.0 → 19.3.1, `vitest` and `@vitest/coverage-v8` 5.0.2 → 5.0.5, `zod` 4.6.5 → 4.6.7, `jsdom`, `prettier`, `@vitejs/plugin-react` patch releases. Held: `eslint` 9.39.5 (latest 10.13.0), `typescript` 6.0.3 (latest 7.0.2), `@types/node` 24.19.0 (latest 26.6.6).
- **Not checked in this run:** Node.js and PostgreSQL support dates, Bicep API version warnings, the zizmor version and `peer` dependencies for the held tools (no source reachable or reviewed in this session). `docs/lifecycle.md` "Last checked" is not advanced for those rows.
- **Follow-ups for the owner:**
  - Open `next` alerts rated critical (patched in 16.4.1, PR #71) and no merged update since 2026-10-06: the production app is on `next` 16.3.6.
  - Find why "Audit runtime dependencies" fails on all open Dependabot PRs, and whether `security-patch` should run.
  - Merge or close the September summary PR #53.
  - Node 24 entered maintenance on 2026-10-20; Node 26 became LTS on 2026-10-28 ([major-upgrade.md](runbooks/major-upgrade.md)).
