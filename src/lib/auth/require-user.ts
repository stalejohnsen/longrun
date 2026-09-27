import { headers } from 'next/headers'
import { getConfig } from '../config'
import { getUser } from './current-user'
import type { User } from './principal'

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

// Every server action checks the user itself; the proxy alone is not enough, because a
// server action is a POST to whatever page uses it (ADR 0002, Next.js Data Security guide).
export async function requireUser(): Promise<User> {
  const user = getUser(await headers(), getConfig())
  if (!user) throw new UnauthorizedError()
  return user
}
