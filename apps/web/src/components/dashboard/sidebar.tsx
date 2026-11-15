"use client";

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
  Sparkles,
} from "lucide-react";

const navItems = [
  {
    label: "CEO Chat",
    href: "/ceo",
    icon: MessageSquare,
    description: "Converse com o Root Master",
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
    label: "Integrações",
    href: "/integrations",
    icon: Plug,
    description: "APIs e serviços",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen flex flex-col bg-card border-r border-border flex-shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center lotus-glow">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-foreground">LOTUS</h1>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase">AI Enterprise</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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
              <div className="min-w-0">
                <div className="text-sm font-medium leading-none">{item.label}</div>
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
