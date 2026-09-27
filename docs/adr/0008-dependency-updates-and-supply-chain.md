# 0008 – Dependency updates and supply-chain security

Status: Proposed
Date: 2026-09-27

## Context

Longrun exists to learn whether an AI-generated codebase stays maintainable over time (`docs/plan.md`). That depends on updates and security fixes arriving continuously and cheaply, and on the pipeline itself being hard to abuse. Today:

- There is no update automation. `docs/lifecycle.md` is maintained by hand.
- ADR 0001 promised that CI fails on known high or critical vulnerabilities and that a runbook describes a fast framework patch. Neither exists.
- Already in place: `ignore-scripts=true`, committed lockfile, `npm ci`, actions pinned to a commit SHA, minimal workflow `permissions`, `persist-credentials: false`, no `pull_request_target` or `workflow_run`, OIDC instead of stored credentials.

We align with NAV's security golden path ([golden path](https://sikkerhet.nav.no/docs/goldenpath/), [supply chain](https://sikkerhet.nav.no/docs/sikker-utvikling/supply-chain/), [GitHub](https://sikkerhet.nav.no/docs/sikker-utvikling/github/), [Dependabot](https://sikkerhet.nav.no/docs/verktoy/dependabot/)): `ignore-scripts`, `min-release-age=3`, Dependabot with a 3-day `cooldown`, SHA-pinned actions, minimal permissions, zizmor, CodeQL, secret scanning and a ruleset on the default branch. Parts that assume containers or NAV's platform (docker-build-push, SBOM/SLSA for images, distroless, Nais) do not apply; Longrun deploys a zip to App Service.

Facts checked on 2026-09-27:

- **Dependabot** is built into GitHub and free on all repositories. Version updates support `cooldown` (a minimum release age, default 3 days), `groups` (also for security updates via `applies-to`), `ignore` and `open-pull-requests-limit` ([options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)). Security updates ignore `cooldown`. It updates SHA-pinned actions and their version comment. It does not update `.node-version`, the App Service runtime string, Bicep API versions or container image strings in TypeScript.
- **Renovate** (free Mend-hosted GitHub app, also for private repositories) has more control: `minimumReleaseAge`, `packageRules`, `lockFileMaintenance`, a dependency dashboard issue, built-in automerge and managers for `.node-version` and Bicep ([options](https://docs.renovatebot.com/configuration-options/)). It is a third-party app with write access to the repository.
- **npm `min-release-age`** (npm ≥ 11.10) makes npm resolve only versions published more than the given number of days ago. When it blocks the fix in `npm audit fix`, npm keeps the vulnerable version, warns and exits non-zero ([npm config](https://docs.npmjs.com/cli/v11/using-npm/config/)).
- **Auto-merge:** GitHub documents a `pull_request` workflow that checks the author is `dependabot[bot]`, reads `dependabot/fetch-metadata` and runs `gh pr merge --auto`. It depends on required status checks on the target branch ([automating Dependabot](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions)).
- **zizmor** is a static analyser for GitHub Actions workflows (template injection, excessive permissions, unpinned actions, dangerous triggers). The documented integration is `zizmorcore/zizmor-action`, which uploads SARIF to code scanning ([zizmor integrations](https://docs.zizmor.sh/integrations/)).
- **Repository visibility:** on a private repository without paid products, rulesets and branch protection (GitHub Pro), environment reviewers, code scanning (CodeQL), secret scanning, push protection and dependency review are unavailable. All are free on public repositories. The repository contains no credentials, and workflow logs mask all Azure identifiers (ADR 0007, amended).

## Options

**Update tool**

- **(a) Dependabot:** native, no third-party access, the golden path's choice. Coarser grouping; some version sources are not covered.
- **(b) Renovate:** covers more sources and gives a dashboard, but adds a third-party app with write access and a large configuration surface.
- **(c) Renovate for updates, Dependabot for alerts:** most coverage, two tools to learn and keep consistent.
- **(d) Head-to-head trial:** most learning, but it doubles the setup and makes the metrics harder to compare within a short period.

**Workflow analysis**

- **zizmor** (via its action, SARIF to code scanning), **actionlint** (syntax and shell checks, less security focus), or **CodeQL for Actions** only.

## Decision

1. **Make the repository public.** This enables the free security features below and makes the experiment verifiable.
2. **(a) Dependabot** for `npm` and `github-actions`: daily, `cooldown: default-days: 3`, grouped minor and patch updates, majors one by one. Security updates bypass the cooldown. The versions it cannot see (Node runtime, PostgreSQL, Bicep API versions, the Testcontainers image) stay in `docs/lifecycle.md` with a monthly check. Renovate is the documented alternative. A trial can be its own spec later, using the metrics from spec 0003.
3. **npm hardening:** add `min-release-age=3` to `.npmrc`. For an urgent fix that is younger than 3 days, the security-patch runbook overrides it for that one command.
4. **Detection and gates in CI:**
   - `npm audit --omit=dev --audit-level=high` (the ADR 0001 promise);
   - `npm audit signatures`;
   - zizmor via `zizmorcore/zizmor-action`, pinned to a SHA;
   - CodeQL default setup (JavaScript/TypeScript and Actions);
   - secret scanning with push protection;
   - Dependabot alerts.
5. **Ruleset on `main`:** require a pull request, require the CI checks, block force pushes and deletion. No approval count, because a single owner cannot approve their own PR.
6. **`production` environment:** the owner is a required reviewer, and deployments come only from `main`.
7. **Auto-merge** only for Dependabot minor and patch updates of dev dependencies and GitHub Actions, and only when all required checks pass. Runtime dependencies, majors and security updates get owner review. Auto-merged changes still reach production only through the manual deploy.

## Consequences

- New tools: Dependabot (GitHub-native), zizmor (via its action) and CodeQL (GitHub-native). One new action, `dependabot/fetch-metadata`, pinned to a SHA. No new npm dependencies.
- GitHub settings (visibility, security features, ruleset, environment reviewers) are not in Bicep. The owner applies them with a runbook, because they are security configuration.
- Tokens: the auto-merge workflow is the only one that needs `contents: write` and `pull-requests: write`, and only when the author is `dependabot[bot]`.
- Dependabot PRs will be the main source of change. Spec 0003 defines how their outcomes are measured.
- If the repository ever goes private again, the ruleset, CodeQL, secret scanning and environment reviewers stop working. This ADR must then be revisited.
