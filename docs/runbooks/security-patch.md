# Runbook: security patch

For a vulnerability in a dependency (a Dependabot alert, a failing `npm audit` step in CI, or a framework advisory such as a Next.js or React security release). Spec 0003: patch windows, merge policy and evidence.

| Severity       | Patch window, from alert opened to fix **in production** |
| -------------- | -------------------------------------------------------- |
| Critical       | 7 days                                                   |
| High           | 30 days                                                  |
| Medium and low | With the next regular update                             |

## 1. Assess (same day)

1. Open the alert: repository → Security → Dependabot alerts. Note the GHSA or CVE ID, severity, and the first patched version.
2. Does it ship to users? Runtime dependencies do; dev-only tools do not (the CI gate audits runtime dependencies only).

   ```sh
   npm ls <package>                 # which of our dependencies pulls it in
   npm ls <package> --omit=dev      # empty output: dev-only
   ```

3. Is the vulnerable code reachable in Longrun? Read the advisory. Record "not reachable" only with a reason; the window still applies.
4. Add a row to `docs/maintenance-log.md` now, with the alert date. The clock has started.

## 2. Get a fix PR

**Dependabot security PR (normal case).** Dependabot opens it straight away; the cooldown does not apply to security updates. It is never grouped and never auto-merged. Check that CI is green, then go to step 3.

**No Dependabot PR** (for example the fix is in a transitive dependency Dependabot cannot move). Claude opens a branch:

```sh
npm install <package>@<patched version>          # direct dependency
npm update <package>                               # transitive, when the parent's range allows the fix
```

If the parent's range does not allow the fix, add an `overrides` entry in `package.json` for that package, with a comment linking the advisory, and a follow-up to remove it when the parent catches up.

**The fix is younger than 3 days** (npm `min-release-age=3` blocks it with `ETARGET … with a date before …`). Override for that one command only; `.npmrc` stays unchanged:

```sh
npm install <package>@<patched version> --min-release-age=0
```

Say in the PR that the release-age rule was overridden, and why. Tested 2026-09-27: without the flag npm refuses a 2-day-old version; with it, the lockfile gets the version.

**No fixed version exists yet.** Keep the alert open. In the log, record the reason and the mitigation (for example a disabled feature, or "not reachable" with evidence). Check again at least weekly. Never dismiss the alert without that record.

**The fix needs a held major** (TypeScript 7, ESLint 10; see `docs/lifecycle.md`). Record the blocker in the log. The owner decides whether to lift the hold (see [major-upgrade.md](major-upgrade.md)) or accept the risk until upstream catches up. Dev-only tools never ship, which lowers the risk.

## 3. Merge and deploy

1. The PR passes all required checks (`verify` includes `npm audit` and `npm audit signatures`). No test, lint rule or threshold is weakened (`CLAUDE.md`).
2. The owner merges.
3. The owner starts `Deploy` on `main`. Review staging, then approve the `production` job.
4. The clock stops when production `/health` reports the new commit.

## 4. Record

Complete the row in `docs/maintenance-log.md`: merged and deployed dates, window met or missed, who changed code (none, agent or owner) and links. A missed window gets a sentence on why.
