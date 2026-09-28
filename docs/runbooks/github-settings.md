# Runbook: GitHub repository settings

Applies the repository settings from spec 0003 and ADR 0008. These are security configuration and are not in Bicep, so the **owner** runs this runbook. Every step is idempotent; run the whole runbook again after changing it.

Requires: `gh` logged in as the repository owner, Git Bash. The repository must be **public**, because rulesets, environment reviewers, CodeQL and secret scanning are not available on a private repository on the free plan (ADR 0008).

```sh
REPO=stalejohnsen/longrun
```

## 1. Security features

Dependabot alerts and security updates, secret scanning with push protection, and private vulnerability reporting:

```sh
gh api -X PUT "repos/$REPO/vulnerability-alerts"
gh api -X PUT "repos/$REPO/automated-security-fixes"
gh api -X PATCH "repos/$REPO" --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON
gh api -X PUT "repos/$REPO/private-vulnerability-reporting"
```

CodeQL default setup for JavaScript/TypeScript and GitHub Actions:

```sh
gh api -X PATCH "repos/$REPO/code-scanning/default-setup" --input - <<'JSON'
{ "state": "configured", "languages": ["javascript-typescript", "actions"], "query_suite": "default" }
JSON
```

## 2. Pull requests

Allow auto-merge (for Dependabot, spec 0003), and delete branches after merge:

```sh
gh api -X PATCH "repos/$REPO" -F allow_auto_merge=true -F delete_branch_on_merge=true
```

## 3. GitHub Actions

- Actions must be pinned to a full commit SHA.
- Only GitHub-owned actions plus the listed third-party actions may run.
- `GITHUB_TOKEN` is read-only by default and cannot approve pull requests.
- Workflows from all outside contributors need approval.

```sh
gh api -X PUT "repos/$REPO/actions/permissions" --input - <<'JSON'
{ "enabled": true, "allowed_actions": "selected", "sha_pinning_required": true }
JSON
gh api -X PUT "repos/$REPO/actions/permissions/selected-actions" --input - <<'JSON'
{
  "github_owned_allowed": true,
  "verified_allowed": false,
  "patterns_allowed": ["azure/login@*", "dependabot/fetch-metadata@*", "zizmorcore/zizmor-action@*"]
}
JSON
gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" \
  -f approval_policy=all_external_contributors
```

A new third-party action needs an ADR and a new pattern here.

## 4. Ruleset on `main`

Requirements for `main`:

- a pull request, with 0 approvals, because a single owner cannot approve their own PR;
- the CI checks `verify` and `infra` from GitHub Actions (integration 15368);
- the zizmor job, which fails on any finding (spec 0003 M4);
- no new CodeQL alerts of high severity or above.

zizmor gates through a status check, not the code scanning rule. Its SARIF upload is tied to the PR's temporary merge commit, which GitHub regenerates, so a code scanning rule for it can wait for results forever (`docs/learnings.md`).

Force pushes and deletion are blocked. Nobody can bypass the ruleset.

```sh
cat > ruleset.json <<'JSON'
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "verify", "integration_id": 15368 },
          { "context": "infra", "integration_id": 15368 },
          { "context": "zizmor", "integration_id": 15368 }
        ]
      }
    },
    {
      "type": "code_scanning",
      "parameters": {
        "code_scanning_tools": [
          { "tool": "CodeQL", "security_alerts_threshold": "high_or_higher", "alerts_threshold": "errors" }
        ]
      }
    }
  ]
}
JSON
id=$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name == "main") | .id')
if [ -n "$id" ]; then
  gh api -X PUT "repos/$REPO/rulesets/$id" --input ruleset.json >/dev/null
else
  gh api -X POST "repos/$REPO/rulesets" --input ruleset.json >/dev/null
fi
rm ruleset.json
```

## 5. `staging` and `production` environments

Both environments allow deployments only from `main`. `production` requires your approval; it guards the swap, after you have reviewed staging (spec 0002 D4, spec 0003). `staging` has no reviewer: the `staging` job runs infrastructure, migrations and the staging slot for a deploy you started.

```sh
gh api -X PUT "repos/$REPO/environments/staging" --input - <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
gh api -X PUT "repos/$REPO/environments/production" --input - <<JSON
{
  "reviewers": [{ "type": "User", "id": $(gh api user -q .id) }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
for env in staging production; do
  gh api "repos/$REPO/environments/$env/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main \
    || gh api -X POST "repos/$REPO/environments/$env/deployment-branch-policies" -f name=main -f type=branch
done
```

Each environment needs its identifiers as environment secrets. They are set from the bootstrap outputs in [bootstrap.md](bootstrap.md), section 5: seven in `staging`, three (`AZURE_*`) in `production`.

When you start the deploy workflow, the `staging` job runs straight away. The `production` job then waits on the run's page. Open the staging URL shown there, check the new version, then approve to swap, or reject to leave production untouched.

## 5a. Labels

Labels the agent routines and the metrics use (spec 0004): `agent` on every agent PR, `needs-owner` on a Dependabot PR the agent could not fix within the guardrails, and `production-fix` on a PR that fixes something that failed in production (change failure rate).

```sh
gh label create agent --repo "$REPO" --color 6f42c1 --description "Opened by a Claude routine (spec 0004)" --force
gh label create needs-owner --repo "$REPO" --color d93f0b --description "The agent could not fix this within the guardrails" --force
gh label create production-fix --repo "$REPO" --color b60205 --description "Fixes something that failed in production" --force
```

## 6. Verify

```sh
gh api "repos/$REPO" --jq '{visibility, allow_auto_merge, delete_branch_on_merge, security_and_analysis}'
gh api "repos/$REPO/vulnerability-alerts" -i 2>&1 | head -1                 # HTTP/2.0 204
gh api "repos/$REPO/private-vulnerability-reporting" --jq .enabled          # true
gh api "repos/$REPO/code-scanning/default-setup" --jq '{state, languages}'
gh api "repos/$REPO/actions/permissions"
gh api "repos/$REPO/actions/permissions/workflow"
gh api "repos/$REPO/rulesets" --jq '.[] | {name, enforcement}'
for env in staging production; do gh api "repos/$REPO/environments/$env" --jq '{name, protection_rules: [.protection_rules[].type], deployment_branch_policy}'; done   # production: required_reviewers + branch_policy; staging: branch_policy
```

Then check that `main` rejects a direct push (spec 0003 M6):

```sh
git switch main && git pull
git commit --allow-empty -m "ruleset check (must be rejected)"
git push      # expected: rejected by the ruleset
git reset --hard origin/main
```
