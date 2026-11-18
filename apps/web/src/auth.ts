import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // Phase 1: acesso simplificado com credenciais do owner via env vars
        // Phase 2: bcrypt + multi-user com lookup no banco
        const OWNER_EMAIL = process.env.OWNER_EMAIL
        const OWNER_PASSWORD = process.env.OWNER_PASSWORD
        if (!OWNER_EMAIL || !OWNER_PASSWORD) return null

        if (
          credentials.email === OWNER_EMAIL &&
          credentials.password === OWNER_PASSWORD
        ) {
          // Sync DB sem bloquear o login (fire-and-forget)
          if (process.env.DATABASE_URL) {
            prisma.user.upsert({
              where: { email: OWNER_EMAIL },
              update: {},
              create: { email: OWNER_EMAIL, name: 'Ícaro', role: 'OWNER' },
            }).catch(() => {/* silencioso */})
          }

          return {
            id: 'owner-icaro',
            email: OWNER_EMAIL,
            name: 'Ícaro',
            role: 'OWNER',
          }
        }

        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role ?? 'OWNER'
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        ;(session.user as { role?: string }).role = token.role as string
      }
      return session
    },
  },
})
