"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Foto do cliente (perfil do Instagram). Enquanto não tem foto, mostra as iniciais
// e tenta de novo depois (a foto é buscada em segundo plano na primeira vez).
export function ClientAvatar({ clientId, name, size = 48, className }: { clientId: string; name: string; size?: number; className?: string }) {
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (failedAt === null || attempt >= 3) return;
    const t = setTimeout(() => {
      setFailedAt(null);
      setAttempt((a) => a + 1);
    }, 20_000);
    return () => clearTimeout(t);
  }, [failedAt, attempt]);

  const initials =
    name
      .replace(/^(cl[ií]nica|consult[oó]rio|instituto|espa[cç]o)\s+/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const box = { width: size, height: size, minWidth: size };
  if (failedAt !== null) {
    return (
      <div
        style={{ ...box, fontSize: Math.max(11, size * 0.32) }}
        className={cn("rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold", className)}
      >
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/clients/${clientId}/avatar${attempt ? `?t=${attempt}` : ""}`}
      alt={name}
      style={box}
      className={cn("rounded-xl object-cover border border-white/10 bg-muted", className)}
      onError={() => setFailedAt(Date.now())}
    />
  );
}
