/**
 * Read a cookie value by name
 */
export function getCookie(name: string): string | null {
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

/**
 * Check whether any of the provided cookie names exist
 */
export function hasCookies(...names: string[]): boolean {
  return names.some((name) => getCookie(name) !== null)
}

/**
 * Delete a cookie by setting its expiry to the past
 */
export function deleteCookie(name: string, path = '/'): void {
  document.cookie = `${name}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}
