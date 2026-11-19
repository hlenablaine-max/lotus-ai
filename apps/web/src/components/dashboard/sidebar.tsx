"use client";
// sidebar v2
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Target,
  Users,
  Building2,
  LayoutDashboard,
  Plug,
  Settings,
  Activity,
  Brain,
  Package,
  Zap,
  Stethoscope,
  Cpu,
  Shield,
  Bell,
  TrendingUp,
} from "lucide-react";

function LotusIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="0.7" strokeDasharray="2 1.5" opacity="0.3" />
      <path d="M12 3L19.79 7.5V16.5L12 21L4.21 16.5V7.5L12 3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity="0.6" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" opacity="0.45" />
      <circle cx="12" cy="5" r="1.4" fill="currentColor" opacity="0.9" />
      <circle cx="18.5" cy="8.5" r="1.4" fill="currentColor" opacity="0.9" />
      <circle cx="18.5" cy="15.5" r="1.4" fill="currentColor" opacity="0.9" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" opacity="0.9" />
      <circle cx="5.5" cy="15.5" r="1.4" fill="currentColor" opacity="0.9" />
      <circle cx="5.5" cy="8.5" r="1.4" fill="currentColor" opacity="0.9" />
      <line x1="12" y1="8.8" x2="12" y2="6.4" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="14.6" y1="10.4" x2="17.2" y2="8.9" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="14.6" y1="13.6" x2="17.2" y2="15.1" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="12" y1="15.2" x2="12" y2="17.6" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="9.4" y1="13.6" x2="6.8" y2="15.1" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="9.4" y1="10.4" x2="6.8" y2="8.9" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

const navItems: Array<{
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badgeKey?: string;
}> = [
  {
    label: "Root Master",
    href: "/root-master",
    icon: Brain,
    description: "Luna — CEO de Operações",
  },
  {
    label: "CEO Chat",
    href: "/ceo",
    icon: MessageSquare,
    description: "Chat rápido com Luna",
  },
  {
    label: "Advisor",
    href: "/advisor",
    icon: Brain,
    description: "Estratégia da LOTUS",
  },
  {
    label: "Sales Copilot",
    href: "/copilot",
    icon: Zap,
    description: "Sugestões em tempo real",
  },
  {
    label: "Diagnóstico",
    href: "/diagnosis",
    icon: Stethoscope,
    description: "Análise de empresas",
  },
  {
    label: "Motores",
    href: "/motors",
    icon: Cpu,
    description: "8 Engines operacionais",
  },
  {
    label: "Governança",
    href: "/governance",
    icon: Shield,
    description: "Auditoria A/B/C/D",
  },
  {
    label: "Aprovações",
    href: "/approvals",
    icon: Bell,
    description: "Decisões pendentes",
    badgeKey: "approvals",
  },
  {
    label: "Missões",
    href: "/missions",
    icon: Target,
    description: "Tarefas e entregas",
  },
  {
    label: "Clientes",
    href: "/clients",
    icon: Users,
    description: "Empresas atendidas",
  },
  {
    label: "Soluções",
    href: "/solutions",
    icon: Package,
    description: "Catálogo de serviços",
  },
  {
    label: "Workforce",
    href: "/workforce",
    icon: Building2,
    description: "Agentes e departamentos",
  },
  {
    label: "HQ",
    href: "/headquarters",
    icon: LayoutDashboard,
    description: "Escritório virtual",
  },
  {
    label: "Métricas",
    href: "/metrics",
    icon: TrendingUp,
    description: "KPIs e desempenho",
  },
  {
    label: "Integrações",
    href: "/integrations",
    icon: Plug,
    description: "APIs e serviços",
  },
  {
    label: "Atividade",
    href: "/activity",
    icon: Activity,
    description: "Logs e auditoria",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingApprovals, setPendingApprovals] = useState(0);

  useEffect(() => {
    const fetchBadge = async () => {
      try {
        const res = await fetch("/api/approvals?status=PENDING");
        const data = await res.json();
        setPendingApprovals(data.pendingCount ?? 0);
      } catch {
        // non-critical
      }
    };
    fetchBadge();
    const interval = setInterval(fetchBadge, 15_000);
    return () => clearInterval(interval);
  }, []);

  const badges: Record<string, number> = { approvals: pendingApprovals };

  return (
    <aside className="w-64 flex flex-col bg-card border-r border-border flex-shrink-0 overflow-hidden" style={{ height: '100%', minHeight: 0 }}>
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/50 flex items-center justify-center shadow-[0_0_10px_rgba(var(--primary)_/_0.25)]">
            <LotusIcon size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-foreground">LOTUS</h1>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">AI Enterprise</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon
                className={cn(
                  "w-4 h-4 flex-shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-none flex items-center gap-2">
                  {item.label}
                  {badgeCount > 0 && (
                    <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 border border-amber-400/30 leading-none">
                      {badgeCount}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {item.description}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-border">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <Settings className="w-4 h-4" />
          <span className="text-sm">Configurações</span>
        </Link>
        <div className="mt-3 px-3 py-2 rounded-lg bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-muted-foreground">Sistema operacional</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
