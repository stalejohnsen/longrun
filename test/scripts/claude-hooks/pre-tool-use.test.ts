import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Spec 0004: the hook entry point as Claude Code runs it (plain Node, JSON on stdin).

const script = join(process.cwd(), 'scripts', 'claude-hooks', 'pre-tool-use.ts')
// Not a git repository, so the branch is unknown and only the remote flag makes it an agent session.
const cwd = mkdtempSync(join(tmpdir(), 'hook-'))

function run(input: string, env: Record<string, string> = {}) {
  const base = { ...process.env }
  delete base.CLAUDE_CODE_REMOTE
  return spawnSync(process.execPath, [script], {
    input,
    encoding: 'utf8',
    env: { ...base, CLAUDE_PROJECT_DIR: cwd, ...env },
  })
}

function call(toolName: string, toolInput: Record<string, unknown>) {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    cwd,
    tool_name: toolName,
    tool_input: toolInput,
  })
}

describe('pre-tool-use hook', () => {
  it('denies with a PreToolUse decision and a reason', () => {
    const result = run(call('Bash', { command: 'git push --force' }))
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: expect.stringContaining('[guard-git] force push is not allowed'),
      },
    })
  })

  it('allows silently', () => {
    const result = run(call('Bash', { command: 'npm test' }))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  it('treats CLAUDE_CODE_REMOTE=true as an agent session', () => {
    const edit = call('Edit', { file_path: join(cwd, 'test', 'a.test.ts') })
    expect(run(edit).stdout).toBe('')
    expect(
      JSON.parse(run(edit, { CLAUDE_CODE_REMOTE: 'true' }).stdout).hookSpecificOutput,
    ).toMatchObject({
      permissionDecision: 'deny',
    })
  })

  it('fails closed on unreadable input', () => {
    const result = run('not json')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('blocking to be safe')
    expect(run(JSON.stringify({ tool_name: 'Bash' })).status).toBe(2)
  })
})
