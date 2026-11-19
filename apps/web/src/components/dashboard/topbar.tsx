"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { NotificationBell } from "@/components/dashboard/notification-bell";

const TITLES: Record<string, string> = {
  "root-master": "Root Master",
  ceo: "CEO Chat",
  advisor: "Advisor",
  copilot: "Sales Copilot",
  diagnosis: "Diagnóstico",
  motors: "Motores",
  governance: "Governança",
  approvals: "Aprovações",
  missions: "Missões",
  clients: "Clientes",
  solutions: "Soluções",
  workforce: "Workforce",
  headquarters: "HQ",
  metrics: "Métricas",
  integrations: "Integrações",
  activity: "Atividade",
  settings: "Configurações",
};

export function TopBar() {
  const pathname = usePathname();
  const section = pathname.split("/").filter(Boolean)[0] ?? "";
  const title = TITLES[section] ?? "Painel";
  const [userName, setUserName] = useState("");

  // Nome de quem está logado neste computador (dono ou sócio)
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((session) => setUserName(session?.user?.name ?? ""))
      .catch(() => {});
  }, []);

  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">LOTUS AI Enterprise</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />
        <Link
          href="/settings"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          title="Configurações e conta"
        >
          <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary">{(userName || "?").charAt(0).toUpperCase()}</span>
          </div>
          <span className="text-sm font-medium">{userName || "Conta"}</span>
          <Settings className="w-3 h-3 text-muted-foreground" />
        </Link>
      </div>
    </header>
  );
}
