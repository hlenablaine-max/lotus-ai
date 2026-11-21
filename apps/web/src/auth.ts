import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { authenticateMember } from '@/lib/team'

interface LocalUser {
  email: string
  password: string
  name: string
}

// Contas definidas no .env.local de cada computador: o dono e, opcionalmente, o sócio.
// Os dois enxergam os mesmos clientes e missões porque usam o mesmo banco.
function configuredUsers(): LocalUser[] {
  const users: LocalUser[] = []
  if (process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    users.push({ email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD, name: process.env.OWNER_NAME || 'Ícaro' })
  }
  if (process.env.PARTNER_EMAIL && process.env.PARTNER_PASSWORD) {
    users.push({ email: process.env.PARTNER_EMAIL, password: process.env.PARTNER_PASSWORD, name: process.env.PARTNER_NAME || 'Sócio' })
  }
  return users
}

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

        const email = String(credentials.email).trim().toLowerCase()
        const user = configuredUsers().find((u) => u.email.toLowerCase() === email && u.password === credentials.password)
        if (!user) {
          // Equipe: login próprio cadastrado pelo dono (senha guardada só como hash)
          const member = process.env.DATABASE_URL ? await authenticateMember(email, String(credentials.password)).catch(() => null) : null
          return member ? { id: member.id, email: member.email, name: member.name, role: member.role } : null
        }

        // Registra o usuário no banco (é o que identifica quem aprovou cada ação), sem bloquear o login
        if (process.env.DATABASE_URL) {
          prisma.user
            .upsert({
              where: { email: user.email },
              update: { name: user.name, lastLoginAt: new Date() },
              create: { email: user.email, name: user.name, role: 'OWNER' },
            })
            .catch(() => {/* silencioso */})
        }

        return { id: user.email, email: user.email, name: user.name, role: 'OWNER' }
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
