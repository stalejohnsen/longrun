// Local stand-in for the endoflife.date API in end-to-end tests (spec 0001), so tests never
// depend on the real service. Shapes match the real API (checked 2026-09-27).
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const releases: Record<string, { status: number; body: string; type: string }> = {
  '/api/v1/products/nodejs/releases/24': {
    status: 200,
    type: 'application/json',
    body: JSON.stringify({ result: { name: '24', isEol: false, eolFrom: '2028-04-30' } }),
  },
  '/api/v1/products/nodejs/releases/22': {
    status: 200,
    type: 'application/json',
    body: JSON.stringify({ result: { name: '22', isEol: false, eolFrom: '2027-04-30' } }),
  },
  '/api/v1/products/nodejs/releases/26': {
    status: 200,
    type: 'application/json',
    body: JSON.stringify({ result: { name: '26', isEol: false, eolFrom: null } }),
  },
  '/api/v1/products/broken/releases/1': {
    status: 503,
    type: 'text/plain',
    body: 'unavailable',
  },
}

export async function startEndOfLifeStub(): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer((req, res) => {
    const known = releases[req.url ?? '']
    if (!known) {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('<!DOCTYPE html><title>Page not Found | endoflife.date</title>')
      return
    }
    res.writeHead(known.status, { 'content-type': known.type })
    res.end(known.body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }
}
