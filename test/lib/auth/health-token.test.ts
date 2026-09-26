import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { isValidHealthToken } from '../../../src/lib/auth/health-token'

const key = 'platform-encryption-key'
const token = createHash('sha256').update(key).digest('base64')

describe('isValidHealthToken', () => {
  test('accepts the Base64 SHA-256 hash of the encryption key', () => {
    expect(isValidHealthToken(token, key)).toBe(true)
  })

  test.each([
    ['a token for a different key', createHash('sha256').update('other').digest('base64'), key],
    ['a missing token', null, key],
    ['a token of the wrong length', Buffer.from('short').toString('base64'), key],
    ['a missing encryption key', token, undefined],
  ])('rejects %s', (_case, header, encryptionKey) => {
    expect(isValidHealthToken(header, encryptionKey)).toBe(false)
  })
})
