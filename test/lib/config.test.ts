import { describe, expect, test } from 'vitest'
import { ConfigError, parseConfig } from '../../src/lib/config'

const local = {
  DATABASE_HOST: 'localhost',
  DATABASE_NAME: 'longrun',
  DATABASE_USER: 'longrun',
  DATABASE_PASSWORD: 'local-secret-value',
}

const azure = {
  WEBSITE_SITE_NAME: 'longrun-app',
  WEBSITE_AUTH_ENABLED: 'True',
  DATABASE_HOST: 'longrun.postgres.database.azure.com',
  DATABASE_NAME: 'longrun',
  DATABASE_USER: 'longrun-app-identity',
  AZURE_CLIENT_ID: '0b8c6c3e-5a6f-4d3e-9a2b-1c2d3e4f5a6b',
}

function settingsOf(env: Record<string, string>): string[] {
  try {
    parseConfig(env)
  } catch (error) {
    if (error instanceof ConfigError) return error.settings
    throw error
  }
  throw new Error('expected a ConfigError')
}

function without(env: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([name]) => name !== key))
}

describe('configuration outside Azure', () => {
  test('accepts a local database with a password and applies defaults', () => {
    const config = parseConfig(local)
    expect(config.inAzure).toBe(false)
    expect(config.database).toMatchObject({ port: 5432, ssl: true, password: 'local-secret-value' })
    expect(config.devIdentity).toBe(false)
  })

  test('requires a database password', () => {
    expect(settingsOf(without(local, 'DATABASE_PASSWORD'))).toEqual([
      'DATABASE_PASSWORD is required outside Azure',
    ])
  })

  test('uses the public endoflife.date API by default and allows a local stub', () => {
    expect(parseConfig(local).endOfLifeBaseUrl).toBe('https://endoflife.date')
    expect(
      parseConfig({ ...local, ENDOFLIFE_BASE_URL: 'http://127.0.0.1:4010' }).endOfLifeBaseUrl,
    ).toBe('http://127.0.0.1:4010')
  })

  test.each(['ftp://endoflife.date', 'javascript:alert(1)', 'not a url'])(
    'rejects endoflife.date base URL %j',
    (url) => {
      expect(settingsOf({ ...local, ENDOFLIFE_BASE_URL: url })).toEqual([
        'ENDOFLIFE_BASE_URL is missing or invalid',
      ])
    },
  )

  test('allows the development stand-in identity', () => {
    expect(parseConfig({ ...local, LONGRUN_DEV_IDENTITY: 'true' }).devIdentity).toBe(true)
  })

  test('names missing or invalid settings without echoing values', () => {
    const settings = settingsOf({ ...local, DATABASE_HOST: '', DATABASE_PORT: 'not-a-port' })
    expect(settings).toEqual([
      'DATABASE_HOST is missing or invalid',
      'DATABASE_PORT is missing or invalid',
    ])
    expect(settings.join(' ')).not.toContain('not-a-port')
  })
})

describe('configuration in Azure (App Service)', () => {
  test('accepts managed identity with built-in auth enabled', () => {
    const config = parseConfig(azure)
    expect(config.inAzure).toBe(true)
    expect(config.database.password).toBeUndefined()
    expect(config.database.managedIdentityClientId).toBe(azure.AZURE_CLIENT_ID)
  })

  test('refuses to start when built-in authentication is disabled or unknown', () => {
    const message = 'WEBSITE_AUTH_ENABLED App Service built-in authentication must be enabled'
    expect(settingsOf({ ...azure, WEBSITE_AUTH_ENABLED: 'false' })).toContain(message)
    expect(settingsOf(without(azure, 'WEBSITE_AUTH_ENABLED'))).toContain(message)
  })

  test('refuses a static database password and does not echo it', () => {
    const settings = settingsOf({ ...azure, DATABASE_PASSWORD: 'leaked-password' })
    expect(settings).toContain('DATABASE_PASSWORD must not be set in Azure; use managed identity')
    expect(settings.join(' ')).not.toContain('leaked-password')
  })

  test('requires the managed identity client ID', () => {
    expect(settingsOf(without(azure, 'AZURE_CLIENT_ID'))).toContain(
      'AZURE_CLIENT_ID is required in Azure',
    )
  })

  test('refuses the development stand-in identity', () => {
    expect(settingsOf({ ...azure, LONGRUN_DEV_IDENTITY: 'true' })).toContain(
      'LONGRUN_DEV_IDENTITY must not be enabled in Azure',
    )
  })

  test('requires https for the endoflife.date API', () => {
    expect(settingsOf({ ...azure, ENDOFLIFE_BASE_URL: 'http://endoflife.date' })).toContain(
      'ENDOFLIFE_BASE_URL must use https in Azure',
    )
  })

  test('refuses unencrypted database connections', () => {
    expect(settingsOf({ ...azure, DATABASE_SSL: 'disable' })).toContain(
      'DATABASE_SSL must be "require" in Azure',
    )
  })
})
