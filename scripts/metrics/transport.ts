// Spec 0004: how scripts/metrics.ts reaches the GitHub REST API.
// Locally: the gh CLI, with the owner's login. In Claude cloud sessions (routines), gh is not
// installed, and the session's GitHub proxy authenticates every request to api.github.com
// (checked 2026-09-28, docs/learnings.md), so plain curl works there.
import type { Gh } from './collect.ts'

// Runs a program with arguments and returns stdout; throws when it cannot run or fails.
export type Exec = (command: string, args: string[]) => string

export function hasCommand(exec: Exec, command: string): boolean {
  try {
    exec(command, ['--version'])
    return true
  } catch {
    // Not installed or not runnable: the caller falls back to another transport.
    return false
  }
}

export function githubTransport(exec: Exec): Gh {
  if (hasCommand(exec, 'gh')) return (path) => exec('gh', ['api', path])
  return (path) =>
    exec('curl', [
      '--fail-with-body',
      '--silent',
      '--show-error',
      '--location',
      '--header',
      'Accept: application/vnd.github+json',
      '--header',
      'X-GitHub-Api-Version: 2022-11-28',
      `https://api.github.com/${path}`,
    ])
}
