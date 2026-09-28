# Runbook: monthly maintenance review

Once a month, Claude does the review and the owner reads the summary (spec 0003). It takes about 30 minutes and produces one PR that updates the log and `docs/lifecycle.md`.

## 1. Collect

```sh
SINCE=2026-09-01   # first day of the month under review
REPO=stalejohnsen/longrun

# Update PRs merged or closed this month
gh pr list -R $REPO --author app/dependabot --state all --search "updated:>=$SINCE" \
  --json number,title,state,createdAt,mergedAt,url
# Security alerts, open and fixed
gh api "repos/$REPO/dependabot/alerts?per_page=100" \
  --jq '.[] | {n: .number, state, severity: .security_advisory.severity, pkg: .dependency.package.name, created_at, fixed_at}'
# Code scanning (CodeQL, zizmor) open alerts
gh api "repos/$REPO/code-scanning/alerts?state=open&per_page=100" --jq '.[] | {tool: .tool.name, rule: .rule.id, severity: .rule.security_severity_level}'
# Deploys this month
gh run list -R $REPO --workflow deploy.yml --created ">=$SINCE" --json createdAt,conclusion,headSha

# Freshness
npm outdated

# Metrics table for the summary (spec 0004)
node scripts/metrics.ts 2026-09
```

## 2. Check what Dependabot cannot see

| Item                                                | How                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Node.js                                             | [nodejs/Release](https://github.com/nodejs/Release/blob/main/schedule.json); `az webapp list-runtimes --os-type linux` |
| PostgreSQL (server and Testcontainers image)        | [PostgreSQL versioning](https://www.postgresql.org/support/versioning/); Azure supported versions                      |
| Bicep API versions                                  | Warnings from `bicep lint` (`use-recent-api-versions`) in the CI `infra` log                                           |
| zizmor version (`version` input in `zizmor.yml`)    | [zizmor releases](https://github.com/zizmorcore/zizmor/releases)                                                       |
| Held versions (TypeScript 7, ESLint 10)             | `typescript-eslint` and `eslint-config-next` peer dependencies (ADR 0006)                                              |
| Support dates for everything in `docs/lifecycle.md` | The source linked in each row                                                                                          |

Anything due within 6 months gets a line in the summary. Anything due within 3 months also gets a follow-up issue or PR ([major-upgrade.md](major-upgrade.md)).

## 3. Write it down

1. Add a row to `docs/maintenance-log.md` for every update PR and alert from step 1 that has no row yet.
2. Add the month's summary at the end of the log:
   - numbers: update PRs merged (auto or owner), security alerts, time to fix per alert, deploys;
   - what broke, what the agent fixed, and whether earlier fixes held;
   - freshness: packages behind, and why;
   - what is coming up.
3. Update "Last checked" in `docs/lifecycle.md`, and any dates that changed.
4. Open one PR with these changes. The owner reads the summary and merges.
