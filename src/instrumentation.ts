// Runs once when the server starts. Invalid configuration stops the process with a
// message that names the settings, never their values (ADR 0005). Next.js only logs
// errors thrown here and keeps serving, so exit explicitly.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ConfigError, getConfig } = await import('./lib/config')
    try {
      getConfig()
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error(
          JSON.stringify({
            level: 'fatal',
            msg: 'invalid configuration',
            settings: error.settings,
          }),
        )
        process.exit(1)
      }
      throw error
    }
  }
}
