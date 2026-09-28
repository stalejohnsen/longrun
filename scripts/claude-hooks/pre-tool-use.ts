// Claude Code PreToolUse hook (spec 0004). Runs with Node's built-in TypeScript support:
//   node scripts/claude-hooks/pre-tool-use.ts   (input JSON on stdin, from Claude Code)
// Denies with a reason on stdout; allows silently. Fails closed (exit 2) on unreadable input.
import { execFileSync } from 'node:child_process'
import { evaluate, type ToolCall } from './guards.ts'

function currentBranch(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // Not a git repository, or git is missing: the branch is unknown.
    return null
  }
}

function isToolCall(value: unknown): value is ToolCall & { cwd?: unknown } {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.tool_name === 'string' &&
    typeof candidate.tool_input === 'object' &&
    candidate.tool_input !== null
  )
}

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(chunk as Buffer)

let input: unknown
try {
  input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
} catch {
  input = undefined
}

if (!isToolCall(input)) {
  process.stderr.write('[guard] could not read the tool call; blocking to be safe (spec 0004)\n')
  process.exit(2)
}

const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
const decision = evaluate(input, {
  projectDir: process.env.CLAUDE_PROJECT_DIR ?? cwd,
  branch: currentBranch(cwd),
  remote: process.env.CLAUDE_CODE_REMOTE === 'true',
})

if (decision.deny) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: decision.reason,
      },
    }),
  )
}
