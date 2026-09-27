# Maintenance log

Evidence for Longrun's main question: does an AI-generated codebase stay maintainable end to end over time? (spec 0003). Append only. Rows are added when an update or alert is handled, and at the latest in the monthly review ([runbook](runbooks/monthly-review.md)).

**Kind:** `version` (Dependabot version update), `security` (vulnerability alert or advisory), `major` (major upgrade), `hardening` (a finding from security tooling). **Code changes by:** `none` (merged as proposed), `agent` (Claude changed code or config), `owner`.

## Updates and vulnerabilities

| Opened | Merged | Deployed | Kind | What | Severity | Window | Code changes by | Link |
| ------ | ------ | -------- | ---- | ---- | -------- | ------ | --------------- | ---- |

_None yet. Dependabot was enabled on 2026-09-27 (#35); its first runs found nothing to propose apart from the held versions below._

## Findings from security tooling

| Found      | Fixed      | Tool          | Finding                                                                                                                           | Severity              | Code changes by | Link |
| ---------- | ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------- | ---- |
| 2026-09-27 | 2026-09-27 | Manual review | Deploy logs printed the database administrator's sign-in name, tenant and subscription IDs (environment variables are not masked) | Personal data in logs | agent           | #32  |
| 2026-09-27 | 2026-09-27 | zizmor 1.30.1 | Dependabot cooldown shorter than 7 days (2 findings)                                                                              | Medium                | agent           | #36  |
| 2026-09-27 | 2026-09-27 | zizmor 1.30.1 | Step outputs expanded with `${{ }}` inside `run:` in `deploy.yml` (4 findings)                                                    | Informational         | agent           | #36  |

## Monthly summaries

### September 2026 (baseline)

Spec 0003 delivered: #33 (ADR 0008, spec), #34 (GitHub settings), #35 (Dependabot, auto-merge, `min-release-age`), #36 (CI gates, zizmor), #37 (approval before the swap, runtime through the slot).

- **Numbers:** 0 update PRs, 0 security alerts, 0 open code scanning alerts. 2 deploys after the maintenance work started (#32 and #37).
- **Supply chain at baseline:** `npm audit` 0 vulnerabilities (runtime and dev). `npm audit signatures`: 641 packages with verified registry signatures, 128 with attestations.
- **Freshness:** everything is current except the two held tools:
  - ESLint 9.39.5, latest 10.11.0. ESLint 9 is past end of life (2026-08-06), held because the `eslint-config-next` plugins support only ESLint 9. Dev-only.
  - TypeScript 6.0.3, latest 7.0.2. Held because `typescript-eslint` supports `<6.1.0`.
- **What broke / what the agent fixed:** nothing broke. The agent fixed 7 findings (table above), all before merge.
- **Coming up:**
  - Node 24 enters maintenance on 2026-10-20, and Node 26 becomes LTS on 2026-10-28. App Service lists `NODE:26` but not yet `NODE:26-lts` ([major-upgrade.md](runbooks/major-upgrade.md)).
  - Next.js 16 maintenance LTS ends 2027-10-21.
