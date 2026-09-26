import { describe, expect, test } from 'vitest'
import { DEV_USER, getUser } from '../../../src/lib/auth/current-user'
import { PRINCIPAL_HEADER } from '../../../src/lib/auth/principal'
import { principalHeader, TEST_OBJECT_ID } from '../../helpers/principal'

describe('getUser', () => {
  test('uses the identity header when present', () => {
    const headers = new Headers({ [PRINCIPAL_HEADER]: principalHeader() })
    expect(getUser(headers, { devIdentity: true })).toEqual({ id: TEST_OBJECT_ID })
  })

  test('returns no user without the header when the stand-in identity is off', () => {
    expect(getUser(new Headers(), { devIdentity: false })).toBeNull()
  })

  test('returns the stand-in identity only when explicitly enabled', () => {
    expect(getUser(new Headers(), { devIdentity: true })).toEqual(DEV_USER)
  })
})
