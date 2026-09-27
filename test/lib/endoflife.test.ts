import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { InvalidLookupInput, lookUpEndOfLife } from '../../src/lib/endoflife'

// Spec 0001 "endoflife.date lookup", against a real local HTTP stub (no mocking library).

type Handler = (req: IncomingMessage, res: ServerResponse) => void
let handler: Handler = (_req, res) => res.end()
const requests: string[] = []
let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push(req.url ?? '')
    handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

afterEach(() => {
  requests.length = 0
  vi.restoreAllMocks()
})

function json(body: unknown, status = 200): Handler {
  return (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
}

// Shape of the real response (checked 2026-09-27), including fields the app ignores.
const nodejs24 = {
  schema_version: '1.2.1',
  result: {
    name: '24',
    label: '24 (LTS)',
    isEol: false,
    eolFrom: '2028-04-30',
    isEoas: false,
    eoasFrom: '2026-10-20',
    latest: { name: '24.21.0' },
  },
}

describe('lookup outcomes', () => {
  test('AC2: found → the eolFrom date, requested at the documented path', async () => {
    handler = json(nodejs24)
    expect(await lookUpEndOfLife('nodejs', '24', { baseUrl })).toEqual({
      kind: 'found',
      date: '2028-04-30',
    })
    expect(requests).toEqual(['/api/v1/products/nodejs/releases/24'])
  })

  test('product and release with dots, underscores and hyphens are sent as-is', async () => {
    handler = json({ result: { name: '24.04', eolFrom: '2029-05-31' } })
    await lookUpEndOfLife('amazon-linux_2.x', '24.04', { baseUrl })
    expect(requests).toEqual(['/api/v1/products/amazon-linux_2.x/releases/24.04'])
  })

  test('a base URL with a path or trailing slash is joined correctly', async () => {
    handler = json(nodejs24)
    await lookUpEndOfLife('nodejs', '24', { baseUrl: `${baseUrl}/` })
    expect(requests).toEqual(['/api/v1/products/nodejs/releases/24'])
  })

  test('found, but eolFrom is null → no announced date', async () => {
    handler = json({ result: { name: '26', eolFrom: null, isEol: false } })
    expect(await lookUpEndOfLife('nodejs', '26', { baseUrl })).toEqual({ kind: 'no-date' })
  })

  test('E5: 404 (endoflife.date answers with HTML) → not found', async () => {
    handler = (_req, res) => {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('<!DOCTYPE html><title>Page not Found</title>')
    }
    expect(await lookUpEndOfLife('nodejs', '999', { baseUrl })).toEqual({ kind: 'not-found' })
  })
})

describe('E6: failures become "unavailable" and are logged without user input', () => {
  test.each([
    ['a 5xx status', json({ error: 'boom' }, 503)],
    [
      'a 3xx redirect',
      ((_req, res) => {
        res.writeHead(302, { location: 'https://example.com/elsewhere' })
        res.end()
      }) as Handler,
    ],
    [
      'a body that is not JSON',
      ((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('not json')
      }) as Handler,
    ],
    ['JSON of the wrong shape', json({ result: { eolFrom: 20280430 } })],
    ['an eolFrom that is not a date', json({ result: { name: '24', eolFrom: '30.04.2028' } })],
    [
      'a response larger than 256 KiB',
      json({ result: { name: 'x'.repeat(300_000), eolFrom: null } }),
    ],
    [
      'a chunked response (no content-length) that grows past 256 KiB',
      ((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        for (let i = 0; i < 40; i++) res.write('x'.repeat(10_000))
        res.end()
      }) as Handler,
    ],
  ])('%s', async (_case, stub) => {
    handler = stub
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await lookUpEndOfLife('secret-product', 'secret-release', { baseUrl })).toEqual({
      kind: 'unavailable',
    })
    expect(warn).toHaveBeenCalledOnce()
    const logged = String(warn.mock.calls[0]?.[0])
    expect(JSON.parse(logged)).toMatchObject({ level: 'warn', msg: 'endoflife.date lookup failed' })
    expect(logged).not.toContain('secret-product')
    expect(logged).not.toContain('secret-release')
  })

  test('a response slower than the timeout', async () => {
    handler = (_req, res) => {
      setTimeout(() => json(nodejs24)(_req, res), 1_000)
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const started = Date.now()
    expect(await lookUpEndOfLife('nodejs', '24', { baseUrl, timeoutMs: 100 })).toEqual({
      kind: 'unavailable',
    })
    expect(Date.now() - started).toBeLessThan(900)
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({ reason: 'timeout' })
  })

  test('a body that stalls after the headers (timeout while reading)', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('{"result":')
      // Never finishes the body.
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await lookUpEndOfLife('nodejs', '24', { baseUrl, timeoutMs: 150 })).toEqual({
      kind: 'unavailable',
    })
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({ reason: 'timeout' })
  })

  test('an empty 200 response', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': '0' })
      res.end()
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await lookUpEndOfLife('nodejs', '24', { baseUrl })).toEqual({ kind: 'unavailable' })
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      reason: 'invalid-response',
    })
  })

  test('a network error (nothing listening)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await lookUpEndOfLife('nodejs', '24', { baseUrl: 'http://127.0.0.1:1' })).toEqual({
      kind: 'unavailable',
    })
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({ reason: 'network' })
  })

  test('uses a 5 second timeout by default', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    handler = json(nodejs24)
    await lookUpEndOfLife('nodejs', '24', { baseUrl })
    expect(timeout).toHaveBeenCalledWith(5_000)
  })
})

describe('E4: disallowed product or release', () => {
  test.each([
    ['../admin', '24'],
    ['nodejs', '../../x'],
    ['node/js', '24'],
    ['nodejs', '24?x=1'],
    ['NodeJS', '24'],
    ['nodejs', ''],
    ['', '24'],
    ['nodejs', 'x'.repeat(51)],
  ])('%j / %j is refused and no request is made', async (product, release) => {
    await expect(lookUpEndOfLife(product, release, { baseUrl })).rejects.toThrow(InvalidLookupInput)
    expect(requests).toEqual([])
  })
})
