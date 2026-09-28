import { describe, expect, it } from 'vitest'
import {
  evaluate,
  guardFileTool,
  guardFilesInShell,
  guardGit,
  guardrailLabel,
  guardSecrets,
  subcommands,
  toRepoPath,
  type Context,
} from '../../../scripts/claude-hooks/guards.ts'

// Spec 0004 G1–G3: guardrails for agent sessions.

const root = '/work/longrun'
const local: Context = { projectDir: root, branch: 'feat/something', remote: false }
const routineBranch: Context = { projectDir: root, branch: 'claude/fix-deps', remote: false }
const cloud: Context = { projectDir: root, branch: 'feat/x', remote: true }
const onMain: Context = { projectDir: root, branch: 'main', remote: false }

describe('toRepoPath', () => {
  it('turns absolute paths inside the project into repository paths', () => {
    expect(toRepoPath('/work/longrun/test/a.test.ts', root)).toBe('test/a.test.ts')
  })

  it('accepts relative paths', () => {
    expect(toRepoPath('./test/a.test.ts', root)).toBe('test/a.test.ts')
    expect(toRepoPath('src/x.ts', root)).toBe('src/x.ts')
  })

  it('handles Windows paths and drive-letter case', () => {
    expect(toRepoPath('c:\\git\\longrun\\test\\a.ts', 'C:\\git\\longrun')).toBe('test/a.ts')
    expect(toRepoPath('C:/git/longrun/.github/x.yml', 'c:\\git\\longrun\\')).toBe('.github/x.yml')
  })

  it('returns null outside the project, including sibling folders with a shared prefix', () => {
    expect(toRepoPath('/etc/passwd', root)).toBeNull()
    expect(toRepoPath('/work/longrun-other/test/a.ts', root)).toBeNull()
  })
})

describe('guardrailLabel', () => {
  it.each([
    ['test/lib/config.test.ts', 'tests'],
    ['vitest.config.ts', 'test, lint or type configuration'],
    ['playwright.config.ts', 'test, lint or type configuration'],
    ['eslint.config.mjs', 'test, lint or type configuration'],
    ['tsconfig.json', 'test, lint or type configuration'],
    ['.github/workflows/ci.yml', 'CI and repository configuration'],
    ['.npmrc', 'dependency and npm configuration'],
    ['package.json', 'dependency and npm configuration'],
    ['package-lock.json', 'dependency and npm configuration'],
    ['infra/bootstrap/main.bicep', 'identity bootstrap'],
    ['.claude/settings.json', 'agent configuration'],
  ])('%s is a guardrail file (%s)', (path, label) => {
    expect(guardrailLabel(path)).toBe(label)
  })

  it.each([
    'src/lib/config.ts',
    'infra/main/main.bicep',
    'docs/maintenance-log.md',
    'test-results/x',
  ])('%s is not a guardrail file', (path) => {
    expect(guardrailLabel(path)).toBeNull()
  })
})

describe('guard-files: file tools (G1)', () => {
  it('blocks editing a test on a claude/ branch, with a reason', () => {
    const decision = guardFileTool('/work/longrun/test/a.test.ts', routineBranch)
    expect(decision).toMatchObject({ deny: true, rule: 'guard-files' })
    expect(decision.deny && decision.reason).toContain('test/a.test.ts is tests, a guardrail file')
  })

  it('blocks guardrail files in a cloud session on any branch', () => {
    expect(guardFileTool('.github/workflows/ci.yml', cloud).deny).toBe(true)
  })

  it('allows guardrail files in a local session (permission rules ask instead)', () => {
    expect(guardFileTool('test/a.test.ts', local).deny).toBe(false)
  })

  it('allows application code in agent sessions', () => {
    expect(guardFileTool('src/lib/config.ts', routineBranch).deny).toBe(false)
  })

  it('allows paths outside the project', () => {
    expect(guardFileTool('/tmp/notes.md', routineBranch).deny).toBe(false)
  })
})

describe('guard-files: shell commands (G1)', () => {
  it.each([
    'rm test/a.test.ts',
    'git checkout -- test/a.test.ts',
    'sed -i s/a/b/ vitest.config.ts',
    'echo x > .npmrc',
    'npm test && cat x | tee .github/workflows/ci.yml',
    "node -e \"require('fs').writeFileSync('package.json', '{}')\"",
  ])('blocks %s on a claude/ branch', (command) => {
    expect(guardFilesInShell(command, routineBranch)).toMatchObject({
      deny: true,
      rule: 'guard-files',
    })
  })

  it.each([
    'cat test/a.test.ts',
    'npm test > test-results.log',
    'git checkout -b claude/fix-x',
    'npm run lint 2>/dev/null',
  ])('allows %s', (command) => {
    expect(guardFilesInShell(command, routineBranch).deny).toBe(false)
  })

  it('allows writes to guardrail files in local sessions', () => {
    expect(guardFilesInShell('rm test/a.test.ts', local).deny).toBe(false)
  })
})

describe('guard-git (G2)', () => {
  it.each([
    ['git commit --no-verify -m x', 'no-verify'],
    ['git push --force', 'force push'],
    ['git push -f origin feat/x', 'force push'],
    ['git push --force-with-lease', 'force push'],
    ['git push origin +feat/x', 'force push'],
    ['git push origin main', 'pushing to main'],
    ['git push origin HEAD:main', 'pushing to main'],
    ['git push origin HEAD:refs/heads/main', 'pushing to main'],
  ])('blocks %s on any branch', (command, reason) => {
    const decision = guardGit(command, local)
    expect(decision.deny).toBe(true)
    expect(decision.deny && decision.reason).toContain(reason)
  })

  it.each([
    'git commit -m x',
    'git push',
    'git push -u origin HEAD',
    'git reset --hard origin/main',
  ])('blocks %s while on main', (command) => {
    expect(guardGit(command, onMain)).toMatchObject({ deny: true, rule: 'guard-git' })
  })

  it('follows branch changes inside one command', () => {
    expect(guardGit('git switch -c feat/x && git commit -m y', onMain).deny).toBe(false)
    expect(guardGit('git checkout -b feat/x && git commit -m y', onMain).deny).toBe(false)
    expect(guardGit('git switch main && git commit -m y', local).deny).toBe(true)
  })

  it.each([
    'git commit -m x',
    'git push -u origin feat/something',
    'git push origin feat/main-menu',
    'git switch main && git pull',
    'git status',
    'npm test',
  ])('allows %s off main', (command) => {
    expect(guardGit(command, local).deny).toBe(false)
  })

  it('treats an unknown branch as not main', () => {
    expect(guardGit('git commit -m x', { ...local, branch: null }).deny).toBe(false)
  })
})

describe('guard-secrets (G3)', () => {
  it.each([
    'env',
    'printenv',
    'printenv GITHUB_TOKEN',
    'az account get-access-token --resource-type oss-rdbms',
    'gh auth token',
    'gh auth status --show-token',
    'echo $GITHUB_TOKEN',
    'printf "%s" "${API_KEY}"',
    'cat .env',
    'cat ./config/.env.local',
    'FOO=1 env',
  ])('blocks %s', (command) => {
    expect(guardSecrets(command)).toMatchObject({ deny: true, rule: 'guard-secrets' })
  })

  it.each([
    'env NODE_ENV=test npm test',
    'echo $HOME',
    'cat package.json',
    'cat .env.example.md',
    'gh auth status',
    'az account show',
  ])('allows %s', (command) => {
    expect(guardSecrets(command).deny).toBe(false)
  })
})

describe('subcommands', () => {
  it('splits on shell separators and strips leading variable assignments', () => {
    expect(subcommands('A=1 B=2 npm test && git status; ls | wc -l || true\necho done')).toEqual([
      'npm test',
      'git status',
      'ls',
      'wc -l',
      'true',
      'echo done',
    ])
  })
})

describe('evaluate', () => {
  it('routes file tools to guard-files', () => {
    for (const tool of ['Edit', 'Write', 'MultiEdit']) {
      expect(
        evaluate({ tool_name: tool, tool_input: { file_path: 'test/a.ts' } }, routineBranch).deny,
      ).toBe(true)
    }
    expect(
      evaluate(
        { tool_name: 'NotebookEdit', tool_input: { notebook_path: 'test/n.ipynb' } },
        routineBranch,
      ).deny,
    ).toBe(true)
  })

  it('routes Bash to all shell guards', () => {
    expect(
      evaluate({ tool_name: 'Bash', tool_input: { command: 'git push --force' } }, local).deny,
    ).toBe(true)
    expect(evaluate({ tool_name: 'Bash', tool_input: { command: 'printenv' } }, local).deny).toBe(
      true,
    )
    expect(
      evaluate({ tool_name: 'Bash', tool_input: { command: 'rm test/a.ts' } }, routineBranch).deny,
    ).toBe(true)
    expect(
      evaluate({ tool_name: 'Bash', tool_input: { command: 'npm test' } }, routineBranch).deny,
    ).toBe(false)
  })

  it('allows other tools and malformed inputs', () => {
    expect(
      evaluate({ tool_name: 'Read', tool_input: { file_path: 'test/a.ts' } }, routineBranch).deny,
    ).toBe(false)
    expect(evaluate({ tool_name: 'Edit', tool_input: {} }, routineBranch).deny).toBe(false)
    expect(evaluate({ tool_name: 'Bash', tool_input: { command: 42 } }, local).deny).toBe(false)
  })
})
