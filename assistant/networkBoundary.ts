export function requireLoopbackHttpUrl(value: string, label: string): URL {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  const loopback =
    host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  if (!loopback || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(`${label} must use an HTTP(S) loopback URL`)
  }
  url.pathname = url.pathname.replace(/\/$/, '')
  return url
}

