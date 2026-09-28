// Monthly maintenance metrics (spec 0004). Runs with Node's built-in TypeScript support and
// the gh CLI, logged in with read access to the repository:
//   node scripts/metrics.ts 2026-09 [owner/repo]
import { execFileSync } from 'node:child_process'
import { collectMonth } from './metrics/collect.ts'
import { computeMetrics, formatMetrics } from './metrics/compute.ts'

const month = process.argv[2]
const repo = process.argv[3] ?? 'stalejohnsen/longrun'
if (!month) {
  process.stderr.write('Usage: node scripts/metrics.ts <YYYY-MM> [owner/repo]\n')
  process.exit(1)
}

const gh = (path: string) =>
  execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

process.stdout.write(`${formatMetrics(computeMetrics(collectMonth(gh, repo, month)))}\n`)
