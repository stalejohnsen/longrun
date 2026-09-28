// Spec 0004: deterministic guardrails for Claude Code sessions (PreToolUse hooks).
// Pure functions; scripts/claude-hooks/pre-tool-use.ts wires them to Claude Code.

export type Context = {
  // Project root, used to turn absolute tool paths into repository paths.
  projectDir: string
  // Current git branch, or null when unknown.
  branch: string | null
  // True in cloud sessions and routines (CLAUDE_CODE_REMOTE=true).
  remote: boolean
}

export type Decision = { deny: false } | { deny: true; rule: string; reason: string }

const ALLOW: Decision = { deny: false }

function deny(rule: string, reason: string): Decision {
  return { deny: true, rule, reason: `[${rule}] ${reason} (spec 0004)` }
}

// Files that define what "green" means. Routine work (claude/ branches, cloud sessions) must
// not change them; locally, permission rules in .claude/settings.json ask first.
const GUARDRAIL_RULES: { label: string; matches: (path: string) => boolean }[] = [
  { label: 'tests', matches: (p) => p.startsWith('test/') },
  {
    label: 'test, lint or type configuration',
    matches: (p) =>
      /^(vitest|playwright|eslint)\.config\.[cm]?[jt]s$/.test(p) || /^tsconfig[^/]*\.json$/.test(p),
  },
  { label: 'CI and repository configuration', matches: (p) => p.startsWith('.github/') },
  {
    label: 'dependency and npm configuration',
    matches: (p) => p === '.npmrc' || p === 'package.json' || p === 'package-lock.json',
  },
  { label: 'identity bootstrap', matches: (p) => p.startsWith('infra/bootstrap/') },
  { label: 'agent configuration', matches: (p) => p.startsWith('.claude/') },
]

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

// Repository-relative path, or null when the path is outside the project.
export function toRepoPath(filePath: string, projectDir: string): string | null {
  const file = normalize(filePath)
  const root = normalize(projectDir)
  const isAbsolute = /^([a-zA-Z]:)?\//.test(file)
  if (!isAbsolute) return file.replace(/^(\.\/)+/, '')
  // Windows paths are case-insensitive, and tools report drive letters in either case.
  const caseInsensitive = /^[a-zA-Z]:\//.test(root)
  const same = (a: string, b: string) =>
    caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b
  const prefix = file.slice(0, root.length)
  if (!same(prefix, root) || (file.length > root.length && file[root.length] !== '/')) return null
  return file.slice(root.length + 1)
}

export function guardrailLabel(repoPath: string): string | null {
  return GUARDRAIL_RULES.find((rule) => rule.matches(repoPath))?.label ?? null
}

function isAgentContext(context: Context): boolean {
  return context.remote || (context.branch?.startsWith('claude/') ?? false)
}

// --- File tools --------------------------------------------------------------------------

export function guardFileTool(filePath: string, context: Context): Decision {
  if (!isAgentContext(context)) return ALLOW
  const repoPath = toRepoPath(filePath, context.projectDir)
  const label = repoPath === null ? null : guardrailLabel(repoPath)
  if (label === null) return ALLOW
  return deny(
    'guard-files',
    `${repoPath} is ${label}, a guardrail file. Routine work may not change it. Report the case as needs-owner instead`,
  )
}

// --- Shell commands ----------------------------------------------------------------------

// Naive split on shell separators. Good enough for policy checks; quoting is not interpreted.
export function subcommands(command: string): string[] {
  return command
    .split(/&&|\|\||;|\||\n/)
    .map((part) => part.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ''))
    .filter((part) => part.length > 0)
}

const WRITE_OPERATION =
  /(^|\s)(rm|mv|cp|tee|truncate|touch|ln|chmod|install|unlink)\s|(^|\s)sed\s+(-[a-zA-Z]*i|--in-place)|(^|\s)perl\s+-[a-zA-Z]*i|(^|\s)git\s+(rm|mv|checkout|restore|apply|am)\s|>|writeFile|appendFile|rmSync|unlinkSync/

function pathTokens(command: string): string[] {
  return command
    .split(/[\s"'=<>()]+/)
    .map((token) => token.replace(/[,;]+$/, ''))
    .filter((token) => token.length > 0)
}

export function guardFilesInShell(command: string, context: Context): Decision {
  if (!isAgentContext(context)) return ALLOW
  for (const part of subcommands(command)) {
    if (!WRITE_OPERATION.test(part)) continue
    for (const token of pathTokens(part)) {
      const repoPath = toRepoPath(token, context.projectDir)
      const label = repoPath === null ? null : guardrailLabel(repoPath)
      if (label !== null) {
        return deny(
          'guard-files',
          `the command may change ${repoPath} (${label}), a guardrail file. Routine work may not change it`,
        )
      }
    }
  }
  return ALLOW
}

const PROTECTED_BRANCH = 'main'

function branchAfter(part: string, current: string | null): string | null {
  const create = /^git\s+(?:switch\s+(?:-c|--create|-C)|checkout\s+-[bB])\s+(\S+)/.exec(part)
  if (create) return create[1] ?? current
  const change = /^git\s+(?:switch|checkout)\s+([^-\s]\S*)\s*$/.exec(part)
  if (change) return change[1] ?? current
  return current
}

export function guardGit(command: string, context: Context): Decision {
  let branch = context.branch
  for (const part of subcommands(command)) {
    if (!/^git\s/.test(part)) continue
    if (/(^|\s)--no-verify(\s|$)/.test(part)) {
      return deny('guard-git', 'skipping git hooks (--no-verify) is not allowed')
    }
    const push = /^git\s+push\b/.test(part)
    if (push && (/\s(--force|--force-with-lease|-f)(\s|=|$)/.test(part) || /\s\+\S/.test(part))) {
      return deny('guard-git', 'force push is not allowed')
    }
    if (push && /(\s|:)(refs\/heads\/)?main(\s|$)/.test(part)) {
      return deny('guard-git', 'pushing to main is not allowed; open a pull request')
    }
    branch = branchAfter(part, branch)
    if (branch === PROTECTED_BRANCH) {
      if (/^git\s+commit\b/.test(part)) {
        return deny('guard-git', 'committing on main is not allowed; create a branch first')
      }
      if (push) return deny('guard-git', 'pushing from main is not allowed; open a pull request')
      if (/^git\s+reset\b.*--hard/.test(part)) {
        return deny('guard-git', 'git reset --hard on main is not allowed')
      }
    }
  }
  return ALLOW
}

const SECRET_NAME =
  /\$\{?[A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY)[A-Za-z0-9_]*/i

export function guardSecrets(command: string): Decision {
  for (const part of subcommands(command)) {
    if (/^(env|printenv)(\s+[A-Za-z_][A-Za-z0-9_]*)*\s*$/.test(part)) {
      return deny('guard-secrets', 'printing the environment may expose secrets')
    }
    if (/^az\s+account\s+get-access-token\b/.test(part)) {
      return deny('guard-secrets', 'printing an Azure access token is not allowed')
    }
    if (/^gh\s+auth\s+token\b/.test(part) || /^gh\s+auth\s+status\b.*--show-token/.test(part)) {
      return deny('guard-secrets', 'printing a GitHub token is not allowed')
    }
    if (/^(echo|printf)\b/.test(part) && SECRET_NAME.test(part)) {
      return deny('guard-secrets', 'printing a secret variable is not allowed')
    }
    if (
      /^(cat|less|more|head|tail|bat|type)\b/.test(part) &&
      /(^|[\s/])\.env(\.[\w-]+)?(\s|$)/.test(part)
    ) {
      return deny('guard-secrets', 'reading .env files is not allowed')
    }
  }
  return ALLOW
}

// --- Entry point logic -------------------------------------------------------------------

export type ToolCall = { tool_name: string; tool_input: Record<string, unknown> }

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// --- GitHub MCP tools ----------------------------------------------------------------------

// Cloud sessions and routines get GitHub MCP tools (mcp__github__*). These actions stay with
// the owner (ADR 0009): merging, auto-merge, starting workflows (the deploy), writing files
// through the API (bypasses guard-files), repository creation and reviews. Reading, branches,
// pull requests and comments stay allowed. Mirrored by permissions.deny in .claude/settings.json.
export const DENIED_GITHUB_TOOLS: Record<string, string> = {
  merge_pull_request: 'merging is for the owner to decide',
  enable_pr_auto_merge: 'auto-merge is configured by the owner only',
  disable_pr_auto_merge: 'auto-merge is configured by the owner only',
  actions_run_trigger:
    'starting, re-running or cancelling workflows (such as the deploy) is for the owner to decide',
  create_or_update_file:
    'writing files through the API bypasses the guardrails; commit with git instead',
  push_files: 'writing files through the API bypasses the guardrails; commit with git instead',
  delete_file: 'deleting files through the API bypasses the guardrails',
  update_pull_request:
    'changing the state, base or branch of a pull request is for the owner to decide',
  update_pull_request_branch: 'updating a pull request branch is for the owner to decide',
  pull_request_review_write: 'reviews and approvals are for the owner',
  create_repository: 'creating repositories is outside the task',
  fork_repository: 'forking repositories is outside the task',
}

export function guardGitHubTool(toolName: string): Decision {
  // mcp__<server>__<tool>; server names may contain single underscores.
  const [prefix, server, ...rest] = toolName.split('__')
  if (prefix !== 'mcp' || !server || !/github/i.test(server)) return ALLOW
  const tool = rest.join('__')
  const reason = DENIED_GITHUB_TOOLS[tool]
  return reason === undefined ? ALLOW : deny('guard-github', `${tool}: ${reason}`)
}

export function evaluate(call: ToolCall, context: Context): Decision {
  if (call.tool_name.startsWith('mcp__')) return guardGitHubTool(call.tool_name)
  if (FILE_TOOLS.has(call.tool_name)) {
    const path = call.tool_input.file_path ?? call.tool_input.notebook_path
    return typeof path === 'string' ? guardFileTool(path, context) : ALLOW
  }
  if (call.tool_name === 'Bash') {
    const command = call.tool_input.command
    if (typeof command !== 'string') return ALLOW
    for (const decision of [
      guardGit(command, context),
      guardSecrets(command),
      guardFilesInShell(command, context),
    ]) {
      if (decision.deny) return decision
    }
  }
  return ALLOW
}
