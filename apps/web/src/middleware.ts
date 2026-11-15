import { auth } from '@/auth'
import { NextResponse } from 'next/server'

// Rotas que não precisam de autenticação
const PUBLIC_ROUTES = ['/login', '/api/auth']

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isPublic = PUBLIC_ROUTES.some((r) => nextUrl.pathname.startsWith(r))

  // Permite rotas públicas e assets estáticos
  if (isPublic) return NextResponse.next()

  // Redireciona para /login se não autenticado
  if (!session) {
    const loginUrl = new URL('/login', nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  // Aplica middleware em todas as rotas exceto assets estáticos e _next
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
