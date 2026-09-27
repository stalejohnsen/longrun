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
- no new CodeQL alerts of high severity or above, and no zizmor findings of medium severity or above (spec 0003 M4).

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
          { "context": "infra", "integration_id": 15368 }
        ]
      }
    },
    {
      "type": "code_scanning",
      "parameters": {
        "code_scanning_tools": [
          { "tool": "CodeQL", "security_alerts_threshold": "high_or_higher", "alerts_threshold": "errors" },
          { "tool": "zizmor", "security_alerts_threshold": "medium_or_higher", "alerts_threshold": "errors_and_warnings" }
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

## 5. `production` environment

Require your approval for every deployment, and allow deployments only from `main` (spec 0002 D4, spec 0003):

```sh
gh api -X PUT "repos/$REPO/environments/production" --input - <<JSON
{
  "reviewers": [{ "type": "User", "id": $(gh api user -q .id) }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
gh api "repos/$REPO/environments/production/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main \
  || gh api -X POST "repos/$REPO/environments/production/deployment-branch-policies" -f name=main -f type=branch
```

When you start the deploy workflow, the `deploy` job then waits until you approve it in the run's page.

## 6. Verify

```sh
gh api "repos/$REPO" --jq '{visibility, allow_auto_merge, delete_branch_on_merge, security_and_analysis}'
gh api "repos/$REPO/vulnerability-alerts" -i 2>&1 | head -1                 # HTTP/2.0 204
gh api "repos/$REPO/private-vulnerability-reporting" --jq .enabled          # true
gh api "repos/$REPO/code-scanning/default-setup" --jq '{state, languages}'
gh api "repos/$REPO/actions/permissions"
gh api "repos/$REPO/actions/permissions/workflow"
gh api "repos/$REPO/rulesets" --jq '.[] | {name, enforcement}'
gh api "repos/$REPO/environments/production" --jq '{protection_rules: [.protection_rules[].type], deployment_branch_policy}'
```

Then check that `main` rejects a direct push (spec 0003 M6):

```sh
git switch main && git pull
git commit --allow-empty -m "ruleset check (must be rejected)"
git push      # expected: rejected by the ruleset
git reset --hard origin/main
```
