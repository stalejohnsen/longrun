import { getDb } from '../db/client'
import type { ServiceDeps } from './component-service'
import { getConfig } from './config'
import { lookUpEndOfLife } from './endoflife'

// Production wiring for src/lib/component-service.ts.
export function serviceDeps(): ServiceDeps {
  const { endOfLifeBaseUrl } = getConfig()
  return {
    db: getDb(),
    lookUp: (product, release) => lookUpEndOfLife(product, release, { baseUrl: endOfLifeBaseUrl }),
    now: () => new Date(),
  }
}
