// Link compartilhável do portal do cliente: HMAC do clientId com o segredo do app.
// Usa Web Crypto para funcionar tanto no middleware (edge) quanto nas rotas (node).

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET/NEXTAUTH_SECRET não configurado')
  return secret
}

export async function portalToken(clientId: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`portal:${clientId}`))
  return Array.from(new Uint8Array(sig))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function isValidPortalToken(clientId: string, token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const expected = await portalToken(clientId)
  if (expected.length !== token.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i)
  return diff === 0
}
