'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Email ou senha inválidos.')
        setLoading(false)
        return
      }
      // Volta para a página que a pessoa tentou abrir (só caminhos internos do próprio app)
      const target = new URLSearchParams(window.location.search).get('callbackUrl') ?? ''
      let next = '/ceo'
      try {
        const url = new URL(target, window.location.origin)
        if (url.origin === window.location.origin && url.pathname !== '/login') next = url.pathname + url.search
      } catch {
        /* callbackUrl inválido: vai para o início */
      }
      router.push(next)
      router.refresh()
    } catch {
      setError('Não foi possível conectar. Verifique se o LOTUS está aberto e tente de novo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#060614] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-lotus-500/20 border border-lotus-500/30 mb-4">
            <span className="text-3xl">🌸</span>
          </div>
          <h1 className="text-2xl font-bold text-white">LOTUS AI</h1>
          <p className="text-white/40 text-sm mt-1">Acesse seu segundo cérebro</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-lotus-500/50 focus:border-lotus-500/50 transition-colors"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-lotus-500/50 focus:border-lotus-500/50 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-lotus-600 hover:bg-lotus-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-white/45 text-xs mt-8">
          LOTUS AI Enterprise · Acesso restrito
        </p>
      </div>
    </div>
  )
}
