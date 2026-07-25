import fs from 'node:fs'
import path from 'node:path'

/**
 * Load KEY=VALUE pairs from project-root .env into process.env (no overwrite).
 * Keeps C2 server aligned with Vite's .env without a dotenv dependency.
 */
export function loadEnvFile(filename = '.env'): void {
  const envPath = path.resolve(process.cwd(), filename)
  if (!fs.existsSync(envPath)) return

  const text = fs.readFileSync(envPath, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
