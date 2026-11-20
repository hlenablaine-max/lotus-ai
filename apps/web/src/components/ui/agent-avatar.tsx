// Retrato ilustrado de cada agente da LOTUS: rosto, cabelo e roupa social (blazer e camisa).
// Desenho vetorial (SVG): fica nítido em qualquer tamanho e não depende de internet.

type Hair = "curto" | "lateral" | "longo" | "coque" | "cacheado" | "raspado" | "rabo" | "chanel" | "penteado" | "grisalho";

interface Look {
  pele: string;
  cabelo: Hair;
  corCabelo: string;
  blazer: string;
  gravata?: string; // sem gravata = camisa aberta / blusa
  oculos?: boolean;
  barba?: boolean;
  fundo: string;
}

const PELE = { clara: "#f2cfb3", media: "#d9a882", morena: "#b97f58", escura: "#8a5a3c", negra: "#6b4430" };

const LOOKS: Record<string, Look> = {
  "marcus-andrade": { pele: PELE.media, cabelo: "curto", corCabelo: "#2b1d16", blazer: "#1e2a44", gravata: "#7c2d3a", barba: true, fundo: "#3b82f6" },
  "gabriel-matos": { pele: PELE.clara, cabelo: "lateral", corCabelo: "#5a3b22", blazer: "#2f3542", oculos: true, fundo: "#0ea5e9" },
  "isabela-rocha": { pele: PELE.media, cabelo: "longo", corCabelo: "#2a1a12", blazer: "#6b1f2f", fundo: "#14b8a6" },
  "fernanda-lopes": { pele: PELE.clara, cabelo: "coque", corCabelo: "#6b4226", blazer: "#16181d", fundo: "#06b6d4" },
  "aurora-mendes": { pele: PELE.negra, cabelo: "cacheado", corCabelo: "#1a110c", blazer: "#3b1f5c", fundo: "#a855f7" },
  "beatriz-carvalho": { pele: PELE.clara, cabelo: "longo", corCabelo: "#c9a15b", blazer: "#b9a58a", fundo: "#f59e0b" },
  "rafael-nunes": { pele: PELE.morena, cabelo: "cacheado", corCabelo: "#1f140e", blazer: "#3f4a32", fundo: "#f97316" },
  "carla-monteiro": { pele: PELE.morena, cabelo: "rabo", corCabelo: "#1b120d", blazer: "#a33a62", fundo: "#ec4899" },
  "camila-dias": { pele: PELE.clara, cabelo: "chanel", corCabelo: "#8a3b1e", blazer: "#141414", oculos: true, fundo: "#d946ef" },
  "ana-souza": { pele: PELE.escura, cabelo: "coque", corCabelo: "#140d09", blazer: "#134e4a", oculos: true, fundo: "#6366f1" },
  "lotus-ai-ceo": { pele: PELE.clara, cabelo: "grisalho", corCabelo: "#b8b8b8", blazer: "#111318", gravata: "#ff33bb", fundo: "#ff33bb" },
  "julia-ferreira": { pele: PELE.clara, cabelo: "longo", corCabelo: "#4a2e1c", blazer: "#1e3a5f", fundo: "#10b981" },
  "renata-fonseca": { pele: PELE.media, cabelo: "chanel", corCabelo: "#1c1310", blazer: "#4b5260", oculos: true, fundo: "#22c55e" },
  "lucas-rodrigues": { pele: PELE.clara, cabelo: "raspado", corCabelo: "#4a3324", blazer: "#1d4ed8", gravata: "#0f172a", barba: true, fundo: "#84cc16" },
  "luna-root-master": { pele: PELE.clara, cabelo: "longo", corCabelo: "#c7c2e8", blazer: "#4c1d95", fundo: "#8b5cf6" },
  "thiago-martins": { pele: PELE.negra, cabelo: "raspado", corCabelo: "#120c08", blazer: "#1e293b", fundo: "#f97316" },
  "rodrigo-vasconcelos": { pele: PELE.media, cabelo: "lateral", corCabelo: "#16100c", blazer: "#2d3138", gravata: "#1e3a8a", oculos: true, fundo: "#fb923c" },
  "rodrigo-castro": { pele: PELE.clara, cabelo: "curto", corCabelo: "#5b3a24", blazer: "#1b2a4a", gravata: "#991b1b", barba: true, fundo: "#ea580c" },
  "eduardo-ferraz": { pele: PELE.media, cabelo: "penteado", corCabelo: "#120d0a", blazer: "#0b0b0d", gravata: "#b91c1c", fundo: "#f43f5e" },
  "dr-henrique-vieira": { pele: PELE.clara, cabelo: "grisalho", corCabelo: "#9ca3af", blazer: "#1f2d4d", gravata: "#0e7490", oculos: true, fundo: "#14b8a6" },
  "felipe-costa": { pele: PELE.media, cabelo: "lateral", corCabelo: "#3b2617", blazer: "#3f4652", gravata: "#1e40af", fundo: "#2dd4bf" },
  "pedro-alves": { pele: PELE.clara, cabelo: "cacheado", corCabelo: "#5c3a21", blazer: "#2a2e35", oculos: true, fundo: "#22d3ee" },
};

// Os agentes aparecem pelo id do banco (agent-web), pelo slug (pedro-alves) ou só pelo nome
const ID_TO_SLUG: Record<string, string> = {
  "agent-lotus-ceo": "lotus-ai-ceo", "agent-copy2": "rafael-nunes", "agent-ceo": "aurora-mendes", "agent-bto-head": "fernanda-lopes",
  "agent-creative": "camila-dias", "agent-root": "luna-root-master", "agent-sales": "rodrigo-castro", "agent-perf": "lucas-rodrigues",
  "agent-web": "pedro-alves", "agent-data": "ana-souza", "agent-copy1": "beatriz-carvalho", "agent-bi": "marcus-andrade",
  "agent-sales-intel": "rodrigo-vasconcelos", "agent-social": "carla-monteiro", "agent-auditor": "renata-fonseca", "agent-crm": "isabela-rocha",
  "agent-sdr": "thiago-martins", "agent-closer": "eduardo-ferraz", "agent-healthcare": "dr-henrique-vieira", "agent-bto-arch": "gabriel-matos",
  "agent-strat": "felipe-costa", "agent-mc": "julia-ferreira",
};
const NAME_TO_SLUG: Record<string, string> = {
  "marcos andrade": "marcus-andrade", "gabriel matos": "gabriel-matos", "isabela rocha": "isabela-rocha", "fernanda lopes": "fernanda-lopes",
  "aurora mendes": "aurora-mendes", "beatriz carvalho": "beatriz-carvalho", "rafael nunes": "rafael-nunes", "carla monteiro": "carla-monteiro",
  "camila dias": "camila-dias", "ana souza": "ana-souza", "lotus ai": "lotus-ai-ceo", "julia ferreira": "julia-ferreira",
  "renata fonseca": "renata-fonseca", "lucas rodrigues": "lucas-rodrigues", luna: "luna-root-master", "thiago martins": "thiago-martins",
  "rodrigo vasconcelos": "rodrigo-vasconcelos", "rodrigo castro": "rodrigo-castro", "eduardo ferraz": "eduardo-ferraz",
  "henrique vieira": "dr-henrique-vieira", "felipe costa": "felipe-costa", "pedro alves": "pedro-alves",
};

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

// Agente novo (sem retrato definido): aparência montada a partir do nome, sempre de roupa social
function lookFor(slug: string | undefined, name: string): Look {
  if (slug && LOOKS[slug]) return LOOKS[slug];
  if (slug && ID_TO_SLUG[slug]) return LOOKS[ID_TO_SLUG[slug]];
  const norm = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^dr\.?\s+/, "").trim();
  const bySlug = NAME_TO_SLUG[norm.split(/\s+/).slice(0, 2).join(" ")] ?? NAME_TO_SLUG[norm.split(/\s+/)[0]];
  if (bySlug) return LOOKS[bySlug];
  const h = hash(name);
  const peles = Object.values(PELE);
  const cabelos: Hair[] = ["curto", "lateral", "longo", "coque", "cacheado", "raspado", "chanel"];
  const cores = ["#1b120d", "#3b2617", "#6b4226", "#a0703c", "#2a1a12"];
  const blazers = ["#1e2a44", "#16181d", "#2f3542", "#3f4652", "#1b2a4a"];
  const fundos = ["#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1"];
  return {
    pele: peles[h % peles.length],
    cabelo: cabelos[(h >> 3) % cabelos.length],
    corCabelo: cores[(h >> 6) % cores.length],
    blazer: blazers[(h >> 9) % blazers.length],
    gravata: (h >> 12) % 2 ? "#7c2d3a" : undefined,
    oculos: (h >> 14) % 4 === 0,
    fundo: fundos[(h >> 16) % fundos.length],
  };
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function HairBack({ look }: { look: Look }) {
  const c = look.corCabelo;
  switch (look.cabelo) {
    case "longo":
      return <path d="M37 52 C35 29 48 23 60 23 C73 23 86 29 83 52 L86 86 Q73 93 60 88 Q47 93 34 86 Z" fill={c} />;
    case "chanel":
      return <path d="M38 52 C36 30 48 24 60 24 C72 24 84 30 82 52 L83 72 Q60 80 37 72 Z" fill={c} />;
    case "rabo":
      return <path d="M76 40 C92 44 94 66 84 80 C82 70 80 60 74 52 Z" fill={c} />;
    case "coque":
      return <circle cx="60" cy="22" r="10" fill={c} />;
    case "cacheado":
      return (
        <g fill={c}>
          {[[42, 36], [50, 28], [60, 25], [70, 28], [78, 36], [82, 46], [38, 46]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="9" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ look }: { look: Look }) {
  const c = look.corCabelo;
  switch (look.cabelo) {
    case "curto":
      return <path d="M41 50 C39 33 50 27 61 27 C73 27 82 34 79 50 C77 42 70 37 60 37 C51 37 44 42 41 50 Z" fill={c} />;
    case "lateral":
      return <path d="M41 51 C38 33 50 26 62 26 C74 26 82 34 79 49 C76 41 66 35 52 40 C47 42 43 46 41 51 Z" fill={c} />;
    case "penteado":
      return <path d="M41 49 C40 31 51 25 61 25 C72 25 81 31 79 48 C76 38 70 33 60 33 C50 33 44 39 41 49 Z" fill={c} />;
    case "raspado":
      return <path d="M41.5 48 C41 34 50 29 60 29 C70 29 79 34 78.5 48 C74 39 67 36 60 36 C53 36 46 39 41.5 48 Z" fill={c} opacity=".85" />;
    case "grisalho":
      return <path d="M41 51 C38 33 50 26 62 26 C74 26 82 34 79 49 C76 41 66 35 52 40 C47 42 43 46 41 51 Z" fill={c} />;
    case "longo":
    case "chanel":
    case "rabo":
    case "coque":
      return <path d="M41 50 C42 34 51 28 61 28 C71 28 79 34 79 47 C72 40 63 38 55 40 C49 42 44 45 41 50 Z" fill={c} />;
    case "cacheado":
      return (
        <g fill={c}>
          {[[45, 38], [53, 33], [62, 32], [71, 35], [77, 42]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6.5" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

export function AgentAvatar({ slug, name, size = 40, className }: { slug?: string | null; name: string; size?: number; className?: string }) {
  const look = lookFor(slug ?? undefined, name);
  const id = `ag-${(slug ?? name).replace(/[^a-z0-9]/gi, "")}`;
  const skinDark = shade(look.pele, -28);
  const lapel = shade(look.blazer, -22);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} role="img" aria-label={name} style={{ flex: "none", borderRadius: "28%" }}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={shade(look.fundo, 40)} />
          <stop offset="1" stopColor={shade(look.fundo, -50)} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect width="120" height="120" rx="34" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="120" height="120" fill={`url(#${id}-bg)`} />
        <circle cx="60" cy="54" r="40" fill="#ffffff" opacity=".08" />
        <HairBack look={look} />
        {/* pescoço */}
        <path d="M52 68 h16 v20 c0 5 -16 5 -16 0 Z" fill={skinDark} />
        {/* blazer e camisa */}
        <path d="M10 122 C14 98 34 86 60 86 C86 86 106 98 110 122 Z" fill={look.blazer} />
        <path d="M47 87 L60 112 L73 87 Q60 84 47 87 Z" fill="#f8fafc" />
        <path d="M47 87 L60 112 L52 118 L36 92 Z" fill={lapel} />
        <path d="M73 87 L60 112 L68 118 L84 92 Z" fill={lapel} />
        {look.gravata ? (
          <path d="M57.5 92 L62.5 92 L64 108 L60 113 L56 108 Z" fill={look.gravata} />
        ) : (
          <path d="M54 88 L60 98 L66 88" fill="none" stroke="#e2e8f0" strokeWidth="1.5" />
        )}
        <circle cx="76" cy="104" r="1.4" fill={shade(look.blazer, 30)} />
        {/* cabeça */}
        <circle cx="41" cy="54" r="4.5" fill={look.pele} />
        <circle cx="79" cy="54" r="4.5" fill={look.pele} />
        <ellipse cx="60" cy="52" rx="19" ry="22" fill={look.pele} />
        {look.barba && <path d="M42 56 C43 70 51 76 60 76 C69 76 77 70 78 56 C74 64 68 67 60 67 C52 67 46 64 42 56 Z" fill={look.corCabelo} opacity=".75" />}
        <HairFront look={look} />
        {/* rosto */}
        <path d="M49 47.5 q4 -2.2 8 0 M63 47.5 q4 -2.2 8 0" stroke={shade(look.corCabelo, -10)} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <ellipse cx="53" cy="54" rx="1.9" ry="2.3" fill="#1f1a17" />
        <ellipse cx="67" cy="54" rx="1.9" ry="2.3" fill="#1f1a17" />
        <path d="M59 57 q1.5 4 -1 5" stroke={skinDark} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M53.5 65 Q60 70 66.5 65" stroke="#7a3b2e" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="48" cy="61" r="3" fill="#f43f5e" opacity=".12" />
        <circle cx="72" cy="61" r="3" fill="#f43f5e" opacity=".12" />
        {look.oculos && (
          <g fill="none" stroke="#1f2937" strokeWidth="1.6">
            <rect x="46" y="49" width="12" height="9.5" rx="3.5" />
            <rect x="62" y="49" width="12" height="9.5" rx="3.5" />
            <path d="M58 53 h4" />
          </g>
        )}
      </g>
    </svg>
  );
}
