import { describe, expect, test } from 'vitest'
import { parsePrincipal } from '../../../src/lib/auth/principal'
import { principalHeader, TEST_OBJECT_ID } from '../../helpers/principal'

describe('parsePrincipal', () => {
  test('returns the Entra object ID from the mapped claim name', () => {
    expect(parsePrincipal(principalHeader())).toEqual({ id: TEST_OBJECT_ID })
  })

  test('accepts the short oid claim name', () => {
    expect(parsePrincipal(principalHeader([{ typ: 'oid', val: TEST_OBJECT_ID }]))).toEqual({
      id: TEST_OBJECT_ID,
    })
  })

  test('does not expose other claims such as the display name', () => {
    expect(Object.keys(parsePrincipal(principalHeader()) ?? {})).toEqual(['id'])
  })

  test.each([
    ['a missing header', null],
    ['an empty header', ''],
    ['a value that is not Base64', 'not base64 at all'],
    ['Base64 that is not JSON', Buffer.from('not json').toString('base64')],
    ['JSON of the wrong shape', Buffer.from(JSON.stringify({ claims: 'x' })).toString('base64')],
    ['a principal without an object ID', principalHeader([{ typ: 'name', val: 'Someone' }])],
    ['an object ID that is not a UUID', principalHeader([{ typ: 'oid', val: 'admin' }])],
    ['an oversized header', 'A'.repeat(20_000)],
  ])('treats %s as no user', (_case, header) => {
    expect(parsePrincipal(header)).toBeNull()
  })
})
