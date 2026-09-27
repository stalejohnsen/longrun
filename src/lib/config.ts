import { z } from 'zod'

// All configuration is validated once, at the boundary (ADR 0005).
// Errors name the setting, never its value.

const flag = z
  .enum(['true', 'false', 'True', 'False', 'TRUE', 'FALSE'])
  .transform((value) => value.toLowerCase() === 'true')

const configSchema = z
  .object({
    // Injected read-only by App Service; its presence means we run in Azure.
    WEBSITE_SITE_NAME: z.string().min(1).optional(),
    // Injected read-only by App Service when built-in authentication is enabled (ADR 0002).
    WEBSITE_AUTH_ENABLED: flag.optional(),

    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DATABASE_NAME: z.string().min(1),
    DATABASE_USER: z.string().min(1),
    // Local development and tests only; refused in Azure (ADR 0004).
    DATABASE_PASSWORD: z.string().min(1).optional(),
    DATABASE_SSL: z.enum(['require', 'disable']).default('require'),
    // Client ID of the user-assigned managed identity used for database tokens (ADR 0004).
    AZURE_CLIENT_ID: z.uuid().optional(),

    // Development-only stand-in identity; refused in Azure (ADR 0002).
    LONGRUN_DEV_IDENTITY: flag.default(false),
  })
  .superRefine((env, ctx) => {
    const inAzure = env.WEBSITE_SITE_NAME !== undefined
    if (inAzure) {
      if (env.WEBSITE_AUTH_ENABLED !== true) {
        ctx.addIssue({
          code: 'custom',
          path: ['WEBSITE_AUTH_ENABLED'],
          message: 'App Service built-in authentication must be enabled',
        })
      }
      if (env.DATABASE_PASSWORD !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATABASE_PASSWORD'],
          message: 'must not be set in Azure; use managed identity',
        })
      }
      if (env.AZURE_CLIENT_ID === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['AZURE_CLIENT_ID'],
          message: 'is required in Azure',
        })
      }
      if (env.LONGRUN_DEV_IDENTITY) {
        ctx.addIssue({
          code: 'custom',
          path: ['LONGRUN_DEV_IDENTITY'],
          message: 'must not be enabled in Azure',
        })
      }
      if (env.DATABASE_SSL !== 'require') {
        ctx.addIssue({
          code: 'custom',
          path: ['DATABASE_SSL'],
          message: 'must be "require" in Azure',
        })
      }
    } else if (env.DATABASE_PASSWORD === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_PASSWORD'],
        message: 'is required outside Azure',
      })
    }
  })

export type Config = {
  inAzure: boolean
  devIdentity: boolean
  database: {
    host: string
    port: number
    name: string
    user: string
    ssl: boolean
    password: string | undefined
    managedIdentityClientId: string | undefined
  }
}

export class ConfigError extends Error {
  readonly settings: string[]

  constructor(settings: string[]) {
    super(`Invalid configuration: ${settings.join('; ')}`)
    this.name = 'ConfigError'
    this.settings = settings
  }
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    // Report setting names and rule messages only; never echo values.
    const settings = result.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(root)'
      return issue.code === 'custom' ? `${name} ${issue.message}` : `${name} is missing or invalid`
    })
    throw new ConfigError(settings)
  }
  const env_ = result.data
  return {
    inAzure: env_.WEBSITE_SITE_NAME !== undefined,
    devIdentity: env_.LONGRUN_DEV_IDENTITY,
    database: {
      host: env_.DATABASE_HOST,
      port: env_.DATABASE_PORT,
      name: env_.DATABASE_NAME,
      user: env_.DATABASE_USER,
      ssl: env_.DATABASE_SSL === 'require',
      password: env_.DATABASE_PASSWORD,
      managedIdentityClientId: env_.AZURE_CLIENT_ID,
    },
  }
}

let cached: Config | undefined

export function getConfig(): Config {
  cached ??= parseConfig(process.env)
  return cached
}
