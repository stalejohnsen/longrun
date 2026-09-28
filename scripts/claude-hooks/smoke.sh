#!/usr/bin/env bash
# Spec 0004: runs the guardrail hook exactly as Claude Code does, on whatever `node` is on PATH.
# CI runs it on Node 22, the default Node in Claude cloud sessions: a hook that crashes there
# would let tool calls through. Needs only bash and node, no npm packages.
set -uo pipefail

hook="$(dirname "$0")/pre-tool-use.ts"
failures=0

run() { # expectation, input JSON, [extra env]
  local expected=$1 input=$2 env_extra=${3:-}
  local output status
  output=$(env $env_extra CLAUDE_PROJECT_DIR="$PWD" node --experimental-strip-types "$hook" <<<"$input" 2>/dev/null)
  status=$?
  case "$expected" in
    deny) [ "$status" -eq 0 ] && [[ "$output" == *'"permissionDecision":"deny"'* ]] ;;
    allow) [ "$status" -eq 0 ] && [ -z "$output" ] ;;
    block) [ "$status" -eq 2 ] ;;
  esac
  if [ $? -eq 0 ]; then
    echo "ok     $expected  $input"
  else
    echo "FAILED $expected  $input  (exit $status, output: $output)"
    failures=$((failures + 1))
  fi
}

echo "node $(node --version)"
run deny '{"tool_name":"Bash","tool_input":{"command":"printenv"}}'
run deny '{"tool_name":"Bash","tool_input":{"command":"git push --force"}}'
run deny '{"tool_name":"mcp__github__merge_pull_request","tool_input":{}}'
run deny '{"tool_name":"Edit","tool_input":{"file_path":"test/lib/config.test.ts"}}' CLAUDE_CODE_REMOTE=true
run allow '{"tool_name":"Bash","tool_input":{"command":"npm test"}}'
run allow '{"tool_name":"mcp__github__get_job_logs","tool_input":{}}'
run block 'not json'

if [ "$failures" -gt 0 ]; then
  echo "::error::The guardrail hook misbehaves on $(node --version) ($failures failures)"
  exit 1
fi
