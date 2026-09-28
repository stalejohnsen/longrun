# 0009 – Agent in the maintenance loop

Status: Accepted
Date: 2026-09-28

## Context

Longrun's purpose is to show whether an AI-generated codebase stays maintainable over time (`docs/plan.md`). Measured against Anthropic's [AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), the project governs the delivery pipeline well (specs, CI, rulesets, supply-chain gates, approval before the swap). It governs the agent itself only through written rules, and every piece of maintenance work starts with the owner asking. The playbook's stage 6 ("the loop closes: a trigger invokes Claude with no person in the invocation path") does not exist yet. Spec 0004 closes that gap. This ADR decides **how Claude runs without the owner starting it**.

Constraints: no secrets in the repository or pipeline (`CLAUDE.md`); least privilege; the owner merges and deploys; the budget is small.

Facts checked on 2026-09-28:

- **`anthropics/claude-code-action`** runs Claude Code in GitHub Actions ([docs](https://code.claude.com/docs/en/github-actions)). Authentication options:
  - an API key or a subscription token (`claude setup-token`, long-lived, tied to one person), both stored as GitHub secrets;
  - keyless OIDC, through Anthropic workload identity federation (a Claude Console service account, API billing) or a cloud provider such as Microsoft Foundry (`azure/login`, then `use_foundry`, Azure billing per token) ([cloud providers](https://code.claude.com/docs/en/github-actions-cloud-providers)).
  - Its commits need a GitHub identity. `GITHUB_TOKEN` commits do not trigger CI. A custom GitHub App needs a private key as a secret. The official Claude GitHub App must be granted its full permission set, including `Workflows: write` and `Repository hooks: write`.
- **Claude routines** ([docs](https://code.claude.com/docs/en/routines)) are in research preview.
  - A routine is a saved prompt, repositories, a cloud environment and triggers. It runs as an autonomous Claude Code cloud session on Anthropic's infrastructure, with no permission prompts, and uses skills committed to the cloned repository.
  - Triggers: a schedule (minimum interval one hour), an API call with a bearer token, or GitHub pull request and release events. GitHub triggers need the Claude GitHub App installed; schedule triggers do not.
  - A routine pushes only to `claude/`-prefixed branches. It cannot push to a branch that carries someone else's commits, such as a Dependabot branch.
  - Everything it does appears as the owner's GitHub user.
  - Routines draw on the owner's subscription, with a daily cap on runs per account. Their configuration lives in the owner's claude.ai account, not in the repository.
- **Claude Code hooks** in the committed `.claude/settings.json` run in every permission mode and can block a tool call deterministically ([hooks](https://code.claude.com/docs/en/hooks)). **Not yet verified:** whether a routine's cloud session applies the project's hooks and permission rules exactly as a local session does. Spec 0004 makes this an acceptance criterion.

## Options

| Option                                              | Billing               | Stored secret | Configuration in the repository           | Main trade-off                                                                                                                           |
| --------------------------------------------------- | --------------------- | ------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Action + Microsoft Foundry, OIDC                | Azure, per token      | None          | Yes                                       | Fits the Azure stack, but adds a Foundry resource, a role assignment and token cost to the $100 budget, plus the broad Claude GitHub App |
| (b) Action + Anthropic workload identity federation | Claude API, per token | None          | Yes                                       | No Azure work, but separate API billing and the broad GitHub App                                                                         |
| (c) Action + API key or subscription token          | API or subscription   | Yes           | Yes                                       | Breaks the no-secrets rule                                                                                                               |
| (d) Claude routines                                 | Owner's subscription  | None          | Partly: triggers and prompts in claude.ai | Cheapest and simplest; research preview; configuration outside the repository; actions appear as the owner                               |

## Decision

**(d) Claude routines**, because this is a learning experiment on a subscription, and it is the only option that uses the subscription without storing a secret.

To keep as much as possible versioned and deterministic:

1. **Logic lives in the repository.** Each routine's prompt is only a skill invocation, such as `/dependabot-triage`. The skill in `.claude/skills/` holds the instructions and is reviewed in PRs like code.
2. **Routine configuration is documented** in `docs/runbooks/routines.md`: name, prompt, repository, environment, trigger, connectors. The monthly review compares it with claude.ai.
3. **Schedule triggers only** at first. The broad Claude GitHub App is not installed. Access for cloning and pushing uses the owner's GitHub connection.
4. **Guardrails are hooks, not prompts.** The committed `.claude/settings.json` blocks edits to tests and guardrail files on `claude/` branches, destructive git commands and reading secrets. Routines run without permission prompts, so hooks are the only enforcement.
5. **Least reach:** the Default cloud environment (Trusted network allowlist), no environment variables, no connectors.
6. **The owner stays the gate.** Agent PRs come from `claude/` branches, never auto-merge (the auto-merge workflow acts only on Dependabot's own PRs), need green required checks, and are merged and deployed by the owner.
7. **Attribution:** commits and PRs look like the owner's. Every agent commit carries the trailer `Agent: <routine name>`, and every agent PR has the `agent` label, so the metrics can tell agent work from owner work.

## Consequences

- No new Azure resources, identities or secrets. No change to the pipeline's identity or role assignments.
- Research preview: behaviour and limits may change. A change is recorded in `docs/learnings.md`, and this ADR is revisited.
- Routine configuration outside the repository is a gap in the audit trail. It is narrowed by thin prompts and the runbook, not closed.
- Dependabot PRs cannot be fixed in place. A fix arrives as a separate `claude/` PR, and Dependabot closes its own PR once `main` has the update.
- Runs count against the owner's subscription and the daily routine cap. Two routines (a daily triage and a monthly review) use about 32 runs a month.
- _(Amended 2026-09-28)_ Cloud sessions also get GitHub MCP tools (`mcp__github__*`), which the first hook matcher did not cover. Among them are merging, enabling auto-merge, starting workflows (including the deploy, whose staging job needs no approval) and writing files through the API. Those tools are now denied by permission rules and by the hook (`guard-github`), so the owner stays the gate. The G4 check verified the hooks in the cloud for file edits and shell commands.
- If routines prove too limited (no CI event triggers, no API access from the session), option (a) or (b) is the documented fallback. That needs a new ADR.
