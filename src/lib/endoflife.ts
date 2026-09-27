import { z } from 'zod'

// endoflife.date lookup (spec 0001 "endoflife.date lookup"). The API is external and untrusted
// (CLAUDE.md): inputs are validated before any request, the response is validated with a
// schema, the call is time-bounded, and every failure becomes "unavailable" so the user can
// enter a date manually. Logs never contain the user-entered product or release.

export type LookupResult =
  | { kind: 'found'; date: string }
  | { kind: 'no-date' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }

export type LookupOptions = {
  baseUrl: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export const LOOKUP_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 256 * 1024

// Same rules as src/domain/component.ts; checked again here so this module is safe on its own.
const PRODUCT = /^[a-z0-9._-]{1,100}$/
const RELEASE = /^[A-Za-z0-9._-]{1,50}$/

// Only the fields the spec uses; unknown fields are ignored.
const releaseResponse = z.object({
  result: z.object({
    name: z.string(),
    eolFrom: z.iso.date().nullable(),
    isEol: z.boolean().nullable().optional(),
  }),
})

export class InvalidLookupInput extends Error {
  constructor() {
    super('Invalid endoflife.date product or release')
    this.name = 'InvalidLookupInput'
  }
}

type FailureReason = 'timeout' | 'network' | 'status' | 'too-large' | 'invalid-response'

function unavailable(reason: FailureReason, status?: number): LookupResult {
  console.warn(
    JSON.stringify({ level: 'warn', msg: 'endoflife.date lookup failed', reason, status }),
  )
  return { kind: 'unavailable' }
}

export async function lookUpEndOfLife(
  product: string,
  release: string,
  options: LookupOptions,
): Promise<LookupResult> {
  // Spec 0001 E4: never send disallowed values anywhere.
  if (!PRODUCT.test(product) || !RELEASE.test(release)) {
    throw new InvalidLookupInput()
  }
  const url = new URL(
    `api/v1/products/${encodeURIComponent(product)}/releases/${encodeURIComponent(release)}`,
    options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`,
  )
  const fetchImpl = options.fetchImpl ?? fetch

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'Longrun (lifecycle register)' },
      // An unexpected redirect could point anywhere; treat it as a failure.
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? LOOKUP_TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    return unavailable(timedOut ? 'timeout' : 'network')
  }

  if (response.status === 404) {
    await response.body?.cancel()
    return { kind: 'not-found' }
  }
  if (response.status !== 200) {
    await response.body?.cancel()
    return unavailable('status', response.status)
  }

  let text: string
  try {
    text = await readLimited(response, MAX_RESPONSE_BYTES)
  } catch (error) {
    if (error instanceof ResponseTooLarge) return unavailable('too-large')
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    return unavailable(timedOut ? 'timeout' : 'network')
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return unavailable('invalid-response')
  }
  const parsed = releaseResponse.safeParse(json)
  if (!parsed.success) {
    return unavailable('invalid-response')
  }
  const { eolFrom } = parsed.data.result
  return eolFrom === null ? { kind: 'no-date' } : { kind: 'found', date: eolFrom }
}

class ResponseTooLarge extends Error {}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel()
    throw new ResponseTooLarge()
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new ResponseTooLarge()
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
