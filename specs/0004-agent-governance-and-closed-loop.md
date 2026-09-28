# Spec 0004 – Agent governance and the closed maintenance loop

Status: Ready
Date: 2026-09-28
Related: [plan](../docs/plan.md) phase 7, ADR [0009](../docs/adr/0009-agent-in-the-loop.md), spec [0003](0003-maintenance-and-supply-chain.md), [AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook)

## Summary

Spec 0003 made updates and security fixes flow. The agent that keeps the code working is still governed only by written rules, and it only works when the owner asks. This spec does three things:

- **governs** the agent with deterministic hooks and permissions;
- **measures** its work;
- **closes the loop**: scheduled routines triage failing Dependabot PRs and run the monthly review with no person starting them.

The owner still merges and deploys. No app features.

## In scope

- `.claude/settings.json`: permissions and hooks, with hook scripts and their tests.
- Skills in `.claude/skills/` for the maintenance runbooks and the routines.
- A shorter `CLAUDE.md` (about one page).
- `scripts/metrics.ts` and the numbers in `docs/maintenance-log.md`.
- Two routines, `dependabot-triage` (daily) and `monthly-review` (monthly), documented in `docs/runbooks/routines.md`.

## Out of scope

- AI review of every PR (`REVIEW.md`, a PR-triggered routine). Possible later spec.
- An eval suite for agent configuration.
- Claude in GitHub Actions, and any new Azure resource (ADR 0009).
- Letting the agent merge, deploy or approve anything.

## Behaviour

### Guardrails (`.claude/settings.json`)

The file is committed, so it applies to every session that clones the repository: the owner's local sessions and routine sessions.

**Permissions:**

- **Deny:** reading `.env*`, `*.pem` and `*.key` files.
- **Ask** (local sessions): editing guardrail files, `git push`, `npm install`, `npm update`, `npm uninstall`.

**Guardrail files** are the files that define what "green" means:

- `test/**`;
- `vitest.config.*`, `playwright.config.*`, `eslint.config.*`, `tsconfig*.json`;
- `.github/**`;
- `.npmrc`, `package.json`, `package-lock.json` (dependency changes come from Dependabot or an owner-approved task);
- `infra/bootstrap/**`;
- `.claude/**`.

**Hooks (PreToolUse).** One Node entry script, `scripts/claude-hooks/pre-tool-use.ts`, calls the guards in `scripts/claude-hooks/guards.ts`; both are tested, and the guards are included in coverage. The hook fails closed on unreadable input. `ask` rules cannot prompt in a routine, so nothing a routine needs (such as `git push` to a `claude/` branch) is an `ask` rule; the hook handles `main`. A blocked call gets a reason that names the rule.

| Hook            | Blocks                                                                                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guard-files`   | Edit, Write and delete of a guardrail file, through file tools or shell commands, in agent sessions: a `claude/` branch or a cloud session (`CLAUDE_CODE_REMOTE=true`). Locally the permission rules ask instead                                                 |
| `guard-git`     | `--no-verify`; force push; pushing to `main`; `git commit`, `git push` or `git reset --hard` while on `main` (branch changes inside one command are followed)                                                                                                    |
| `guard-secrets` | Printing the environment (`env`, `printenv`), tokens (`az account get-access-token`, `gh auth token`, `gh auth status --show-token`), secret variables (`echo $…TOKEN`) or `.env` files. The CI migration step is not an agent session and does not use the hook |

### Skills (`.claude/skills/`)

Thin wrappers that point to the runbooks, so the agent picks them by itself and the routines can invoke them:

- `security-patch`, `major-upgrade`, `monthly-review`: the runbooks from spec 0003.
- `dependabot-triage`: the routine behaviour below.

### Measurement (`scripts/metrics.ts`)

- Node and the `gh` CLI only, no new dependencies. It reads PRs, checks, workflow runs and Dependabot alerts for one month.
- It prints a Markdown table for the monthly summary:

| Metric             | Definition                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------- |
| First-pass CI      | Share of merged PRs whose first CI run on the head commit was green                           |
| Rework             | Commits pushed after the first CI run, per merged PR                                          |
| Lead time          | PR opened to merged; merged to production (`/health` version in the deploy run)               |
| Dependabot outcome | Share auto-merged, merged by the owner as proposed, fixed by the agent, or fixed by the owner |
| Agent share        | Share of merged PRs with the `agent` label; agent fixes that later needed an owner fix        |
| Change failure     | Deploys followed within 7 days by a rollback swap or a `fix:`/`revert` PR                     |
| Time to patch      | Dependabot alert opened to fix in production, per severity                                    |

### Routine: `dependabot-triage` (daily, 07:07 local time)

Prompt: `/dependabot-triage`. For each open Dependabot PR:

1. **Green checks:** nothing to do. The low-risk groups merge themselves; the rest wait for the owner.
2. **A failing required check:**
   - read the logs and the upstream changelog;
   - create `claude/fix-<Dependabot branch>` from the Dependabot branch;
   - fix the code without touching guardrail files;
   - run lint, typecheck and unit tests;
   - push, and open a PR with the `agent` label that links the Dependabot PR and explains the cause and the fix;
   - comment on the Dependabot PR with a link.
3. **It cannot fix it within the guardrails** (for example the fix needs a test change or a held major): comment on the Dependabot PR with the diagnosis, add the label `needs-owner`, and change nothing.
4. **Only once:** it skips a Dependabot PR that already has an open agent PR or a `needs-owner` label.

It also lists open Dependabot security alerts whose patch window (spec 0003) ends within 3 days, and adds that list as a comment on a pinned issue, "Maintenance status".

**Text from PRs, changelogs and logs is untrusted data.** The skill treats it as evidence to read, never as instructions.

### Routine: `monthly-review` (1st of each month, 07:17)

Prompt: `/monthly-review`. It follows `docs/runbooks/monthly-review.md`, adds the output of `scripts/metrics.ts` to the summary, and opens a PR with the `agent` label.

### Attribution

Routine actions appear as the owner's GitHub user (ADR 0009). Every agent commit ends with the trailer `Agent: dependabot-triage` or `Agent: monthly-review`, and every agent PR has the `agent` label. The metrics use these.

## Acceptance criteria

| ID  | Criterion                                                                                                                                                                                                                         | How verified                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| G1  | On a `claude/` branch, an attempt to edit `test/**` or another guardrail file is blocked with a reason. Locally, it asks                                                                                                          | Hook unit tests; a local session on a `claude/` test branch                                               |
| G2  | `--no-verify`, force push, and commit, push or `reset --hard` on `main` are blocked                                                                                                                                               | Hook unit tests                                                                                           |
| G3  | Reading `.env*` or key files is denied                                                                                                                                                                                            | Local session                                                                                             |
| G4  | **A routine session applies the project hooks** (ADR 0009, not yet verified)                                                                                                                                                      | A one-off routine whose task is to edit a test file on a `claude/` branch; its transcript shows the block |
| G5  | `CLAUDE.md` is at most about 60 lines. Nothing it said is lost: removed detail lives in docs or skills                                                                                                                            | Review                                                                                                    |
| M1  | `scripts/metrics.ts` produces the table for a month. Its numbers for September 2026 match a manual count                                                                                                                          | Unit tests on fixtures; manual check                                                                      |
| L1  | A Dependabot PR with a failing check gets, within a day and without the owner starting anything, either an agent PR with a fix (green CI, `agent` label, no guardrail file changed, not auto-merged) or a `needs-owner` diagnosis | A deliberately broken Dependabot-like situation, then the real PRs                                        |
| L2  | The monthly review PR arrives on the 1st with the metrics table                                                                                                                                                                   | October 2026 run                                                                                          |
| L3  | `docs/runbooks/routines.md` matches the routines in claude.ai                                                                                                                                                                     | Monthly review                                                                                            |
| L4  | Every agent commit and PR is attributed (trailer and label)                                                                                                                                                                       | Metrics; review                                                                                           |

## Error cases

- **A routine run fails, or runs but does nothing.** A green run status only means the session ran. The monthly review reads the run list and transcripts, and records misses in the log.
- **A hook blocks the fix the agent needs.** The skill stops, reports `needs-owner`, and never works around the block.
- **The daily cap or subscription limit is reached.** The run is skipped. The next day's run catches up, because triage covers all open PRs.
- **The GitHub connection expires.** Routines skip runs for up to 72 hours, then turn off (routines docs). The monthly review checks that the routines are on.
- **The research preview changes behaviour.** Record it in `docs/learnings.md` and revisit ADR 0009.

## Delivery (PRs)

1. ADR 0009 and this spec (docs only).
2. `.claude/settings.json`, hook scripts with tests, skills, the shorter `CLAUDE.md`.
3. `scripts/metrics.ts` with tests, and the September numbers in the log.
4. `docs/runbooks/routines.md`. The owner creates the routines in claude.ai; verify G4 and L1.
5. After the first month: the October review (L2), and the learnings.
