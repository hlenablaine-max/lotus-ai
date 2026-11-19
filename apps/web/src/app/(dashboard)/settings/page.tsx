import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { User, Shield, Key, Database, Info } from "lucide-react";
import { AISettings } from "@/components/settings/ai-settings";
import { SignOutButton } from "@/components/settings/sign-out-button";

export const metadata = {
  title: "Configurações — LOTUS AI",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { name, email } = session.user;
  const role = (session.user as { role?: string }).role ?? "OWNER";

  const dbConfigured = !!process.env.DATABASE_URL;

  return (
    <div className="p-8 max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground mt-1">Configurações da conta e do sistema</p>
      </div>

      {/* Profile */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <User className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Perfil</h2>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/30 flex items-center justify-center text-2xl font-bold text-primary">
              {name?.[0]?.toUpperCase() ?? "I"}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">{name ?? "Ícaro"}</h3>
              <p className="text-muted-foreground text-sm">{email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted/30 border border-border p-4">
              <div className="text-xs text-muted-foreground mb-1">Função</div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{role}</span>
              </div>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border p-4">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm font-medium text-foreground">Ativo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AISettings />

      {/* System status */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Database className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Sistema</h2>
        </div>
        <div className="p-6 space-y-3">
          {[
            {
              label: "PostgreSQL",
              description: "Banco de dados principal",
              ok: dbConfigured,
              okText: "Configurado",
              failText: "DATABASE_URL não definido",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between p-4 rounded-lg bg-muted/20 border border-border"
            >
              <div>
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${item.ok ? "text-emerald-400" : "text-zinc-500"}`}>
                <div className={`w-2 h-2 rounded-full ${item.ok ? "bg-emerald-400" : "bg-zinc-500"}`} />
                {item.ok ? item.okText : item.failText}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Credentials */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Key className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Credenciais de Acesso</h2>
        </div>
        <div className="p-6">
          <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-2">
            <div className="text-xs text-muted-foreground">Email</div>
            <div className="text-sm font-mono text-foreground">{email}</div>
          </div>
          <div className="mt-3 rounded-lg bg-amber-400/5 border border-amber-400/20 p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              O login usa as variáveis <code className="text-amber-400 font-mono">OWNER_EMAIL</code> e{" "}
              <code className="text-amber-400 font-mono">OWNER_PASSWORD</code> do arquivo <code className="font-mono">apps/web/.env.local</code>.
              Sem elas, ninguém consegue entrar.
            </p>
          </div>
          <div className="mt-3">
            <SignOutButton />
          </div>
        </div>
      </section>

      {/* App info */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Info className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Sobre o LOTUS</h2>
        </div>
        <div className="p-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Versão", value: "2.0.0" },
            { label: "Framework", value: "Next.js 15" },
            { label: "ORM", value: "Prisma" },
            { label: "Auth", value: "NextAuth v5" },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-muted/30 border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
              <div className="text-sm font-semibold text-foreground">{item.value}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
