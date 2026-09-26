// Assembles the Next.js standalone output into a runnable bundle (ADR 0001).
// The standalone server does not include static assets or public/; copy them in.
import { cpSync, existsSync } from 'node:fs'

const standalone = '.next/standalone'
if (!existsSync(`${standalone}/server.js`)) {
  throw new Error('Standalone output not found. Run `npm run build` first.')
}
cpSync('.next/static', `${standalone}/.next/static`, { recursive: true })
if (existsSync('public')) {
  cpSync('public', `${standalone}/public`, { recursive: true })
}
console.log('Standalone bundle ready in .next/standalone')
