// Builds an App Service `X-MS-CLIENT-PRINCIPAL` header value for tests.
export const TEST_OBJECT_ID = '11111111-2222-4333-8444-555555555555'

export function principalHeader(
  claims: Array<{ typ: string; val: string }> = [
    { typ: 'http://schemas.microsoft.com/identity/claims/objectidentifier', val: TEST_OBJECT_ID },
    { typ: 'name', val: 'Test User' },
  ],
  authType = 'aad',
): string {
  const payload = { auth_typ: authType, claims, name_typ: 'name', role_typ: 'roles' }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}
