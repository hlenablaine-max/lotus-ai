"use client";

import { useState, useEffect } from "react";
import {
  Users, Plus, Globe, Instagram, Briefcase, X,
  Building2, TrendingUp, ChevronRight, Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface Client {
  id: string;
  name: string;
  slug: string;
  segment?: string;
  website?: string;
  instagram?: string;
  description?: string;
  status: string;
  createdAt: string;
  _count: { missions: number };
}

// Cache de módulo — navegação instantânea após primeira visita
let _clientCache: { clients: Client[]; ts: number } | null = null;

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  PAUSED:   'text-amber-400 bg-amber-400/10 border-amber-400/20',
  CHURNED:  'text-red-400 bg-red-400/10 border-red-400/20',
  PROSPECT: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo', PAUSED: 'Pausado', CHURNED: 'Perdido', PROSPECT: 'Em prospecção',
};

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', segment: '', website: '', instagram: '', description: '' });
  const [error, setError] = useState('');

  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchClients = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'erro ' + res.status);
      const clients = data.clients ?? [];
      setClients(clients);
      setLoadError(null);
      _clientCache = { clients, ts: Date.now() };
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Mostra o que já tinha na hora e atualiza por trás
    if (_clientCache) {
      setClients(_clientCache.clients);
      setLoading(false);
      fetchClients(true);
      return;
    }
    fetchClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Erro ao criar cliente');
      await fetchClients();
      setShowCreate(false);
      setForm({ name: '', segment: '', website: '', instagram: '', description: '' });
    } catch (err) {
      setError('Erro ao criar cliente. Tente novamente.');
    } finally {
      setCreating(false);
    }
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.segment ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clientes</h1>
          <p className="text-muted-foreground mt-1">{clients.length} empresa{clients.length !== 1 ? 's' : ''} cadastrada{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar clientes..."
          className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
        />
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={() => fetchClients()} className="text-xs underline">Tentar de novo</button>
        </div>
      )}

      {/* Client list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-32" />
                  <div className="h-3 bg-muted rounded w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-16 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="text-muted-foreground mb-2">
            {loadError ? 'Não foi possível carregar os clientes' : clients.length === 0 ? 'Nenhum cliente ainda' : 'Nenhum cliente encontrado'}
          </p>
          {clients.length === 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 rounded-lg bg-primary/15 text-primary border border-primary/20 text-sm hover:bg-primary/20 transition-all"
            >
              Adicionar primeiro cliente
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((client) => {
            const statusCls = STATUS_COLOR[client.status] ?? STATUS_COLOR.ACTIVE;
            const initials = client.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div
                key={client.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push('/clients/' + client.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') router.push('/clients/' + client.id); }}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-foreground">{client.name}</h3>
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border", statusCls)}>
                        {STATUS_LABEL[client.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {client.segment && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Briefcase className="w-3 h-3" /> {client.segment}
                        </span>
                      )}
                      {client.website && (
                        <a
                          href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Globe className="w-3 h-3" /> {client.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                      {client.instagram && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Instagram className="w-3 h-3" /> {client.instagram}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Missions count */}
                  <div className="flex items-center gap-6 mr-2">
                    <div className="text-right hidden sm:block">
                      <div className="text-sm font-semibold text-foreground">{client._count?.missions ?? 0}</div>
                      <div className="text-xs text-muted-foreground">missões</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
                {client.description && (
                  <p className="mt-3 text-sm text-muted-foreground line-clamp-2 pl-16">{client.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Novo Cliente</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Nome da Empresa *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Clínica Dr. Silva"
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Segmento</label>
                <input
                  value={form.segment}
                  onChange={(e) => setForm((p) => ({ ...p, segment: e.target.value }))}
                  placeholder="Ex: Saúde, Educação, E-commerce"
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Website</label>
                  <input
                    value={form.website}
                    onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                    placeholder="site.com.br"
                    className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Instagram</label>
                  <input
                    value={form.instagram}
                    onChange={(e) => setForm((p) => ({ ...p, instagram: e.target.value }))}
                    placeholder="@perfil"
                    className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Breve descrição do cliente e do trabalho..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {creating ? 'Criando...' : 'Criar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
