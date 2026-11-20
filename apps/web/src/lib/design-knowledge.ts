// Conhecimento de design de sites que os agentes de web (Pedro) e de qualidade (Renata) recebem.
// Adaptado e traduzido de:
// - anthropics/skills, skill "frontend-design" (Apache License 2.0) — princípios e "sinais de site feito por IA"
// - nextlevelbuilder/ui-ux-pro-max-skill (MIT) — recomendações de padrão de página, paleta e tipografia por segmento

export const DESIGN_PRINCIPLES = [
  "Pense como o diretor de arte de um estúdio que cobra R$ 10 mil por site: cada cliente ganha uma identidade que não pode ser confundida com a de outro. O cliente já recusou propostas com cara de modelo pronto.",
  "Parta do mundo do negócio: o material, o vocabulário, o ambiente e o público dele (ex.: odontologia = porcelana, luz clínica limpa, precisão, sorriso; estética = pele, luz suave, cuidado; academia = energia, suor, movimento). As escolhas visuais saem daí, não de um padrão genérico.",
  "O topo é o que a pessoa vê primeiro: abra com a coisa mais característica do negócio (uma foto forte, uma frase forte). Número grande com rótulo pequeno e gradiente é o padrão genérico: só use se for mesmo a melhor opção.",
  "A tipografia carrega a personalidade. Use uma ou duas famílias, bem diferentes entre si, escolhidas para ESTE negócio.",
  "Ousadia em um lugar só: um elemento memorável (a foto do topo, o título, um bloco de cor), e todo o resto quieto e disciplinado. Antes de entregar, tire um acessório (conselho da Chanel).",
  "Texto é design: escreva do ponto de vista do paciente/cliente, em linguagem simples e específica. O botão diz exatamente o que acontece ('Agendar avaliação pelo WhatsApp', não 'Saiba mais'). Frases curtas, voz ativa, sem enchimento.",
];

// Sinais clássicos de página gerada por IA (evitar, e a revisora reprova se aparecerem)
export const AI_TELLS = [
  "Uma palavra ou trecho do título em outra cor, itálico ou negrito para 'destacar'.",
  "Rótulo pequeno em CAIXA ALTA espaçada em cima de todo título de seção.",
  "Numeração 01 / 02 / 03 em coisas que não são uma sequência (só passos de verdade levam número).",
  "Ícones genéricos (dentinho, estrela, escudo, raio) enfeitando cada cartão; emojis.",
  "Tudo picado em cartões arredondados iguais, com a mesma sombra.",
  "Animação de 'aparecer subindo' em todo bloco; efeito de hover em todo cartão.",
  "Textos com ' · ' juntando palavras ou 'PALAVRA — fragmento'; seta → no fim de botões e links.",
  "Frases genéricas que serviriam para qualquer clínica ('cuidado completo', 'excelência', 'seu sorriso merece').",
];

export interface SegmentPlaybook {
  id: string;
  match: RegExp;
  nome: string;
  mundo: string;
  pagina: string;
  conversao: string;
  estilos: string;
  fontes: string[];
  bancoDeImagens: string[]; // buscas em inglês para o banco de fotos
  fotosIA: Array<{ prompt: string; formato: "paisagem" | "retrato" }>; // fotos criadas por IA: 1 paisagem (topo) + retratos (serviços)
}

export const SEGMENTS: SegmentPlaybook[] = [
  {
    id: "odonto",
    match: /odonto|dent[ai]|implante|ortodon|sorriso|faceta|lente de contato dental|clareamento/i,
    nome: "Odontologia",
    mundo: "porcelana, esmalte, luz clínica limpa, precisão, sorriso natural, confiança para voltar a sorrir; medo de dor e de preço são as barreiras",
    pagina: "Topo com prova social → tratamentos (com foto de pessoa sorrindo, nunca boca de perto) → como é a primeira consulta → dentista responsável → depoimentos reais → dúvidas (dor, preço, convênio, tempo) → localização",
    conversao: "Botão de agendar visível no topo e fixo no celular; responder a dúvida 'dói?' e 'quanto tempo leva?'; mostrar quem é o dentista",
    estilos: "clinico ou aurora (odontologia de alto padrão)",
    fontes: ["porcelana", "precisao", "confianca"],
    bancoDeImagens: ["woman smiling white teeth portrait", "dentist talking with patient", "modern dental clinic interior"],
    fotosIA: [
      { prompt: "A relaxed Brazilian woman in her thirties smiling naturally while seated in a bright, modern minimalist dental office, the dentist softly out of focus in the background, white and {cor} accents", formato: "paisagem" },
      { prompt: "Close portrait of a confident Brazilian man in his forties with a natural healthy smile, soft studio light, neutral background", formato: "retrato" },
      { prompt: "A friendly Brazilian dentist in a clean white coat explaining a treatment plan to a patient using a tablet, modern clinic, warm natural light", formato: "retrato" },
      { prompt: "Elegant modern dental clinic reception with soft daylight, plants, light wood and {cor} details, no people", formato: "retrato" },
    ],
  },
  {
    id: "estetica",
    match: /est[eé]tica|harmoniza|botox|preenchimento|skin|pele|facial|depila|laser|spa|beleza|cosm[eé]t/i,
    nome: "Estética e beleza",
    mundo: "pele, luz suave, toque, cuidado, autoestima, discrição, sofisticação",
    pagina: "Topo com foto de pessoa (não procedimento) → procedimentos → como funciona a avaliação → profissional → depoimentos → dúvidas → localização",
    conversao: "Transmitir segurança e naturalidade; evitar promessa de resultado; agendar avaliação",
    estilos: "aurora ou editorial",
    fontes: ["luxo", "editorial", "porcelana"],
    bancoDeImagens: ["woman glowing skin natural light portrait", "aesthetic clinic facial treatment", "skincare spa calm"],
    fotosIA: [
      { prompt: "A Brazilian woman with naturally glowing skin relaxing in a serene, luxurious aesthetic clinic, soft window light, neutral tones with {cor} accents", formato: "paisagem" },
      { prompt: "Beauty portrait of a Brazilian woman with healthy natural skin, minimal makeup, soft diffused light, calm expression", formato: "retrato" },
      { prompt: "A professional aesthetician gently applying skincare to a client's face in a calm treatment room, soft light", formato: "retrato" },
      { prompt: "Minimalist luxurious treatment room with soft towels, plants and warm light, {cor} details, no people", formato: "retrato" },
    ],
  },
  {
    id: "medico",
    match: /m[eé]dic|cl[ií]nica|dermat|cardio|gineco|pediatr|ortoped|oftalm|endocrino|neuro|urolog/i,
    nome: "Clínica médica",
    mundo: "confiança, escuta, precisão, tecnologia a serviço da pessoa, calma",
    pagina: "Topo com especialidade e cidade → especialidades → como agendar → médicos → convênios/dúvidas → localização",
    conversao: "Clareza sobre especialidade, convênio e como marcar; perfil do médico",
    estilos: "clinico",
    fontes: ["precisao", "confianca", "humanista"],
    bancoDeImagens: ["doctor consultation with patient", "modern medical clinic reception", "doctor smiling portrait"],
    fotosIA: [
      { prompt: "A Brazilian doctor listening attentively to a patient in a bright, modern consultation room, warm natural light, {cor} accents", formato: "paisagem" },
      { prompt: "Portrait of a friendly Brazilian female doctor in a white coat, modern clinic background softly blurred", formato: "retrato" },
      { prompt: "A calm modern clinic waiting area with daylight, plants and comfortable chairs, no people", formato: "retrato" },
      { prompt: "A doctor reviewing results on a tablet with an elderly patient, both smiling, bright clinic", formato: "retrato" },
    ],
  },
  {
    id: "terapias",
    match: /fisioter|pilates|nutri|psic[oó]|terapia|fonoaud|quiropr|acupunt|osteopat/i,
    nome: "Terapias e bem-estar",
    mundo: "movimento, alívio, acolhimento, rotina saudável, escuta",
    pagina: "Topo com a transformação (alívio, saúde) → atendimentos → como é a primeira sessão → profissional → depoimentos → dúvidas → local",
    conversao: "Acolher a dor do cliente; mostrar o profissional; agendar primeira sessão",
    estilos: "editorial ou clinico",
    fontes: ["humanista", "editorial", "confianca"],
    bancoDeImagens: ["physiotherapy session", "healthy lifestyle woman", "calm therapy room"],
    fotosIA: [
      { prompt: "A physiotherapist guiding a smiling Brazilian patient through a gentle exercise in a bright modern studio, {cor} accents", formato: "paisagem" },
      { prompt: "A Brazilian woman stretching calmly in a sunlit studio, healthy and relaxed", formato: "retrato" },
      { prompt: "A therapist and client talking in a calm, warm office with plants and soft light", formato: "retrato" },
      { prompt: "Healthy colorful meal and fresh ingredients on a light table, natural light", formato: "retrato" },
    ],
  },
  {
    id: "fitness",
    match: /academia|fitness|crossfit|treino|personal|muscula|luta|box|funcional|dan[cç]a/i,
    nome: "Fitness e esporte",
    mundo: "energia, suor, movimento, comunidade, resultado com constância",
    pagina: "Topo com energia (foto de treino) → modalidades → planos/aula experimental → estrutura → depoimentos → localização",
    conversao: "Aula experimental grátis; horários; localização",
    estilos: "impacto",
    fontes: ["esporte", "contemporanea"],
    bancoDeImagens: ["gym training athlete", "group fitness class energy", "woman lifting weights gym"],
    fotosIA: [
      { prompt: "Energetic Brazilian athletes training in a modern gym with dramatic lighting, motion and sweat, {cor} accents", formato: "paisagem" },
      { prompt: "A determined Brazilian woman lifting weights in a modern gym, dramatic light", formato: "retrato" },
      { prompt: "A group fitness class full of energy, people smiling and moving, modern gym", formato: "retrato" },
      { prompt: "A personal trainer coaching a client on a squat, focused, gym background", formato: "retrato" },
    ],
  },
  {
    id: "marca-pessoal",
    match: /consultor|mentor|coach|imagem|estilo|moda|influenc|palestr|marca pessoal|personal stylist/i,
    nome: "Marca pessoal e consultoria",
    mundo: "autoridade, presença, estilo, histórias reais, transformação",
    pagina: "Topo com a pessoa (foto forte) e a promessa → para quem é → serviços → trajetória → depoimentos → contato",
    conversao: "Mostrar autoridade e personalidade; um único convite claro para conversar",
    estilos: "editorial ou impacto",
    fontes: ["moda", "editorial", "luxo"],
    bancoDeImagens: ["man tailored suit portrait", "style consultant fashion", "confident professional portrait"],
    fotosIA: [
      { prompt: "A confident Brazilian professional in a tailored outfit in a sophisticated city setting, editorial fashion photography, {cor} accents", formato: "paisagem" },
      { prompt: "Editorial portrait of a stylish Brazilian man in a tailored suit, soft light, neutral background", formato: "retrato" },
      { prompt: "Details of tailored clothing, fabrics and accessories on a clean surface, editorial light", formato: "retrato" },
      { prompt: "A consultant talking with a client in an elegant studio, natural light", formato: "retrato" },
    ],
  },
  {
    id: "juridico",
    match: /advoga|jur[ií]dic|direito|escrit[oó]rio de advocacia/i,
    nome: "Advocacia",
    mundo: "segurança, clareza, discrição, autoridade",
    pagina: "Topo com área de atuação → áreas → como funciona o atendimento → advogados → dúvidas → contato",
    conversao: "Clareza da área e do primeiro contato; discrição",
    estilos: "editorial ou clinico",
    fontes: ["juridico", "confianca"],
    bancoDeImagens: ["lawyer office meeting", "law books desk", "professional consultation office"],
    fotosIA: [
      { prompt: "A Brazilian lawyer in a meeting with clients in an elegant, bright office, calm and trustworthy, {cor} accents", formato: "paisagem" },
      { prompt: "Portrait of a confident Brazilian female lawyer in a modern office", formato: "retrato" },
      { prompt: "Elegant office desk with documents and a pen, warm light, no people", formato: "retrato" },
      { prompt: "Two professionals shaking hands in a modern office", formato: "retrato" },
    ],
  },
];

export const DEFAULT_SEGMENT: SegmentPlaybook = {
  id: "geral",
  match: /.*/,
  nome: "Negócio local",
  mundo: "o que o negócio entrega de diferente, as pessoas por trás, o lugar",
  pagina: "Topo com a promessa → serviços → como funciona → sobre → depoimentos → dúvidas → localização",
  conversao: "Um convite claro e repetido para falar no WhatsApp",
  estilos: "clinico ou editorial",
  fontes: ["contemporanea", "humanista", "confianca"],
  bancoDeImagens: ["small business owner smiling", "customer service friendly", "modern workspace"],
  fotosIA: [
    { prompt: "A Brazilian small business team welcoming a customer in a bright modern space, warm and professional, {cor} accents", formato: "paisagem" },
    { prompt: "Portrait of a smiling Brazilian professional at work, natural light", formato: "retrato" },
    { prompt: "A satisfied customer being attended in a modern business, natural light", formato: "retrato" },
    { prompt: "Clean modern interior of a small business, daylight, no people", formato: "retrato" },
  ],
};

export function segmentFor(text: string): SegmentPlaybook {
  return SEGMENTS.find((s) => s.match.test(text)) ?? DEFAULT_SEGMENT;
}

// Pares de fontes curados (Google Fonts), escolhidos fora dos padrões genéricos
export const FONT_PAIRS: Record<string, { titulo: string; texto: string; url: string; pesoTitulo: number; espaco: string; serif: boolean; descricao: string }> = {
  porcelana: { titulo: "Fraunces", texto: "Figtree", url: "family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Figtree:wght@400;500;600", pesoTitulo: 400, espaco: "-0.02em", serif: true, descricao: "serifa suave e calorosa + sans limpa: saúde premium, acolhedora" },
  precisao: { titulo: "Instrument Sans", texto: "Instrument Sans", url: "family=Instrument+Sans:wght@400;500;600;700", pesoTitulo: 600, espaco: "-0.035em", serif: false, descricao: "grotesca precisa, técnica e elegante: clínica moderna, tecnologia" },
  confianca: { titulo: "Young Serif", texto: "Albert Sans", url: "family=Young+Serif&family=Albert+Sans:wght@400;500;600", pesoTitulo: 400, espaco: "-0.015em", serif: true, descricao: "serifa robusta e amigável: tradição, confiança, família" },
  luxo: { titulo: "Bodoni Moda", texto: "Jost", url: "family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=Jost:wght@400;500", pesoTitulo: 400, espaco: "-0.01em", serif: true, descricao: "Bodoni de alto contraste + geométrica: luxo, beleza, sofisticação" },
  editorial: { titulo: "Newsreader", texto: "Hanken Grotesk", url: "family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Hanken+Grotesk:wght@400;500;600", pesoTitulo: 400, espaco: "-0.02em", serif: true, descricao: "serifa de revista + grotesca humana: autoridade, histórias, marca pessoal" },
  humanista: { titulo: "Familjen Grotesk", texto: "Source Serif 4", url: "family=Familjen+Grotesk:wght@500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500", pesoTitulo: 600, espaco: "-0.03em", serif: false, descricao: "grotesca com personalidade + texto serifado: terapias, acolhimento" },
  contemporanea: { titulo: "Bricolage Grotesque", texto: "Figtree", url: "family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600", pesoTitulo: 700, espaco: "-0.04em", serif: false, descricao: "grotesca expressiva e atual: negócios jovens, criativos" },
  esporte: { titulo: "Barlow Condensed", texto: "Barlow", url: "family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600", pesoTitulo: 800, espaco: "-0.01em", serif: false, descricao: "condensada forte: academia, esporte, energia" },
  moda: { titulo: "Syne", texto: "Manrope", url: "family=Syne:wght@600;700;800&family=Manrope:wght@400;500;600", pesoTitulo: 700, espaco: "-0.03em", serif: false, descricao: "display de moda + sans moderna: estilo, imagem, criativos" },
  juridico: { titulo: "EB Garamond", texto: "Public Sans", url: "family=EB+Garamond:wght@400;500;600&family=Public+Sans:wght@400;500;600", pesoTitulo: 500, espaco: "-0.01em", serif: true, descricao: "Garamond clássica + sans institucional: advocacia, tradição" },
};
