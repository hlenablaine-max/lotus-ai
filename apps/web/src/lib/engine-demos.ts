// Demo fallback data for each engine — used when AI provider is unavailable.
// Data is generated contextually from clientName/niche/city inputs.

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function demoIntelligence(clientName: string, niche: string, city: string) {
  const n = niche || "Odontologia";
  const c = city || "Brasil";
  return {
    _demo: true,
    market: {
      size_description: `Mercado de ${n} em ${c} com forte demanda reprimida por serviços de qualidade. Estimativa de 1.200 buscas mensais no Google pelo nicho na região.`,
      growth_rate: "12-18% ao ano (pós-pandemia)",
      maturity: "crescimento",
      digital_penetration: "68%",
    },
    competitors: [
      { name: `Clínica Central de ${cap(n)}`, type: "direto", strengths: ["Localização central", "Equipe numerosa"], weaknesses: ["Site desatualizado", "Sem presença no Instagram"], digital_presence: "fraca", estimated_market_share: "20%" },
      { name: `${cap(n)} Express`, type: "direto", strengths: ["Preço agressivo", "Horário estendido"], weaknesses: ["Baixa qualidade percebida", "Sem depoimentos"], digital_presence: "média", estimated_market_share: "15%" },
      { name: `Planos de Saúde Conveniados`, type: "indireto", strengths: ["Volume", "Fidelização"], weaknesses: ["Procedimentos limitados", "Sem upsell estético"], digital_presence: "forte", estimated_market_share: "35%" },
    ],
    trends: [
      { trend: "Estética e autoestima digital", impact: "alto", timeframe: "agora", opportunity: "Pacientes buscam tratamentos estéticos motivados por redes sociais — conteúdo de transformação converte bem" },
      { trend: "Agendamento online 24h", impact: "alto", timeframe: "agora", opportunity: "80% dos pacientes preferem agendar pelo WhatsApp ou app — automação aumenta conversão em 3x" },
      { trend: "Reels antes e depois", impact: "médio", timeframe: "6_meses", opportunity: `Vídeos de transformação de ${n.toLowerCase()} têm taxa de engajamento 5x maior que foto estática` },
    ],
    opportunities: [
      { title: "Automação de WhatsApp para captação de leads", description: "Configurar chatbot para qualificar leads 24h e agendar consultas automaticamente. ROI médio de 4x em 90 dias.", effort: "baixo", potential_roi: "R$ 8-12k/mês adicional", priority: 1 },
      { title: "Campanha de implantes no Meta Ads", description: `Públicos semelhantes de pacientes de ${c} interessados em saúde bucal e estética. CPL médio de R$ 35-70.`, effort: "médio", potential_roi: "15-30 leads/mês", priority: 2 },
      { title: "Reativação de base de pacientes inativos", description: "Sequência de WhatsApp para pacientes sem retorno há +6 meses. Taxa de reativação média 25%.", effort: "baixo", potential_roi: "R$ 5-8k/mês", priority: 3 },
    ],
    threats: [
      { threat: "Novas clínicas com marketing digital agressivo", severity: "alta", mitigation: "Diferenciar por prova social e conteúdo educativo de qualidade" },
      { threat: "Plataformas de marketplace de saúde (Doctoralia, etc.)", severity: "média", mitigation: "Construir canal direto forte para reduzir dependência de intermediários" },
    ],
    positioning_recommendation: `${clientName} deve se posicionar como a clínica de referência em ${n.toLowerCase()} de qualidade em ${c} — combinando tecnologia, humanização e resultados comprovados com depoimentos reais.`,
    confidence_score: 82,
  };
}

export function demoInvestigation(clientName: string, niche: string, city: string) {
  return {
    _demo: true,
    digital_presence: {
      website: { exists: true, quality_score: 5, issues: ["Sem botão de agendamento online", "Carregamento lento em mobile", "Sem prova social visível"], positives: ["Domínio próprio", "Informações de contato claras"], seo_score: 4, mobile_friendly: true, load_speed: "médio", has_booking: false, has_whatsapp_button: false },
      instagram: { followers_estimate: "5k-10k", posting_frequency: "semanal", content_quality: "médio", engagement_rate: "médio", bio_optimized: false, has_stories_highlights: true, ad_running: false },
      google_my_business: { claimed: true, reviews_count: 23, average_rating: 4.6, photos_count: 8, responds_to_reviews: false },
      whatsapp_business: { has_catalog: false, automated_messages: false, business_profile_complete: false },
    },
    funnel_analysis: {
      awareness: { score: 5, current_channels: ["Instagram orgânico", "Indicação boca a boca", "Google Maps"], missing_channels: ["Meta Ads", "Google Ads", "YouTube"], assessment: "Dependência excessiva de indicações — sem canal pago escalável" },
      consideration: { score: 4, social_proof_quality: "médio", content_educativo: false, before_after_content: true, assessment: "Falta de conteúdo educativo consistente e depoimentos em vídeo" },
      conversion: { score: 5, cta_clarity: "confuso", booking_friction: "alto", response_time_estimate: "horas", assessment: "Processo de agendamento manual pelo WhatsApp sem automação — perde leads fora do horário" },
    },
    competitive_gaps: [
      { gap: "Agendamento online automatizado", severity: "crítico", opportunity: "Configurar bot de qualificação e agendamento — diferencial competitivo em 80% das clínicas da cidade", quick_win: true },
      { gap: "Depoimentos em vídeo", severity: "alto", opportunity: "3-5 vídeos de pacientes satisfeitos aumentam conversão em 40%", quick_win: true },
      { gap: "Anúncios pagos ativos", severity: "alto", opportunity: "Nenhum concorrente domina o tráfego pago na cidade — janela de oportunidade", quick_win: false },
    ],
    ad_intelligence: { running_ads: false, estimated_ad_spend: "não investe", ad_quality: "não aplicável", ad_types_used: [], ad_recommendations: ["Começar com campanhas de conversão no Meta Ads", "Remarketing para visitantes do site", "Campanha de leads para procedimentos de alto ticket"] },
    reputation_analysis: { overall_sentiment: "positivo", main_complaints: ["Tempo de espera na recepção", "Dificuldade de agendamento"], main_compliments: ["Qualidade do atendimento", "Profissionalismo da equipe"], crisis_risk: "baixo" },
    scores: { overall_digital_score: 5, website_score: 5, social_media_score: 6, conversion_score: 4, reputation_score: 7 },
    quick_wins: [
      { action: "Adicionar link de WhatsApp no Instagram Bio", impact: "alto", effort: "fácil", timeframe: "1 dia", expected_result: "+20% de conversão do perfil" },
      { action: "Configurar resposta automática no WhatsApp Business", impact: "alto", effort: "fácil", timeframe: "1 dia", expected_result: "Zero leads perdidos fora do horário" },
      { action: "Postar 3 depoimentos em vídeo de pacientes", impact: "alto", effort: "médio", timeframe: "1 semana", expected_result: "+40% de confiança de novos visitantes" },
    ],
    summary: `${clientName} tem presença digital funcional mas não otimizada. Principal gargalo: funil de conversão manual e sem automação, perdendo leads fora do horário. Oportunidade imediata em anúncios pagos — a cidade ainda não tem dominante digital no nicho.`,
  };
}

export function demoDiagnosis(clientName: string, niche: string, city: string) {
  return {
    _demo: true,
    opportunity_score: { total: 78, breakdown: { market_potential: 85, digital_gap: 75, competition_weakness: 80, client_readiness: 70, roi_potential: 88 }, classification: "ALTO", urgency: "imediato" },
    critical_findings: [
      { finding: "Zero investimento em tráfego pago enquanto concorrentes ainda não dominam o canal", severity: "crítico", category: "visibilidade", business_impact: "Oportunidade de capturar mercado antes da concorrência se posicionar", recommended_action: "Iniciar campanha Meta Ads em até 7 dias" },
      { finding: "Processo de agendamento 100% manual — perda estimada de 40% dos leads", severity: "crítico", category: "conversão", business_impact: "Estimativa de 8-15 pacientes/mês perdidos fora do horário", recommended_action: "Configurar bot de qualificação no WhatsApp Business" },
      { finding: "Sem sequência de reativação para base de pacientes inativos", severity: "alto", category: "conversão", business_impact: "Base inativa de pacientes com potencial de R$ 5-8k/mês", recommended_action: "Criar sequência de 3 mensagens de reativação" },
    ],
    roi_projection: {
      current_state: { estimated_monthly_revenue: 18000, estimated_new_clients: 6, digital_acquisition_rate: "5%" },
      with_lotus_basic: { investment_monthly: 2000, projected_revenue_6m: 32000, new_clients_monthly: 15, roi_6m: "3x", payback_months: 2 },
      with_lotus_premium: { investment_monthly: 5000, projected_revenue_6m: 65000, new_clients_monthly: 30, roi_6m: "5x", payback_months: 2 },
      assumptions: ["Ticket médio de implante R$ 2.500-4.500", `Mercado de ${city || "interior"} com demanda reprimida`, "Taxa de conversão de 15% sobre leads qualificados"],
    },
    market_position: { current_position: "seguidor", differentiation_gaps: ["Marketing digital ativo", "Automação de atendimento", "Conteúdo educativo consistente"], unique_strengths: ["Reputação local estabelecida", "Equipe qualificada", "Google reviews positivos"], threat_level: "médio", main_threats: ["Novas clínicas com marketing digital agressivo", "Plataformas de marketplace"] },
    digital_maturity: { level: "em desenvolvimento", score: 4, bottlenecks: ["Ausência de automação de atendimento", "Sem campanhas pagas", "Conteúdo sem estratégia de funil"], next_level_requirements: ["Meta Ads ativo", "Bot de qualificação", "CRM básico configurado"] },
    priority_actions: [
      { priority: 1, action: "Configurar automação WhatsApp Business", why: "Captura leads 24h e resolve maior gargalo de conversão", expected_impact: "+8-12 pacientes/mês", timeframe: "30", investment_required: "R$ 0-200" },
      { priority: 2, action: "Iniciar campanha Meta Ads (R$ 1.500-2.000/mês)", why: "Nenhum concorrente domina o canal na cidade — janela de oportunidade", expected_impact: "15-25 leads/mês qualificados", timeframe: "30", investment_required: "R$ 1.500-2.000/mês em mídia" },
      { priority: 3, action: "Produzir 5 reels de transformação (antes/depois)", why: "Conteúdo de alta conversão e baixo custo de produção", expected_impact: "+30% engajamento e confiança", timeframe: "60", investment_required: "R$ 500 produção" },
    ],
    lotus_fit_score: { score: 88, ideal_package: "profissional", fit_reasons: [`Negócio estabelecido em ${city || "cidade de médio porte"}`, "Presença digital iniciada mas não otimizada", "Potencial de escala com marketing digital estruturado"], potential_objections: ["Já tenho pacientes suficientes — resposta: escala e estabilidade", "Já tentei marketing e não funcionou — resposta: foi sem metodologia e funil estruturado"] },
    summary: `${clientName} apresenta score de oportunidade ALTO (78/100) com janela de mercado crítica: nenhum concorrente domina o digital em ${city || "sua cidade"}. Prioridade imediata: automação de WhatsApp + campanha Meta Ads. ROI projetado de 3x em 6 meses com plano básico.`,
  };
}

export function demoStrategy(clientName: string, niche: string, city: string) {
  return {
    _demo: true,
    executive_summary: `${clientName} tem a oportunidade de se tornar a clínica referência digital em ${niche || "odontologia"} em ${city || "sua cidade"} nos próximos 6 meses. A estratégia combina tráfego pago, automação de WhatsApp e conteúdo de prova social para escalar captação de 6 para 25 pacientes/mês.`,
    main_objective: "Tornar-se a clínica #1 em captação digital de ${niche || 'odontologia'} em ${city || 'sua cidade'} em 6 meses",
    target_audience: { primary: `Adultos 28-55 anos em ${city || "sua cidade"} com interesse em estética e saúde bucal, classe B/C`, secondary: "Planos de saúde e convênios para procedimentos de maior volume", pain_points: ["Medo e ansiedade do dentista", "Dificuldade de agendamento nos horários disponíveis", "Desconfiança sobre preços e qualidade"], buying_triggers: ["Dor ou emergência", "Ocasião especial (casamento, formatura)", "Influência social (antes/depois de amigos)"] },
    positioning: { unique_value_proposition: `A única clínica de ${niche || "odontologia"} em ${city || "sua cidade"} que combina tecnologia de ponta com atendimento humanizado e agendamento instantâneo pelo WhatsApp`, differentiators: ["Resposta imediata 24h pelo WhatsApp", "Fotos de antes/depois com consentimento do paciente", "Primeira consulta de avaliação sem custo"], brand_voice: "Acolhedor, profissional, empático — como um dentista de família com tecnologia moderna" },
    channels: [
      { channel: "Instagram", priority: "primário", objective: "Prova social, educação e geração de leads", tactics: ["3x reels/semana", "Stories diários de bastidores", "Campanha de depoimentos mensais"], budget_percentage: 30 },
      { channel: "Meta Ads (Facebook/Instagram)", priority: "primário", objective: "Captação de novos pacientes com CPL abaixo de R$ 50", tactics: ["Campanha de leads para implantes", "Remarketing para visitantes do site", "Lookalike de pacientes atuais"], budget_percentage: 40 },
      { channel: "WhatsApp Business", priority: "primário", objective: "Conversão e retenção com automação", tactics: ["Bot de qualificação e agendamento", "Sequência de boas-vindas", "Reativação de inativos"], budget_percentage: 10 },
      { channel: "Google Meu Negócio", priority: "secundário", objective: "Captura de buscas locais de alta intenção", tactics: ["Responder reviews diariamente", "Fotos novas mensais", "Posts de promoções"], budget_percentage: 5 },
    ],
    content_pillars: [
      { pillar: "Transformação & Resultados", description: "Antes/depois com histórias dos pacientes (com consentimento)", content_types: ["Reels", "Carrossel"], frequency: "semanal" },
      { pillar: "Educação & Prevenção", description: "Dicas de saúde bucal, mitos e verdades, cuidados cotidianos", content_types: ["Carrossel", "Stories"], frequency: "semanal" },
      { pillar: "Bastidores & Humanização", description: "Equipe, equipamentos, dia a dia da clínica", content_types: ["Stories", "Reels curtos"], frequency: "diário" },
      { pillar: "Prova Social", description: "Depoimentos em vídeo, avaliações do Google, conquistas", content_types: ["Reels", "Feed"], frequency: "quinzenal" },
    ],
    quarterly_plan: {
      q1: { focus: "Fundação digital: automação e primeiras campanhas", goals: ["Configurar automação WhatsApp", "Iniciar Meta Ads com R$ 1.500/mês"], actions: ["Setup bot WhatsApp", "Criar criativos de anúncios", "Primeira campanha de leads implantes"] },
      q2: { focus: "Escalar captação e construir prova social", goals: ["20 pacientes novos/mês via digital", "50 depoimentos documentados"], actions: ["Aumentar budget Meta Ads", "Campanha de depoimentos em vídeo", "Google Ads local"] },
      q3: { focus: "Retenção e upsell da base ativa", goals: ["Taxa de retorno de 60%", "Ticket médio +20%"], actions: ["CRM básico configurado", "Programa de indicação", "Email marketing para base"] },
      q4: { focus: "Consolidação como referência digital na cidade", goals: ["#1 no Google Maps da categoria", "100 reviews 5 estrelas"], actions: ["Campanha agressiva de reviews", "Parcerias locais", "Relatório de resultados do ano"] },
    },
    kpis: [
      { metric: "Leads via digital/mês", current: "3-5", target_90d: "20", target_180d: "35", how_to_measure: "CRM ou planilha de origem dos pacientes" },
      { metric: "Custo por Lead (CPL)", current: "não medido", target_90d: "R$ 40-60", target_180d: "R$ 25-40", how_to_measure: "Meta Ads Manager / custo por formulário preenchido" },
      { metric: "Taxa de conversão Lead > Paciente", current: "~15%", target_90d: "20%", target_180d: "30%", how_to_measure: "Leads gerados vs pacientes novos no mês" },
    ],
    quick_wins: [
      { action: "Atualizar bio do Instagram com link de WhatsApp", impact: "alto", effort: "baixo", timeframe: "1 semana" },
      { action: "Configurar resposta automática no WhatsApp Business", impact: "alto", effort: "baixo", timeframe: "1 semana" },
      { action: "Postar 3 vídeos de antes/depois já existentes", impact: "alto", effort: "baixo", timeframe: "2 semanas" },
    ],
    investment_recommendation: { monthly_minimum: 2000, monthly_recommended: 5000, allocation: { ads: 40, content: 25, tools: 10, management: 25 } },
  };
}

export function demoSolutionArch(clientName: string, niche: string, city: string) {
  return {
    _demo: true,
    solution_name: `${clientName} — Ecossistema Digital de Captação`,
    overview: `Solução completa para transformar ${clientName} na clínica de referência digital em ${city || "sua cidade"}. Combinando funil de captação pago, automação WhatsApp 24h e CRM básico para nunca perder um lead.`,
    components: [
      { component: "Landing Page de Alta Conversão", type: "landing_page", description: "Página focada em conversão com depoimentos, antes/depois e CTA direto para WhatsApp", tools: ["WordPress/Elementor", "ou HTML estático"], priority: "crítico", estimated_hours: 8, dependencies: [] },
      { component: "Bot WhatsApp de Qualificação", type: "chatbot", description: "Fluxo automático: boas-vindas → qualificação → agendamento → confirmação", tools: ["ManyChat", "ou Z-API + Typebot"], priority: "crítico", estimated_hours: 4, dependencies: [] },
      { component: "Campanha Meta Ads — Implantes", type: "anúncio", description: "Campanha de leads com 3 conjuntos de anúncios: público frio, retargeting e lookalike", tools: ["Meta Business Suite"], priority: "crítico", estimated_hours: 6, dependencies: ["Landing Page"] },
      { component: "Automação de Follow-up", type: "automação", description: "Sequência de 3 mensagens para leads que não responderam em 24h", tools: ["ManyChat"], priority: "alta", estimated_hours: 2, dependencies: ["Bot WhatsApp"] },
      { component: "Dashboard de Métricas", type: "crm", description: "Planilha ou CRM básico para rastrear origem dos pacientes, CPL e conversão", tools: ["Google Sheets", "ou RD Station CRM Free"], priority: "média", estimated_hours: 2, dependencies: [] },
    ],
    tech_stack: { website: ["WordPress", "Elementor"], ads: ["Meta Business Suite", "Meta Pixel"], crm: ["Google Sheets", "RD Station CRM Free"], automation: ["ManyChat", "Z-API"], analytics: ["Google Analytics 4", "Meta Ads Manager"], communication: ["WhatsApp Business API"] },
    funnel: {
      awareness: { channels: ["Meta Ads (Instagram/Facebook)", "Google Meu Negócio", "Instagram Orgânico"], content_types: ["Reels de transformação", "Depoimentos em vídeo", "Stories de bastidores"], cta: "Agende sua avaliação gratuita" },
      consideration: { assets: ["Landing page com antes/depois", "Depoimentos em vídeo", "Fotos da equipe e clínica"], nurturing: "Sequência WhatsApp de 3 dias para leads não convertidos" },
      conversion: { mechanism: "Agendamento via WhatsApp bot + confirmação humana para procedimentos de alto ticket", offer: "Avaliação gratuita sem compromisso" },
      retention: { strategy: "Mensagem de aniversário + reativação a cada 6 meses + programa de indicação com desconto" },
    },
    automations: [
      { name: "Boas-vindas Lead Novo", trigger: "Novo contato via link do Instagram ou anúncio", action: "Mensagem de boas-vindas + qualificação em 3 perguntas + agenda consulta", tool: "ManyChat", impact: "Captura 100% dos leads 24h/dia" },
      { name: "Follow-up Lead Frio", trigger: "Lead sem resposta após 24h", action: "Mensagem de seguimento com depoimento em vídeo", tool: "ManyChat", impact: "+20% de reativação de leads frios" },
      { name: "Lembrete de Consulta", trigger: "24h antes do agendamento", action: "Mensagem de confirmação com endereço e link de localização", tool: "WhatsApp Business", impact: "Redução de no-show de 40% para 15%" },
    ],
    implementation_phases: [
      { phase: 1, name: "Fundação (Semana 1-2)", duration: "2 semanas", deliverables: ["Landing page publicada", "Bot WhatsApp ativo", "Meta Pixel instalado"], resources_needed: ["Acesso ao Instagram", "Número WhatsApp Business"] },
      { phase: 2, name: "Captação (Semana 3-4)", duration: "2 semanas", deliverables: ["Campanha Meta Ads ativa", "Primeiros 20 leads", "Dashboard configurado"], resources_needed: ["Budget de R$ 1.500/mês para ads"] },
      { phase: 3, name: "Otimização (Mês 2)", duration: "4 semanas", deliverables: ["Taxa de conversão +20%", "CPL abaixo de R$ 50", "Relatório de métricas"], resources_needed: ["Criativos novos de anúncios"] },
    ],
    total_implementation_time: "4-6 semanas",
    monthly_cost_estimate: { tools: 300, ads: 2000, management: 1500, total: 3800 },
    expected_outcomes: { leads_per_month: 40, conversion_rate: "20%", new_clients_per_month: 8, roi_estimate: "3.5x em 6 meses" },
  };
}

export function demoBuild(clientName: string, type: string, niche: string, whatsapp: string) {
  if (type === "landing_page") {
    const wa = whatsapp || "75920001249";
    const waLink = `https://wa.me/55${wa.replace(/\D/g, "")}`;
    return {
      _demo: true,
      type: "landing_page",
      html: `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${clientName} — Sorria com Confiança</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#0a0a0a;color:#fff}.hero{background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);min-height:90vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem}.hero h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:800;margin-bottom:1rem;line-height:1.2}.hero h1 span{color:#00d4ff}.hero p{font-size:1.2rem;opacity:.85;max-width:600px;margin:0 auto 2rem}.btn{display:inline-block;background:#25D366;color:#fff;padding:1rem 2.5rem;border-radius:50px;text-decoration:none;font-size:1.1rem;font-weight:700;transition:.3s}.btn:hover{transform:scale(1.05);background:#128C7E}.section{padding:5rem 2rem;max-width:1100px;margin:0 auto}.section h2{text-align:center;font-size:2.2rem;margin-bottom:3rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2rem}.card{background:#1a1a2e;padding:2rem;border-radius:16px;border:1px solid #0f3460}.card .icon{font-size:2.5rem;margin-bottom:1rem}.card h3{font-size:1.3rem;margin-bottom:.5rem;color:#00d4ff}.testimonials{background:#111;padding:5rem 2rem}.t-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2rem;max-width:1100px;margin:0 auto}.t-card{background:#1a1a2e;padding:2rem;border-radius:16px}.t-card .stars{color:#FFD700;font-size:1.5rem;margin-bottom:1rem}.t-card p{opacity:.85;line-height:1.6}.t-card .name{margin-top:1rem;font-weight:700;color:#00d4ff}.footer{background:#000;padding:3rem 2rem;text-align:center;opacity:.7}.wa-float{position:fixed;bottom:2rem;right:2rem;background:#25D366;color:#fff;border-radius:50%;width:60px;height:60px;display:flex;align-items:center;justify-content:center;font-size:1.8rem;text-decoration:none;box-shadow:0 4px 20px rgba(37,211,102,.5);z-index:999;animation:pulse 2s infinite}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}</style></head><body><section class="hero"><div><h1>Transforme seu <span>sorriso</span><br>em ${clientName}</h1><p>Especialistas em Implantes, Estética e Reabilitação Oral. Avaliação gratuita sem compromisso.</p><a href="${waLink}?text=Olá! Vi no Instagram e gostaria de agendar uma avaliação gratuita." class="btn">📱 Agendar pelo WhatsApp</a></div></section><div class="section"><h2>Por que nos escolher?</h2><div class="grid"><div class="card"><div class="icon">🏆</div><h3>Excelência Técnica</h3><p>Equipe especializada com formação continuada e equipamentos de última geração.</p></div><div class="card"><div class="icon">❤️</div><h3>Atendimento Humanizado</h3><p>Cada paciente é único. Ouvimos, entendemos e cuidamos com atenção e carinho.</p></div><div class="card"><div class="icon">⚡</div><h3>Resposta Imediata</h3><p>Atendimento pelo WhatsApp com resposta em minutos. Agende a qualquer hora.</p></div></div></div><div class="testimonials"><div class="t-grid"><div class="t-card"><div class="stars">⭐⭐⭐⭐⭐</div><p>"Fiz meu implante e estou amando o resultado. A equipe foi incrível do início ao fim."</p><div class="name">— Maria S., 42 anos</div></div><div class="t-card"><div class="stars">⭐⭐⭐⭐⭐</div><p>"Tinha muito medo de dentista mas aqui me senti à vontade. Resultado incrível!"</p><div class="name">— João P., 38 anos</div></div><div class="t-card"><div class="stars">⭐⭐⭐⭐⭐</div><p>"Fiz o clareamento e todos comentaram como meu sorriso ficou bonito. Recomendo!"</p><div class="name">— Ana R., 29 anos</div></div></div></div><div class="section" style="text-align:center"><h2>Pronto para transformar seu sorriso?</h2><p style="margin-bottom:2rem;opacity:.8">Avaliação gratuita • Sem compromisso • Resposta imediata</p><a href="${waLink}" class="btn">💬 Falar com especialista agora</a></div><footer class="footer"><p>${clientName} · ${niche || "Odontologia"} · Contato: ${whatsapp || "75920001249"}</p></footer><a href="${waLink}" class="wa-float" title="WhatsApp">💬</a></body></html>`,
    };
  }
  if (type === "copy") {
    const wa = whatsapp || "75920001249";
    return {
      _demo: true,
      headline_principal: `Sorria com Confiança em ${clientName}`,
      subheadline: "Implantes, Estética e Reabilitação Oral com tecnologia e atendimento humanizado",
      ad_copies: [
        { format: "carrossel", headline: "Transformações reais de pacientes", body: `Veja como ${clientName} mudou vidas com implantes e estética dental. Avaliação GRATUITA para novos pacientes.`, cta: "Agendar Avaliação", emoji_hook: "😁 Seu sorriso merece o melhor" },
        { format: "reels", headline: "Antes e Depois Impressionante", body: "Em poucos meses, resultado que você não acredita. Veja o processo completo 👇", cta: "Me Chama no WhatsApp", emoji_hook: "✨ Transformação real" },
        { format: "stories", headline: "Avaliação GRATUITA hoje!", body: `Vagas limitadas! ${clientName} está com agenda aberta para novas avaliações. Sem compromisso.`, cta: "Swipe Up → WhatsApp", emoji_hook: "🦷 Hoje mesmo!" },
      ],
      whatsapp_scripts: [
        { type: "boas_vindas", message: `Olá! Bem-vindo(a) à ${clientName} 😊\n\nVi que você entrou em contato conosco!\n\nPara te atender da melhor forma, pode me dizer:\n👉 Qual é o seu interesse? (Implante, clareamento, aparelho, consulta de rotina)\n\nAssim posso já te informar disponibilidade e preços 🦷`, timing: "Imediato ao primeiro contato" },
        { type: "follow_up", message: `Oi! Tudo bem? 😊\n\nVi que você entrou em contato com a ${clientName} mas não conseguimos conversar.\n\nAinda tem interesse em agendar sua avaliação gratuita?\n\nTemos horários disponíveis essa semana! 🗓️`, timing: "24h após contato sem resposta" },
      ],
      email_sequences: [],
      content_ideas: [
        { format: "reels", hook: "Você sabe por que implante vale mais do que prótese?", script: "Comparação visual rápida mostrando durabilidade, estética e custo-benefício do implante vs prótese convencional", caption: `Tire sua dúvida com os especialistas da ${clientName}! 🦷✨ Avaliação gratuita — clique no link da bio` },
        { format: "carrossel", hook: "5 sinais que você PRECISA de uma avaliação odontológica", script: "Slide 1: Dor ao morder. Slide 2: Dente mole. Slide 3: Sangramento na gengiva. Slide 4: Mau hálito persistente. Slide 5: Dente sensível. Slide final: CTA agendamento", caption: `Se você tem algum desses sinais, não espere! Agende sua avaliação GRATUITA 👉 link na bio` },
      ],
      usp: `A única clínica que garante resposta em menos de 1h e avaliação gratuita sem compromisso em ${niche || "odontologia"} completa`,
    };
  }
  // whatsapp_automation
  return {
    _demo: true,
    welcome_flow: {
      trigger: "Olá, oi, bom dia, boa tarde, boa noite",
      messages: [
        { step: 1, message: `Olá! Bem-vindo(a) à ${clientName} 😊\n\nSou o assistente virtual da clínica! Para te ajudar melhor, me conta: o que você está buscando?\n\n1️⃣ Implante dental\n2️⃣ Estética (clareamento/lentes)\n3️⃣ Aparelho ortodôntico\n4️⃣ Consulta de rotina / urgência\n5️⃣ Outros`, options: ["1", "2", "3", "4", "5"], delay_seconds: 1 },
        { step: 2, message: "Ótima escolha! 🌟 Para que eu possa te ajudar, me diz seu nome e em qual cidade você mora?", options: [], delay_seconds: 2 },
        { step: 3, message: "Perfeito! Já vou verificar nossa agenda 🗓️\n\nVocê prefere:\n1️⃣ Manhã (8h às 12h)\n2️⃣ Tarde (13h às 18h)\n3️⃣ Qualquer horário disponível", options: ["1", "2", "3"], delay_seconds: 1 },
      ],
    },
    qualification_flow: {
      questions: [
        { question: "Já realizou algum tratamento odontológico nos últimos 2 anos?", type: "múltipla_escolha", options: ["Sim", "Não"], purpose: "Qualificar nível de urgência" },
        { question: "Está com alguma dor ou desconforto no momento?", type: "múltipla_escolha", options: ["Sim, dor forte", "Dor leve", "Não"], purpose: "Priorizar urgências" },
      ],
      scoring_criteria: "Dor forte = prioridade máxima (transferir para humano imediatamente). Interesse em implante/estética = lead quente.",
    },
    appointment_flow: {
      steps: ["Verificar disponibilidade de agenda", "Confirmar dados do paciente (nome, telefone)", "Enviar data e horário para confirmação", "Enviar confirmação com endereço da clínica"],
      confirmation_message: `✅ Consulta confirmada!\n\n📅 Data: [DIA] às [HORA]\n📍 Endereço: [ENDEREÇO DA CLÍNICA]\n\nEm caso de dúvidas, responda aqui.\n\nAté logo! 😊 — Equipe ${clientName}`,
      reminder_messages: [`Oi [NOME]! Lembrando da sua consulta AMANHÃ às [HORA] na ${clientName} 😊 Confirma sua presença?`, `[NOME], sua consulta é em 2 HORAS! Estamos te esperando 🦷 — ${clientName}`],
    },
    follow_up_sequences: [
      { name: "Lead Frio (sem resposta 24h)", messages: [{ day: 1, time: "10:00", message: `Oi! 😊 Tudo bem? Vi que você entrou em contato com a ${clientName}. Podemos te ajudar com a avaliação gratuita? Temos horários essa semana!` }, { day: 3, time: "14:00", message: "Oi! Passando pra saber se posso te ajudar com alguma informação sobre nossos tratamentos. Sem compromisso! 😊" }] },
    ],
    objection_handlers: [
      { objection: "Está muito caro", response: "Entendo sua preocupação! Temos opções de parcelamento em até 12x sem juros. Que tal agendar uma avaliação gratuita primeiro para ver exatamente o que você precisa? 😊" },
      { objection: "Vou pensar", response: "Claro! Para te ajudar a decidir, posso te enviar alguns cases de pacientes que fizeram o mesmo procedimento. Assim você tem mais informações! 🌟" },
    ],
    setup_instructions: "1. Acesse app.manychat.com → criar conta gratuita → conectar número WhatsApp Business. 2. Criar flow: Flow Builder → New Flow → importar as mensagens acima. 3. Testar com número próprio antes de ativar.",
  };
}

export function demoImplementation(clientName: string, niche: string) {
  return {
    _demo: true,
    implementation_plan: {
      title: `Plano de Implementação — ${clientName}`,
      overview: `Setup completo do ecossistema digital em 4 semanas. Foco em ferramentas práticas para PMEs de ${niche || "saúde"}.`,
      total_duration: "4 semanas",
      prerequisites: ["Conta no Facebook/Instagram criada e verificada", "Número WhatsApp Business separado do pessoal", "Fotos e vídeos de alta qualidade da clínica e equipe"],
    },
    setup_guides: [
      { tool: "Meta Business Suite", category: "ads", purpose: "Gestão de campanhas no Facebook e Instagram", steps: [{ step: 1, action: "Criar conta no Meta Business Suite", url_or_location: "business.facebook.com", details: "Use o email da clínica, não o pessoal", screenshot_tip: "Botão 'Criar conta' azul no canto superior direito" }, { step: 2, action: "Adicionar sua Página do Instagram e Facebook", url_or_location: "Configurações > Contas", details: "Conectar ambas as redes para gerenciar em um só lugar", screenshot_tip: "Menu lateral > Configurações > Instagram > Adicionar conta" }, { step: 3, action: "Instalar o Meta Pixel no site", url_or_location: "Gerenciador de Eventos > Adicionar fonte de dados", details: "Copiar código do pixel e colar no <head> do site", screenshot_tip: "Código começa com '!function(f,b,e'" }], estimated_time: "2 horas", cost: "gratuito", difficulty: "médio" },
      { tool: "ManyChat", category: "automation", purpose: "Bot de qualificação e automação de WhatsApp", steps: [{ step: 1, action: "Criar conta gratuita no ManyChat", url_or_location: "manychat.com", details: "Plano gratuito suporta até 1.000 contatos", screenshot_tip: "Botão 'Get Started Free' verde" }, { step: 2, action: "Conectar número WhatsApp Business", url_or_location: "Channels > WhatsApp", details: "Precisa do WhatsApp Business com número dedicado", screenshot_tip: "Aba 'WhatsApp' no menu Channels" }, { step: 3, action: "Criar primeiro fluxo de boas-vindas", url_or_location: "Flow Builder > New Flow", details: "Usar template de agendamento ou criar do zero", screenshot_tip: "Arrastar blocos de mensagem para a tela" }], estimated_time: "3 horas", cost: "gratuito até 1k contatos / R$ 110/mês acima", difficulty: "médio" },
      { tool: "Google Analytics 4", category: "analytics", purpose: "Rastrear visitas ao site e comportamento dos usuários", steps: [{ step: 1, action: "Criar propriedade GA4", url_or_location: "analytics.google.com", details: "Usar email da clínica, criar nova propriedade", screenshot_tip: "Engrenagem de configurações no rodapé" }, { step: 2, action: "Instalar tag no site", url_or_location: "Admin > Fluxos de dados > Adicionar fluxo", details: "Tag ID começa com G-", screenshot_tip: "Copiar o 'ID de mensuração'" }], estimated_time: "1 hora", cost: "gratuito", difficulty: "fácil" },
    ],
    meta_ads_setup: {
      pixel_installation: { steps: ["Acessar Meta Business Suite > Gerenciador de Eventos", "Criar novo pixel com nome da clínica", "Instalar via código ou integração com WordPress"], verification: "Instalar extensão Meta Pixel Helper no Chrome e acessar seu site — deve aparecer verde" },
      first_campaign: { objective: "conversão", audience: `Mulheres e homens 25-55 anos em ${niche || "sua cidade"} + 20km, interessados em saúde e beleza`, budget: "R$ 50-70/dia", creative_specs: "Imagem 1080x1080px ou vídeo 9:16 até 60s, sem muito texto", ad_copy_template: `Sorria com confiança! 😁 Avaliação GRATUITA em ${clientName}. Sem compromisso. Vagas limitadas esta semana → Clique e agende agora!` },
      tracking_setup: "Criar evento personalizado 'Contato_WhatsApp' para rastrear cliques no botão do WhatsApp",
    },
    whatsapp_integration: { tool: "ManyChat", setup_steps: ["Criar conta ManyChat gratuita", "Conectar WhatsApp Business API", "Importar fluxo de boas-vindas", "Testar com número próprio"], first_automation: "Fluxo de boas-vindas com qualificação em 3 perguntas e direcionamento para agendamento", api_config: "Para Z-API: acessar z-api.io > criar instância > escanear QR Code do WhatsApp Business" },
    analytics_setup: { google_analytics: { property_creation: "analytics.google.com > Administrador > Criar propriedade", key_events: ["Contato_WhatsApp", "Visualizou_servicos", "Clicou_CTA"], dashboard_setup: "Importar template de dashboard de saúde disponível na Google Analytics Gallery" }, meta_analytics: { metrics_to_track: ["CPL (Custo por Lead)", "CTR (Taxa de clique)", "Conversas iniciadas", "Custo por conversa"] } },
    week_by_week: [
      { week: 1, tasks: [{ day: "segunda", task: "Setup Meta Business Suite + Pixel", time_needed: "2 horas", responsible: "agência", deliverable: "Conta configurada e pixel ativo" }, { day: "quarta", task: "Criar Landing Page", time_needed: "4 horas", responsible: "agência", deliverable: "LP publicada com CTAs de WhatsApp" }, { day: "sexta", task: "Configurar ManyChat Bot", time_needed: "3 horas", responsible: "agência", deliverable: "Bot de boas-vindas funcionando" }] },
      { week: 2, tasks: [{ day: "segunda", task: "Criar criativos de anúncios (5 variações)", time_needed: "4 horas", responsible: "agência", deliverable: "5 imagens/vídeos prontos" }, { day: "quarta", task: "Publicar primeira campanha Meta Ads", time_needed: "2 horas", responsible: "agência", deliverable: "Campanha ativa com budget R$ 50/dia" }, { day: "sexta", task: "Configurar Google Analytics 4", time_needed: "1 hora", responsible: "agência", deliverable: "GA4 rastreando acessos" }] },
    ],
    checkpoints: [{ week: 2, milestone: "Ecossistema digital no ar", success_criteria: ["Pixel disparando corretamente", "Bot WhatsApp respondendo", "Campanha ativa com primeiros cliques"], metrics_to_check: ["CPM abaixo de R$ 15", "CTR acima de 1,5%"] }],
    troubleshooting: [{ problem: "Pixel não está disparando", cause: "Tag instalada incorretamente ou bloqueada por plugin de cache", solution: "1. Instalar Meta Pixel Helper no Chrome. 2. Verificar se tag está no <head>. 3. Limpar cache do site." }, { problem: "ManyChat não recebe mensagens do WhatsApp", cause: "Número não verificado ou QR Code expirou", solution: "1. Desconectar e reconectar número no ManyChat. 2. Escanear novo QR Code. 3. Aguardar 5 min para sincronizar." }],
  };
}

export function demoRevenue(clientName: string, niche: string, city: string) {
  return {
    _demo: true,
    current_state: { estimated_monthly_revenue: 18000, estimated_new_clients_per_month: 6, average_ticket: 3000, digital_revenue_percentage: 10, top_service_by_revenue: "Implantes dentais", churn_rate_estimate: "8% ao mês" },
    benchmarks: { industry: niche || "Odontologia", city_tier: "interior_medio", average_revenue_similar_business: 22000, top_quartile_revenue: 75000, digital_acquisition_cost: 120, lifetime_value_estimate: 9500, conversion_rate_benchmark: "18%" },
    revenue_projections: {
      without_marketing: { month_3: 18500, month_6: 19500, month_12: 21000, growth_rate: "8% ao ano (orgânico por indicação)" },
      with_lotus_basic: { investment: 2000, month_3: 26000, month_6: 38000, month_12: 58000, new_clients_monthly: 15, roi: "3.5x" },
      with_lotus_full: { investment: 5000, month_3: 35000, month_6: 65000, month_12: 110000, new_clients_monthly: 30, roi: "5.5x" },
    },
    revenue_opportunities: [
      { opportunity: "Reativação de pacientes inativos (últimos 6 meses)", current_revenue: 0, potential_additional_revenue: 6000, implementation_difficulty: "fácil", timeframe: "30", strategy: "Sequência de 3 mensagens WhatsApp com oferta de retorno + promoção de clareamento" },
      { opportunity: "Upsell de estética para pacientes de rotina", current_revenue: 1000, potential_additional_revenue: 4000, implementation_difficulty: "fácil", timeframe: "60", strategy: "Oferecer avaliação de lentes de resina ou clareamento após consulta de rotina" },
      { opportunity: "Campanha de implantes para indicados", current_revenue: 2000, potential_additional_revenue: 8000, implementation_difficulty: "médio", timeframe: "60", strategy: "Programa de indicação: desconto de R$ 200 para quem indicar paciente que fecha implante" },
    ],
    pricing_analysis: {
      current_pricing_assessment: "na_média",
      recommended_adjustments: [{ service: "Implante unitário", current_price_estimate: 3200, recommended_price: 3800, justification: "Com marketing de qualidade e prova social, o mercado aceita preços 15-20% acima da média" }, { service: "Clareamento a laser", current_price_estimate: 800, recommended_price: 950, justification: "Percepção de valor aumenta com landing page e depoimentos" }],
      upsell_opportunities: [{ trigger: "Paciente vem para limpeza", upsell: "Oferecer clareamento + manutenção mensal", additional_revenue: 950 }, { trigger: "Implante finalizado", upsell: "Protocolo de manutenção semestral R$ 350", additional_revenue: 700 }],
    },
    kpis_to_track: [
      { kpi: "Novos pacientes/mês via digital", current: "1-2", target_90d: "12-15", target_180d: "20-25", how_to_track: "Perguntar origem no primeiro contato + planilha de CRM", action_if_below: "Revisar criativos de anúncios e aumentar budget" },
      { kpi: "Taxa de conversão Lead > Consulta", current: "15%", target_90d: "25%", target_180d: "35%", how_to_track: "Leads gerados / consultas realizadas", action_if_below: "Revisar fluxo de WhatsApp e reduzir atrito no agendamento" },
      { kpi: "Ticket médio mensal", current: "R$ 3.000", target_90d: "R$ 3.500", target_180d: "R$ 4.200", how_to_track: "Faturamento total / número de pacientes", action_if_below: "Intensificar estratégia de upsell pós-consulta" },
    ],
    monthly_dashboard: { must_track_metrics: ["Novos pacientes (origem: digital vs indicação)", "Custo por Lead (CPL)", "Taxa de conversão Lead > Paciente", "Ticket médio", "Faturamento total"], review_frequency: "quinzenal", decision_points: ["Se CPL > R$ 80 por 2 semanas → revisar criativos", "Se conversão < 15% → revisar bot WhatsApp", "Se crescimento > 25% → escalar budget de ads"] },
    summary: `${clientName} tem potencial de triplicar faturamento em 12 meses com marketing digital estruturado. Principal alavanca: captação digital com Meta Ads + automação WhatsApp. Projeção conservadora de R$ 58k/mês com investimento básico de R$ 2k/mês.`,
  };
}
