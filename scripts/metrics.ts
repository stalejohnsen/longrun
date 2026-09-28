// Monthly maintenance metrics (spec 0004). Runs with Node's built-in TypeScript support.
// Uses the gh CLI when it is installed, otherwise curl through the cloud session's GitHub proxy:
//   node scripts/metrics.ts 2026-09 [owner/repo]
import { execFileSync } from 'node:child_process'
import { collectMonth } from './metrics/collect.ts'
import { computeMetrics, formatMetrics } from './metrics/compute.ts'
import { githubTransport } from './metrics/transport.ts'

const month = process.argv[2]
const repo = process.argv[3] ?? 'stalejohnsen/longrun'
if (!month) {
  process.stderr.write('Usage: node scripts/metrics.ts <YYYY-MM> [owner/repo]\n')
  process.exit(1)
}

const gh = githubTransport((command, args) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }),
)

process.stdout.write(`${formatMetrics(computeMetrics(collectMonth(gh, repo, month)))}\n`)
