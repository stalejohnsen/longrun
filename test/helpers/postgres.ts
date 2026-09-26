import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Config } from '../../src/lib/config'

// Matches the Postgres major version used in docs/lifecycle.md.
export const POSTGRES_IMAGE = 'postgres:17-alpine'

export function startPostgres(database?: string): Promise<StartedPostgreSqlContainer> {
  const container = new PostgreSqlContainer(POSTGRES_IMAGE)
  return (database ? container.withDatabase(database) : container).start()
}

export function databaseConfig(container: StartedPostgreSqlContainer): Config['database'] {
  return {
    host: container.getHost(),
    port: container.getPort(),
    name: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
    ssl: false,
    managedIdentityClientId: undefined,
  }
}

export function databaseEnv(container: StartedPostgreSqlContainer): Record<string, string> {
  return {
    DATABASE_HOST: container.getHost(),
    DATABASE_PORT: String(container.getPort()),
    DATABASE_NAME: container.getDatabase(),
    DATABASE_USER: container.getUsername(),
    DATABASE_PASSWORD: container.getPassword(),
    DATABASE_SSL: 'disable',
  }
}
