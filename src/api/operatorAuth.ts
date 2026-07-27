const TOKEN_KEY = 'sentinel.operator.token'

export function getOperatorToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setOperatorToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearOperatorToken(): void {
  window.localStorage.removeItem(TOKEN_KEY)
}

export function operatorHeaders(): Record<string, string> {
  const token = getOperatorToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
