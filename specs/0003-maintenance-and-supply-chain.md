# Spec 0003 – Maintenance and supply-chain security

Status: Ready
Date: 2026-09-27
Related: [plan](../docs/plan.md) phase 6, ADRs [0001](../docs/adr/0001-web-framework-and-rendering.md), [0006](../docs/adr/0006-lint-and-format.md), [0007](../docs/adr/0007-infrastructure-and-deployment.md), [0008](../docs/adr/0008-dependency-updates-and-supply-chain.md)

## Summary

Longrun's purpose is to show, over time, whether an AI-generated codebase stays maintainable end to end. This spec adds no app features. It makes updates and security fixes flow automatically, hardens the supply chain and the pipeline in line with NAV's security golden path, and records evidence of how maintenance actually goes.

## In scope

- Dependabot version and security updates for npm and GitHub Actions, with a release-age delay.
- Supply-chain and workflow hardening: `min-release-age`, `npm audit`, `npm audit signatures`, zizmor, CodeQL, secret scanning.
- GitHub repository settings: public visibility, a ruleset on `main`, environment reviewers.
- Auto-merge for low-risk updates.
- Patch windows for vulnerabilities.
- Runbooks: security patch, major upgrade, monthly maintenance review.
- A maintenance log with metrics.

## Out of scope

- App features, and changes to the Azure architecture.
- Renovate, or a head-to-head trial (ADR 0008; possibly a later spec).
- SBOM and build provenance for the deployment zip (possible later spec).
- Automatic deployment to production. Deploys stay manual (spec 0002).

## Behaviour

### Update surface

Every versioned thing has a named update path:

| Source                                                           | Where                                                              | Update path                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| npm runtime and dev dependencies                                 | `package.json`, `package-lock.json`                                | Dependabot (`npm`)                                          |
| GitHub Actions                                                   | `.github/workflows/*.yml` (SHA plus version comment)               | Dependabot (`github-actions`)                               |
| Node.js                                                          | `.node-version`, `package.json` `engines`, `NODE\|24-lts` in Bicep | Major-upgrade runbook; monthly review                       |
| PostgreSQL                                                       | Bicep server version, Testcontainers image                         | Major-upgrade runbook; monthly review                       |
| Bicep API versions                                               | `infra/**/*.bicep`                                                 | Linter `use-recent-api-versions` (warning); monthly review  |
| Held versions (TypeScript 6.0, ESLint 9, `@types/node` major 24) | `package.json`                                                     | Dependabot `ignore` for those majors; lifecycle.md says why |

### Dependabot

- `npm` and `github-actions`, daily, `cooldown: default-days: 7` (zizmor's minimum for its `dependabot-cooldown` audit; npm's own `min-release-age` stays at 3 days).
- Groups: dev dependencies (minor and patch), runtime dependencies (minor and patch), GitHub Actions (minor and patch). Majors come one PR each.
- Security updates are not delayed.
- `ignore` covers only the held majors in the table above. Each entry carries a comment pointing to its reason in `docs/lifecycle.md`.

### Merge policy

| Update                          | Merge                                                          |
| ------------------------------- | -------------------------------------------------------------- |
| Dev dependency, minor or patch  | Automatic when all required checks pass                        |
| GitHub Action, minor or patch   | Automatic when all required checks pass                        |
| Runtime dependency, any version | Owner review, then merge and deploy                            |
| Any major                       | Owner review; the agent reads the changelog and fixes breakage |
| Security update                 | Owner review within the patch window, then deploy              |

When an update PR fails CI, the agent investigates on request. It pushes the fix as a separate commit on the same branch, explaining the cause in the PR. It does not weaken a test, lint rule or threshold (`CLAUDE.md`).

### Patch windows

Measured from when the Dependabot alert opens until the fix is **deployed to production**:

- Critical: within 7 days.
- High: within 30 days.
- Medium and low: with the next regular update.

A vulnerability that cannot be fixed in time (no patched version, or blocked by a held dependency) is recorded in the maintenance log with its reason and a mitigation. The alert is not dismissed without that record.

### CI gates (pull requests and `main`)

- `npm audit --omit=dev --audit-level=high` fails on high or critical vulnerabilities in runtime dependencies.
- `npm audit signatures` fails on invalid registry signatures or attestations.
- zizmor analyses `.github/workflows`. Findings appear in code scanning and fail the check.
- CodeQL default setup covers JavaScript/TypeScript and Actions.

### Repository settings (owner-applied, runbook)

- Visibility public.
- Enabled:
  - Dependabot alerts and security updates;
  - secret scanning with push protection;
  - CodeQL default setup;
  - private vulnerability reporting.
- Ruleset on `main`: require a pull request (0 approvals), require the CI checks, block force pushes and deletion.
- "Allow auto-merge" is on.
- The `production` environment has the owner as required reviewer, and deployments only from `main`.
- Workflows from outside contributors need approval.

### Evidence

`docs/maintenance-log.md` has one row per merged update PR and per vulnerability:

- dates: opened, merged, deployed;
- kind (version or security), severity, and the patch window met or missed;
- who changed code: none, agent or owner, with a link.

A monthly review (runbook) fills the rows from `gh pr list`, notes dependency freshness (`npm outdated`), checks `docs/lifecycle.md`, and writes a short summary: what broke, what the agent fixed, and whether its fixes held.

## Acceptance criteria

| ID  | Criterion                                                                                                                                                     | How verified                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| M1  | `.github/dependabot.yml` covers `npm` and `github-actions`, daily, with a 7-day cooldown, the groups above and only the held majors ignored.                  | Review; first Dependabot PRs                                                  |
| M2  | `.npmrc` sets `min-release-age=3` next to `ignore-scripts=true`, and CI's npm version supports it.                                                            | Review; CI log shows the npm version                                          |
| M3  | CI fails when a runtime dependency has a high or critical advisory.                                                                                           | CI step; a test run against a known-vulnerable lockfile in a throwaway branch |
| M4  | CI runs `npm audit signatures` and zizmor. zizmor reports no findings on the current workflows.                                                               | CI; code scanning shows zizmor results                                        |
| M5  | CodeQL default setup, secret scanning and push protection are enabled.                                                                                        | Settings runbook check (`gh api`)                                             |
| M6  | Direct pushes and force pushes to `main` are rejected, and a PR with a failing required check cannot merge.                                                   | Settings runbook check; a failing PR is not mergeable                         |
| M7  | A Dependabot dev-dependency or Actions minor/patch PR merges itself after green checks. A runtime or major PR does not.                                       | First real Dependabot PRs                                                     |
| M8  | The auto-merge workflow runs on `pull_request`, acts only when the author is `dependabot[bot]`, and has write permissions only in that job. zizmor passes it. | Review; zizmor                                                                |
| M9  | A deploy needs owner approval in the `production` environment and runs only from `main`.                                                                      | Next deploy                                                                   |
| M10 | Runbooks exist: security patch (including the `min-release-age` override), major upgrade (Node, Next.js, PostgreSQL), monthly review.                         | Review                                                                        |
| M11 | `docs/maintenance-log.md` exists with the columns above, and the first monthly review has been done.                                                          | Review                                                                        |

## Error cases

- **A security fix is younger than 3 days:** the runbook's one-command override applies. The PR says so.
- **The fix requires a held major** (for example TypeScript 7 or ESLint 10): record the blocker and mitigation in the log; the owner decides.
- **An auto-merged update breaks something only visible in production:** roll back with the swap runbook (spec 0002 D11), revert the PR, and add a test that would have caught it.
- **Dependabot cannot update the lockfile** (resolution conflict): the agent resolves it on the branch, or the owner closes the PR with a reason in the log.

## Delivery (PRs)

1. ADR 0008 and this spec (docs only).
2. The settings runbook; the owner applies it after switching to public.
3. `.npmrc`, `dependabot.yml`, the auto-merge workflow.
4. CI gates: `npm audit`, `npm audit signatures`, zizmor.
5. Runbooks, maintenance log, first monthly review.
