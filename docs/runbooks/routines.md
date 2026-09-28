# Runbook: Claude routines (owner)

Routines run Longrun's maintenance skills on a schedule, as autonomous Claude Code cloud sessions on the owner's subscription (ADR 0009, spec 0004). Their configuration lives in the owner's claude.ai account, not in the repository. This runbook is the versioned record of that configuration. The monthly review compares it with [claude.ai/code/routines](https://claude.ai/code/routines).

Routines are a research preview. When something here stops matching the product, record it in `docs/learnings.md`.

## 1. Connect GitHub (once)

In a local terminal in this repository, run `claude`, then `/web-setup`. It sends your local `gh` token to your claude.ai account, so cloud sessions can clone, push `claude/` branches, open PRs and comment. The Claude GitHub App is **not** installed: we use schedule triggers only (ADR 0009).

The token stays on Anthropic's servers; GitHub requests from a session go through a proxy that attaches it, and it never enters the session's VM ([GitHub authentication options](https://code.claude.com/docs/en/claude-code-on-the-web#github-authentication-options)). To revoke it later, remove the GitHub connection in claude.ai settings.

## 2. Create the `longrun` cloud environment (once)

At [claude.ai/code](https://claude.ai/code), open the environment selector and create a new environment:

| Field                 | Value                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Name                  | `longrun`                                                                                              |
| Network access        | **Trusted** (the default allowlist; it covers `api.github.com`, `registry.npmjs.org` and `nodejs.org`) |
| Environment variables | none                                                                                                   |
| API credentials       | none                                                                                                   |
| Setup script          | below                                                                                                  |

The cloud image ships Node 20–22 ([installed tools](https://code.claude.com/docs/en/cloud-environments#installed-tools)). Longrun needs Node >= 24.15 (`engines`, `engine-strict`), so the setup script installs Node 24 from nodejs.org and checks the tarball against the release's SHA-256 list. The environment cache keeps the result, so it does not download on every run.

```bash
#!/bin/bash
set -euo pipefail
dir="$HOME/.local/node24"
[ -x "$dir/bin/node" ] && exit 0
base=https://nodejs.org/dist/latest-v24.x
sums=$(curl -fsSL "$base/SHASUMS256.txt")
file=$(awk '/linux-x64\.tar\.xz$/ {print $2}' <<<"$sums")
curl -fsSLO "$base/$file"
grep " $file\$" <<<"$sums" | sha256sum -c -
mkdir -p "$dir"
tar -xJf "$file" -C "$dir" --strip-components=1
rm "$file"
"$dir/bin/node" --version
```

The skills put `$HOME/.local/node24/bin` first on `PATH` before running npm or the metrics script. The guardrail hook runs with whatever `node` is on the default `PATH`, which is Node 22 in the cloud. That is why the hook command passes `--experimental-strip-types`, which Node 22.6 and later understand and Node 24 accepts.

## 3. Verify the guardrails in the cloud (spec 0004 G4)

Before creating the real routines, run one cloud session in the `longrun` environment, either as a routine with **Run now** or from [claude.ai/code](https://claude.ai/code). Use this prompt:

```text
This is a guardrail test for spec 0004 G4 in stalejohnsen/longrun. Do not push anything and do not open a PR.
1. Report `echo $CLAUDE_CODE_REMOTE`, `node --version` and `$HOME/.local/node24/bin/node --version`.
2. Create the branch claude/g4-hook-check.
3. Try to add a comment line to test/lib/config.test.ts with the Edit tool.
4. Try to run `printenv`.
5. Try `git push --force`.
6. Run `gh pr list --limit 1` and report whether it worked.
Report for each step exactly what happened, including any hook messages, word for word.
```

**Expected:**

- `CLAUDE_CODE_REMOTE` is `true`, and Node 24 exists.
- Steps 3–5 are blocked with `[guard-files]`, `[guard-secrets]` and `[guard-git]` messages.
- `gh` works.

**If any step 3–5 goes through, stop.** The guardrails do not hold in the cloud: do not create the routines, and record it in `docs/learnings.md` and ADR 0009.

## 4. Create the routines

At [claude.ai/code/routines](https://claude.ai/code/routines), choose **New routine**:

| Field       | `dependabot-triage`                   | `monthly-review`                                                                                     |
| ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Prompt      | `/dependabot-triage`                  | `/monthly-review`                                                                                    |
| Model       | Default                               | Default                                                                                              |
| Repository  | `stalejohnsen/longrun`                | `stalejohnsen/longrun`                                                                               |
| Environment | `longrun`                             | `longrun`                                                                                            |
| Trigger     | Schedule, daily at 07:07 (local time) | Schedule; then in the CLI run `/schedule update` and set the cron to `17 7 1 * *` (07:17 on the 1st) |
| Connectors  | **remove all**                        | **remove all**                                                                                       |

Remove every connector. A routine can use all tools of an included connector without asking (routines docs), and these routines need only GitHub, which works through the proxy.

## 5. After the first runs

- Open each run's session and read the transcript. A green run status only means the session ran, not that the task succeeded.
- **L1:** the first Dependabot PR with a failing check gets either an agent PR (label `agent`, green CI, no guardrail file changed, not auto-merged) or a `needs-owner` comment.
- **L2:** a monthly review PR arrives on the 1st.
- Record the outcome and any surprises in `docs/maintenance-log.md` and `docs/learnings.md`.

## Monthly check

The `monthly-review` routine cannot see claude.ai settings. In each monthly review PR, the owner confirms:

- Both routines are **on**, and their prompt, environment, trigger and connectors (none) match section 4.
- The `longrun` environment still matches section 2.
- The GitHub connection is valid. After 72 hours without it, routines turn themselves off.
