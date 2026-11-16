import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/api/auth']

function hasSession(req: NextRequest): boolean {
  return !!(
    req.cookies.get('__Secure-next-auth.session-token')?.value ||
    req.cookies.get('next-auth.session-token')?.value
  )
}

export function middleware(req: NextRequest) {
  const { nextUrl } = req
  const isPublic = PUBLIC_ROUTES.some((r) => nextUrl.pathname.startsWith(r))

  if (isPublic) return NextResponse.next()

  if (!hasSession(req)) {
    const loginUrl = new URL('/login', nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
