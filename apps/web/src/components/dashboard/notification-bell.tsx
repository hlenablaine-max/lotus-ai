"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, AlertCircle, Info, AlertTriangle, X, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  message: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  createdAt: string;
  href?: string;
  read: boolean;
}

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem("lotus-notif-read");
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markRead(id: string) {
  try {
    const ids = getReadIds();
    ids.add(id);
    localStorage.setItem("lotus-notif-read", JSON.stringify([...ids]));
  } catch {}
}

const PRIORITY_CONFIG = {
  HIGH: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20", dot: "bg-red-400", label: "Urgente" },
  MEDIUM: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20", dot: "bg-amber-400", label: "Atenção" },
  LOW: { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20", dot: "bg-blue-400", label: "Info" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/advisor/notifications");
      const data = await res.json();
      // A API manda { body, severity, ts, href }; o sino usa { message, priority, createdAt, href }
      const PRIORITY: Record<string, Notification["priority"]> = { critical: "HIGH", warning: "MEDIUM", info: "LOW" };
      const list = (data.notifications ?? []) as Array<{ id: string; title: string; body?: string; severity?: string; ts?: number; href?: string }>;
      // Aviso novo do atendimento/prospecção: notificação do Windows (uma vez por aviso)
      try {
        const seenKey = "lotus_notified_v1";
        const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) ?? "[]") as string[]);
        const fresh = list.filter((n) => n.id.startsWith("app-") && !seen.has(n.id) && Date.now() - (n.ts ?? 0) < 15 * 60_000);
        if (fresh.length && typeof Notification !== "undefined") {
          if (Notification.permission === "default") await Notification.requestPermission().catch(() => undefined);
          if (Notification.permission === "granted") {
            for (const n of fresh.slice(0, 3)) {
              const toast = new Notification(n.title, { body: n.body ?? "", tag: n.id });
              toast.onclick = () => {
                window.focus();
                if (n.href) router.push(n.href);
              };
            }
          }
        }
        for (const n of list) if (n.id.startsWith("app-")) seen.add(n.id);
        localStorage.setItem(seenKey, JSON.stringify([...seen].slice(-300)));
      } catch {
        // sem notificação do sistema: o sino continua mostrando
      }
      setNotifications(
        list.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.body ?? "",
          priority: PRIORITY[n.severity ?? "info"] ?? "LOW",
          createdAt: new Date(n.ts ?? Date.now()).toISOString(),
          href: n.href,
          read: false,
        }))
      );
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    setReadIds(getReadIds());
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const handleClick = (notif: Notification) => {
    markRead(notif.id);
    setReadIds(getReadIds());
    setOpen(false);
    router.push(notif.href || `/advisor?notificationId=${notif.id}&title=${encodeURIComponent(notif.title)}`);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "relative w-9 h-9 rounded-lg flex items-center justify-center transition-all",
          open
            ? "bg-violet-500/20 border border-violet-500/30 text-violet-400"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
        title="Notificações do Advisor"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-card border border-border shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-sm font-semibold text-foreground">Advisor Proativo</span>
              {unreadCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-medium">
                  {unreadCount} novo{unreadCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">Analisando a empresa...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma observação ainda</div>
            ) : (
              notifications.map((notif) => {
                const cfg = PRIORITY_CONFIG[notif.priority] ?? PRIORITY_CONFIG.LOW;
                const PIcon = cfg.icon;
                const isUnread = !readIds.has(notif.id);
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={cn(
                      "w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-all border-b border-border/50 last:border-0 group",
                      isUnread && "bg-violet-500/5"
                    )}
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", cfg.bg)}>
                      <PIcon className={cn("w-3.5 h-3.5", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cn("text-xs font-medium truncate", isUnread ? "text-foreground" : "text-muted-foreground")}>
                          {notif.title}
                        </p>
                        {isUnread && <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dot)} />}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {notif.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1">{timeAgo(notif.createdAt)}</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors flex-shrink-0 mt-2" />
                  </button>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-border">
            <button
              onClick={() => { setOpen(false); router.push("/advisor"); }}
              className="w-full text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium flex items-center justify-center gap-1.5"
            >
              Abrir Advisor completo <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
