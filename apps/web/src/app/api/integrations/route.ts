import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface IntegrationStatus {
  id: string
  name: string
  type: string
  category: string
  status: 'connected' | 'disconnected' | 'error'
  description: string
  envKey?: string
  // 'live' = connection actually tested; 'env' = only the env var presence was checked
  checked: 'live' | 'env'
  errorMessage?: string
}

async function pingDatabase(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.DATABASE_URL) return { ok: false }
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.split('\n').pop() : String(err) }
  }
}

export async function GET() {
  const db = await pingDatabase()
  const integrations: IntegrationStatus[] = [
    {
      id: 'drael',
      name: 'Drael AI',
      type: 'AI Provider',
      category: 'ai',
      status: process.env.DRAEL_API_KEY ? 'connected' : 'disconnected',
      description: 'Provedor principal de IA para o Root Master e os agentes',
      envKey: 'DRAEL_API_KEY',
      checked: 'env',
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      type: 'AI Provider',
      category: 'ai',
      status: process.env.ANTHROPIC_API_KEY ? 'connected' : 'disconnected',
      description: 'Claude AI como fallback para agentes especializados',
      envKey: 'ANTHROPIC_API_KEY',
      checked: 'env',
    },
    {
      id: 'database',
      name: 'PostgreSQL',
      type: 'Banco de Dados',
      category: 'infrastructure',
      status: db.ok ? 'connected' : db.error ? 'error' : 'disconnected',
      description: 'Banco principal da plataforma LOTUS',
      envKey: 'DATABASE_URL',
      checked: 'live',
      errorMessage: db.error,
    },
    {
      id: 'meta-ads',
      name: 'Meta Ads',
      type: 'Mídia Paga',
      category: 'ads',
      status: process.env.META_ACCESS_TOKEN ? 'connected' : 'disconnected',
      description: 'Facebook Ads & Instagram Ads para campanhas de clientes (nenhum agente usa este token ainda)',
      envKey: 'META_ACCESS_TOKEN',
      checked: 'env',
    },
    {
      id: 'google-ads',
      name: 'Google Ads',
      type: 'Mídia Paga',
      category: 'ads',
      status: process.env.GOOGLE_ADS_API_KEY ? 'connected' : 'disconnected',
      description: 'Google Search & Display para campanhas de clientes (nenhum agente usa esta chave ainda)',
      envKey: 'GOOGLE_ADS_API_KEY',
      checked: 'env',
    },
    {
      id: 'tiktok-ads',
      name: 'TikTok Ads',
      type: 'Mídia Paga',
      category: 'ads',
      status: process.env.TIKTOK_ACCESS_TOKEN ? 'connected' : 'disconnected',
      description: 'TikTok for Business para campanhas de vídeo (nenhum agente usa este token ainda)',
      envKey: 'TIKTOK_ACCESS_TOKEN',
      checked: 'env',
    },
    {
      id: 'ga4',
      name: 'Google Analytics 4',
      type: 'Analytics',
      category: 'analytics',
      status: process.env.GA4_PROPERTY_ID ? 'connected' : 'disconnected',
      description: 'Monitoramento de tráfego e conversões dos clientes (nenhum agente lê o GA4 ainda)',
      envKey: 'GA4_PROPERTY_ID',
      checked: 'env',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      type: 'Comunicação',
      category: 'communication',
      status: process.env.WHATSAPP_TOKEN ? 'connected' : 'disconnected',
      description: 'Envio de mensagens e automação de atendimento',
      envKey: 'WHATSAPP_TOKEN',
      checked: 'env',
    },
  ]

  const connected = integrations.filter((i) => i.status === 'connected').length

  return NextResponse.json({
    integrations,
    summary: { total: integrations.length, connected, disconnected: integrations.length - connected },
  })
}
