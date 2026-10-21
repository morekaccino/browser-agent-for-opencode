/** Basic auth header that survives non-Latin1 usernames/passwords (btoa alone throws). */
export function basicAuthHeader(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username || 'opencode'}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}
