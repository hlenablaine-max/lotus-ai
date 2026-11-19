import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isValidPortalToken } from '@/lib/portal-token'

const PUBLIC_ROUTES = ['/login', '/api/auth']

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

  const loginUrl = new URL('/login', nextUrl.origin)
  loginUrl.searchParams.set('callbackUrl', nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
