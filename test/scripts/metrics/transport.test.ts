import { describe, expect, it } from 'vitest'
import { githubTransport, hasCommand, type Exec } from '../../../scripts/metrics/transport.ts'

// Spec 0004: the metrics reach GitHub through gh locally and through curl in cloud sessions.

function fakeExec(installed: string[], calls: [string, string[]][] = []): Exec {
  return (command, args) => {
    calls.push([command, args])
    if (!installed.includes(command)) throw new Error(`${command}: command not found`)
    return args[0] === '--version' ? `${command} version` : '{"ok":true}'
  }
}

describe('hasCommand', () => {
  it('reports whether a program runs', () => {
    expect(hasCommand(fakeExec(['gh']), 'gh')).toBe(true)
    expect(hasCommand(fakeExec([]), 'gh')).toBe(false)
  })
})

describe('githubTransport', () => {
  it('uses gh api when gh is installed', () => {
    const calls: [string, string[]][] = []
    const gh = githubTransport(fakeExec(['gh', 'curl'], calls))
    expect(gh('repos/o/r/pulls/1')).toBe('{"ok":true}')
    expect(calls.at(-1)).toEqual(['gh', ['api', 'repos/o/r/pulls/1']])
  })

  it('falls back to curl against api.github.com without gh, sending no token', () => {
    const calls: [string, string[]][] = []
    const gh = githubTransport(fakeExec(['curl'], calls))
    expect(gh('repos/o/r/dependabot/alerts?per_page=100')).toBe('{"ok":true}')
    const [command, args] = calls.at(-1)!
    expect(command).toBe('curl')
    expect(args).toContain('--fail-with-body')
    expect(args.at(-1)).toBe('https://api.github.com/repos/o/r/dependabot/alerts?per_page=100')
    expect(args.join(' ')).not.toMatch(/authorization/i)
  })
})
