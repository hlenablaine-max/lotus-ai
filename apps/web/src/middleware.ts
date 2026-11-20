import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isValidPortalToken } from '@/lib/portal-token'

// /api/internal/busy só diz se há agente trabalhando (sim/não): o app desktop usa para saber quando pode reiniciar o servidor
const PUBLIC_ROUTES = ['/login', '/api/auth', '/api/internal/busy']

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) return false
  const secureCookie = req.nextUrl.protocol === 'https:'
  try {
    const token = await getToken({ req, secret, secureCookie })
    return !!token
  } catch {
    return false
  }
}

// Portal do cliente: acesso por link assinado (?t=...), que vira cookie para as chamadas da página.
async function portalAccess(req: NextRequest): Promise<NextResponse | null> {
  const match = req.nextUrl.pathname.match(/^\/(?:api\/)?portal\/([^/]+)/)
  if (!match) return null
  const clientId = match[1]
  const cookieName = `lotus_portal_${clientId}`
  const fromQuery = req.nextUrl.searchParams.get('t')
  const token = fromQuery ?? req.cookies.get(cookieName)?.value
  if (!(await isValidPortalToken(clientId, token))) return null

  const res = NextResponse.next()
  if (fromQuery) {
    res.cookies.set(cookieName, fromQuery, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
  }
  return res
}

export async function middleware(req: NextRequest) {
  const { nextUrl } = req
  const isPublic = PUBLIC_ROUTES.some((r) => nextUrl.pathname.startsWith(r))
  if (isPublic) return NextResponse.next()

  if (await hasValidSession(req)) return NextResponse.next()

  const portal = await portalAccess(req)
  if (portal) return portal

  if (nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  // Cliente com link do portal inválido ou vencido: página explicando, em vez da tela de login do dono
  if (nextUrl.pathname.startsWith('/portal/')) {
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link inválido</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07070f;color:#e8e8f0;font-family:system-ui,sans-serif}.b{max-width:420px;padding:32px;text-align:center}h1{font-size:20px}p{color:#9a9ab0;line-height:1.6}</style></head>
<body><div class="b"><h1>Este link não está mais válido</h1><p>O link do portal pode ter sido copiado pela metade ou ter vencido. Peça um link novo para a agência.</p></div></body></html>`
    return new NextResponse(html, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const loginUrl = new URL('/login', nextUrl.origin)
  loginUrl.searchParams.set('callbackUrl', nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
