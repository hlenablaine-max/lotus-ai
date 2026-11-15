import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface IntegrationStatus {
  id: string
  name: string
  type: string
  category: string
  status: 'connected' | 'disconnected' | 'error'
  description: string
  envKey?: string
}

export async function GET() {
  const integrations: IntegrationStatus[] = [
    {
      id: 'drael',
      name: 'Drael AI',
      type: 'AI Provider',
      category: 'ai',
      status: process.env.DRAEL_API_KEY ? 'connected' : 'disconnected',
      description: 'Provedor principal de IA para o Root Master',
      envKey: 'DRAEL_API_KEY',
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      type: 'AI Provider',
      category: 'ai',
      status: process.env.ANTHROPIC_API_KEY ? 'connected' : 'disconnected',
      description: 'Claude AI como fallback para agentes especializados',
      envKey: 'ANTHROPIC_API_KEY',
    },
    {
      id: 'database',
      name: 'PostgreSQL',
      type: 'Banco de Dados',
      category: 'infrastructure',
      status: process.env.DATABASE_URL ? 'connected' : 'disconnected',
      description: 'Banco principal da plataforma LOTUS',
      envKey: 'DATABASE_URL',
    },
    {
      id: 'meta-ads',
      name: 'Meta Ads',
      type: 'Mídia Paga',
      category: 'ads',
      status: process.env.META_ACCESS_TOKEN ? 'connected' : 'disconnected',
      description: 'Facebook Ads & Instagram Ads para campanhas de clientes',
      envKey: 'META_ACCESS_TOKEN',
    },
    {
      id: 'google-ads',
      name: 'Google Ads',
      type: 'Mídia Paga',
      category: 'ads',
      status: process.env.GOOGLE_ADS_API_KEY ? 'connected' : 'disconnected',
      description: 'Google Search & Display para campanhas de clientes',
      envKey: 'GOOGLE_ADS_API_KEY',
    },
    {
      id: 'tiktok-ads',
      name: 'TikTok Ads',
      type: 'Mídia Paga',
      category: 'ads',
      status: process.env.TIKTOK_ACCESS_TOKEN ? 'connected' : 'disconnected',
      description: 'TikTok for Business para campanhas de vídeo',
      envKey: 'TIKTOK_ACCESS_TOKEN',
    },
    {
      id: 'ga4',
      name: 'Google Analytics 4',
      type: 'Analytics',
      category: 'analytics',
      status: process.env.GA4_PROPERTY_ID ? 'connected' : 'disconnected',
      description: 'Monitoramento de tráfego e conversões dos clientes',
      envKey: 'GA4_PROPERTY_ID',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      type: 'Comunicação',
      category: 'communication',
      status: process.env.WHATSAPP_TOKEN ? 'connected' : 'disconnected',
      description: 'Envio de mensagens e automação de atendimento',
      envKey: 'WHATSAPP_TOKEN',
    },
  ]

  const connected = integrations.filter((i) => i.status === 'connected').length

  return NextResponse.json({
    integrations,
    summary: { total: integrations.length, connected, disconnected: integrations.length - connected },
  })
}
