import type { Config } from '../config'
import { parsePrincipal, PRINCIPAL_HEADER, type User } from './principal'

// Fixed stand-in identity for local development only (ADR 0002). Config validation
// refuses LONGRUN_DEV_IDENTITY when running in Azure.
export const DEV_USER: User = { id: '00000000-0000-4000-8000-000000000001' }

export function getUser(headers: Headers, config: Pick<Config, 'devIdentity'>): User | null {
  return parsePrincipal(headers.get(PRINCIPAL_HEADER)) ?? (config.devIdentity ? DEV_USER : null)
}
