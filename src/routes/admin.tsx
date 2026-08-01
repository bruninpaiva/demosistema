import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Users,
  ListChecks,
  LayoutDashboard,
  Download,
  UserSearch,
  ChevronRight,
  Store as StoreIcon,
  RefreshCw,
  Coffee,
  KeyRound,
  Pencil,
  Tag,
  Calculator,
  Wrench,
  Barcode,
} from "lucide-react";
import PromotionsTab from "@/components/PromotionsTab";
import CommissionTab from "@/components/CommissionTab";
import BarcodeConverterTab from "@/components/BarcodeConverterTab";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Tab = "dashboard" | "por-vendedora" | "pausas" | "lojas" | "vendedoras" | "motivos" | "usuarios" | "promocoes" | "comissao" | "exportar" | "conversor";

const AUTH_KEY = "lupo_admin_ok";
const ACTOR_USER_KEY = "lupo_admin_user";
const ACTOR_PASS_KEY = "lupo_admin_pass";

export function getAdminActor(): { user: string; pass: string } | null {
  if (typeof window === "undefined") return null;
  const user = sessionStorage.getItem(ACTOR_USER_KEY);
  const pass = sessionStorage.getItem(ACTOR_PASS_KEY);
  if (!user || !pass) return null;
  return { user, pass };
}

const ALL_STORES = "__all__";

function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [authed, setAuthed] = useState<boolean>(() =>
    typeof window !== "undefined" && sessionStorage.getItem(AUTH_KEY) === "1"
  );

  if (!authed) return <AdminLogin onOk={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 bg-brand px-4 py-4 text-brand-foreground">
        <Link to="/" className="rounded-lg p-2 hover:bg-white/10" aria-label="Voltar"><ArrowLeft size={22} /></Link>
        <div className="flex items-center rounded-lg bg-white px-2.5 py-1">
          <img src="/bpinfo-logo.jpg" alt="BPInfo ERP" className="h-6 w-auto" />
        </div>
        <h1 className="text-xl font-bold">Administração</h1>
        <button
          onClick={() => {
            sessionStorage.removeItem(AUTH_KEY);
            sessionStorage.removeItem(ACTOR_USER_KEY);
            sessionStorage.removeItem(ACTOR_PASS_KEY);
            window.dispatchEvent(new Event("lupo-admin-auth-changed"));
            setAuthed(false);
          }}
          className="ml-auto rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          Sair
        </button>
      </header>

      <nav className="sticky top-0 z-10 flex overflow-x-auto border-b border-border bg-card shadow-sm">
        {([
          { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
          { id: "por-vendedora", label: "Por vendedora", icon: UserSearch },
          { id: "pausas", label: "Pausas", icon: Coffee },
          { id: "lojas", label: "Lojas", icon: StoreIcon },
          { id: "vendedoras", label: "Vendedoras", icon: Users },
          { id: "motivos", label: "Motivos", icon: ListChecks },
          { id: "usuarios", label: "Usuários", icon: KeyRound },
        ] as { id: Tab; label: string; icon: typeof LayoutDashboard }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 whitespace-nowrap px-5 py-4 text-sm font-semibold border-b-2 transition ${
              tab === id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={18} /> {label}
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center gap-2 whitespace-nowrap px-5 py-4 text-sm font-semibold border-b-2 transition ${
                tab === "promocoes" || tab === "conversor"
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wrench size={18} /> Ferramentas
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setTab("promocoes")} className="gap-2">
              <Tag size={16} /> Promoções
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTab("conversor")} className="gap-2">
              <Barcode size={16} /> Conversor de código de barras
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {([
          { id: "comissao", label: "Comissão", icon: Calculator },
          { id: "exportar", label: "Exportar", icon: Download },
        ] as { id: Tab; label: string; icon: typeof LayoutDashboard }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 whitespace-nowrap px-5 py-4 text-sm font-semibold border-b-2 transition ${
              tab === id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-6xl p-4 md:p-8">
        {tab === "dashboard" && <Dashboard />}
        {tab === "por-vendedora" && <PerRepTab />}
        {tab === "pausas" && <BreaksTab />}
        {tab === "lojas" && <StoresTab />}
        {tab === "vendedoras" && <SalesRepsTab />}
        {tab === "motivos" && <ReasonsTab />}
        {tab === "usuarios" && <UsersTab />}
        {tab === "promocoes" && <PromotionsTab />}
        {tab === "comissao" && <CommissionTab />}
        {tab === "exportar" && <ExportTab />}
        {tab === "conversor" && <BarcodeConverterTab />}
      </main>
    </div>
  );
}

function AdminLogin({ onOk }: { onOk: () => void }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const { data, error: err } = await supabase.rpc("verify_admin", {
      _username: user.trim(),
      _password: pass,
    });
    setBusy(false);
    if (!err && data === true) {
      sessionStorage.setItem(AUTH_KEY, "1");
      sessionStorage.setItem(ACTOR_USER_KEY, user.trim());
      sessionStorage.setItem(ACTOR_PASS_KEY, pass);
      window.dispatchEvent(new Event("lupo-admin-auth-changed"));
      onOk();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-lg border-t-4 border-brand">
        <div className="mb-6 text-center">
          <img src="/bpinfo-logo.jpg" alt="BPInfo ERP" className="mx-auto mb-3 h-14 w-auto" />
          <p className="text-sm text-muted-foreground">Administração — acesso restrito</p>
        </div>
        <label className="mb-1 block text-sm font-semibold">Usuário</label>
        <input
          autoFocus
          value={user}
          onChange={(e) => { setUser(e.target.value); setError(false); }}
          className="mb-4 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-lg"
        />
        <label className="mb-1 block text-sm font-semibold">Senha</label>
        <input
          type="password"
          value={pass}
          onChange={(e) => { setPass(e.target.value); setError(false); }}
          className="mb-4 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-lg"
        />
        {error && <p className="mb-3 text-sm font-semibold text-destructive">Usuário ou senha incorretos.</p>}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand px-6 py-3 text-lg font-bold text-brand-foreground disabled:opacity-60">
          {busy ? "Entrando..." : "Entrar"}
        </button>
        <Link to="/" className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground">
          Voltar
        </Link>
      </form>
    </div>
  );
}

// ------------ shared hooks & components ------------

type Preset = "hoje" | "ontem" | "semana" | "mes" | "custom";
function rangeFor(preset: Preset, from?: string, to?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  if (preset === "hoje") return { start: startOfDay(now), end: endOfDay(now), label: "Hoje" };
  if (preset === "ontem") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y), label: "Ontem" };
  }
  if (preset === "semana") {
    const s = new Date(now); s.setDate(s.getDate() - 6);
    return { start: startOfDay(s), end: endOfDay(now), label: "Últimos 7 dias" };
  }
  if (preset === "mes") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: startOfDay(s), end: endOfDay(now), label: "Este mês" };
  }
  const s = from ? new Date(from + "T00:00:00") : startOfDay(now);
  const e = to ? new Date(to + "T23:59:59") : endOfDay(now);
  return { start: s, end: e, label: "Personalizado" };
}

type Attendance = {
  id: string;
  created_at: string;
  sales_rep_id: string;
  store_id: string | null;
  type: "sale" | "no_sale";
  reason_id: string | null;
  reason_other_text: string | null;
  notes: string | null;
};

type Store = { id: string; name: string; active: boolean };

function useStores() {
  const [stores, setStores] = useState<Store[]>([]);
  const load = () =>
    supabase.from("stores").select("id,name,active").order("name").then(({ data }) => setStores((data ?? []) as Store[]));
  useEffect(() => { load(); }, []);
  return { stores, reload: load };
}

function useAttendances(start: Date, end: Date, storeId: string) {
  const [data, setData] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    let q = supabase
      .from("attendances")
      .select("id,created_at,sales_rep_id,store_id,type,reason_id,reason_other_text,notes")
      .eq("status", "closed")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: false });
    if (storeId !== ALL_STORES) q = q.eq("store_id", storeId);
    q.then(({ data }) => { if (alive) { setData((data as Attendance[]) ?? []); setLoading(false); } });
    return () => { alive = false; };
  }, [start.getTime(), end.getTime(), storeId]);
  return { data, loading };
}

function StoreFilter({ storeId, setStoreId, stores }: { storeId: string; setStoreId: (s: string) => void; stores: Store[] }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <StoreIcon size={18} className="text-brand" />
      <select
        value={storeId}
        onChange={(e) => setStoreId(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
      >
        <option value={ALL_STORES}>Todas as lojas</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}

function DateRangeBar({ preset, setPreset, from, setFrom, to, setTo }: {
  preset: Preset; setPreset: (p: Preset) => void;
  from: string; setFrom: (s: string) => void;
  to: string; setTo: (s: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {(["hoje", "ontem", "semana", "mes", "custom"] as Preset[]).map((p) => (
        <button key={p} onClick={() => setPreset(p)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            preset === p ? "bg-brand text-brand-foreground" : "bg-card border border-border text-foreground"
          }`}>
          {p === "hoje" ? "Hoje" : p === "ontem" ? "Ontem" : p === "semana" ? "Semana" : p === "mes" ? "Mês" : "Personalizado"}
        </button>
      ))}
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm" />
          <span className="text-muted-foreground">até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm" />
        </div>
      )}
    </div>
  );
}

// ------------ Dashboard ------------

function Dashboard() {
  const [preset, setPreset] = useState<Preset>("hoje");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [storeId, setStoreId] = useState<string>(ALL_STORES);
  const { stores } = useStores();
  const { start, end } = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);
  const { data, loading } = useAttendances(start, end, storeId);
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [reasons, setReasons] = useState<{ id: string; label: string; is_other: boolean }[]>([]);

  useEffect(() => {
    supabase.from("sales_reps").select("id,name").then(({ data }) => setReps(data ?? []));
    supabase.from("no_sale_reasons").select("id,label,is_other").then(({ data }) => setReasons((data as any) ?? []));
  }, []);

  const stats = useMemo(() => {
    const total = data.length;
    const sales = data.filter((a) => a.type === "sale");
    const noSales = data.filter((a) => a.type === "no_sale");
    const conversion = total > 0 ? (sales.length / total) * 100 : 0;
    return { total, sales: sales.length, noSales: noSales.length, conversion };
  }, [data]);

  const ranking = useMemo(() => {
    const map = new Map<string, { att: number; sales: number }>();
    for (const a of data) {
      const cur = map.get(a.sales_rep_id) ?? { att: 0, sales: 0 };
      cur.att++;
      if (a.type === "sale") cur.sales++;
      map.set(a.sales_rep_id, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      name: reps.find((r) => r.id === id)?.name ?? "—",
      att: v.att, sales: v.sales,
      conv: v.att > 0 ? (v.sales / v.att) * 100 : 0,
    })).sort((a, b) => b.sales - a.sales);
  }, [data, reps]);

  const reasonChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of data) {
      if (a.type !== "no_sale" || !a.reason_id) continue;
      map.set(a.reason_id, (map.get(a.reason_id) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      name: reasons.find((r) => r.id === id)?.label ?? "—",
      qtd: v,
    })).sort((a, b) => b.qtd - a.qtd);
  }, [data, reasons]);

  const noSaleDetails = useMemo(() => {
    return data
      .filter((a) => a.type === "no_sale")
      .map((a) => {
        const reason = reasons.find((r) => r.id === a.reason_id);
        const isOther = reason?.is_other ?? false;
        return {
          id: a.id,
          created_at: a.created_at,
          rep: reps.find((r) => r.id === a.sales_rep_id)?.name ?? "—",
          reason: reason?.label ?? "—",
          isOther,
          description: a.reason_other_text ?? "",
        };
      });
  }, [data, reasons, reps]);

  const noSaleByRep = useMemo(() => {
    const map = new Map<string, { rep: string; total: number; reasons: Map<string, number>; others: string[] }>();
    for (const d of noSaleDetails) {
      const cur = map.get(d.rep) ?? { rep: d.rep, total: 0, reasons: new Map<string, number>(), others: [] as string[] };
      cur.total++;
      cur.reasons.set(d.reason, (cur.reasons.get(d.reason) ?? 0) + 1);
      if (d.isOther && d.description) cur.others.push(d.description);
      map.set(d.rep, cur);
    }
    return Array.from(map.values())
      .map((v) => ({
        rep: v.rep,
        total: v.total,
        reasons: Array.from(v.reasons.entries()).sort((a, b) => b[1] - a[1]),
        others: v.others,
      }))
      .sort((a, b) => b.total - a.total);
  }, [noSaleDetails]);

  const hourlyChart = useMemo(() => {
    const map = new Map<number, { hour: number; vendas: number; naovendas: number }>();
    for (let h = 8; h <= 22; h++) map.set(h, { hour: h, vendas: 0, naovendas: 0 });
    for (const a of data) {
      const h = new Date(a.created_at).getHours();
      if (!map.has(h)) map.set(h, { hour: h, vendas: 0, naovendas: 0 });
      const cur = map.get(h)!;
      if (a.type === "sale") cur.vendas++; else cur.naovendas++;
    }
    return Array.from(map.values()).sort((a, b) => a.hour - b.hour).map((v) => ({ ...v, hour: `${v.hour}h` }));
  }, [data]);

  return (
    <div>
      <StoreFilter storeId={storeId} setStoreId={setStoreId} stores={stores} />
      <DateRangeBar preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi title="Atendimentos" value={stats.total} />
        <Kpi title="Vendas" value={stats.sales} accent="success" />
        <Kpi title="Não vendas" value={stats.noSales} accent="destructive" />
        <Kpi title="Conversão" value={`${stats.conversion.toFixed(1)}%`} accent="brand" />
      </div>

      {loading && <p className="mt-6 text-center text-muted-foreground">Carregando…</p>}

      <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold">Ranking das vendedoras</h3>
        {ranking.length === 0 ? (
          <p className="text-muted-foreground">Sem atendimentos no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Vendedora</th>
                  <th className="px-3 py-2 text-right">Atendimentos</th>
                  <th className="px-3 py-2 text-right">Vendas</th>
                  <th className="px-3 py-2 text-right">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.name + i} className="border-t border-border">
                    <td className="px-3 py-3 font-semibold">{i + 1}º</td>
                    <td className="px-3 py-3">{r.name}</td>
                    <td className="px-3 py-3 text-right">{r.att}</td>
                    <td className="px-3 py-3 text-right font-semibold">{r.sales}</td>
                    <td className="px-3 py-3 text-right">{r.conv.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-bold">Motivos de não venda</h3>
          {reasonChart.length === 0 ? (
            <p className="text-muted-foreground">Sem dados.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={reasonChart} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="qtd" fill="var(--color-destructive)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="rounded-2xl bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-bold">Atendimentos por horário</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={hourlyChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="vendas" stroke="var(--color-success)" strokeWidth={3} dot />
              <Line type="monotone" dataKey="naovendas" stroke="var(--color-destructive)" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold">Não vendas por vendedora</h3>
        {noSaleByRep.length === 0 ? (
          <p className="text-muted-foreground">Sem não vendas no período.</p>
        ) : (
          <div className="space-y-4">
            {noSaleByRep.map((r) => (
              <div key={r.rep} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-lg font-bold">{r.rep}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.total} não {r.total === 1 ? "venda" : "vendas"}
                  </p>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {r.reasons.map(([label, qtd]) => (
                    <li
                      key={label}
                      className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive"
                    >
                      {label} · {qtd}
                    </li>
                  ))}
                </ul>
                {r.others.length > 0 && (
                  <div className="mt-3 rounded-lg bg-muted/60 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Descrições em "Outro"
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {r.others.map((desc, i) => (
                        <li key={i}>{desc}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold">Histórico de não vendas</h3>
        {noSaleDetails.length === 0 ? (
          <p className="text-muted-foreground">Sem não vendas no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Data/hora</th>
                  <th className="px-3 py-2">Vendedora</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {noSaleDetails.slice(0, 200).map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(d.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-2 font-semibold">{d.rep}</td>
                    <td className="px-3 py-2">{d.reason}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {d.isOther ? d.description || <span className="italic">—</span> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ title, value, accent }: { title: string; value: string | number; accent?: "success" | "destructive" | "brand" }) {
  const color = accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : accent === "brand" ? "text-brand" : "text-foreground";
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}

// ------------ Stores tab ------------

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function StoresTab() {
  const { stores, reload } = useStores();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  

  const add = async () => {
    if (!name.trim()) return toast.error("Informe o nome");
    const finalPin = pin.trim() || randomPin();
    if (!/^\d{4,8}$/.test(finalPin)) return toast.error("PIN deve ter 4 a 8 dígitos");
    const { error } = await supabase.from("stores").insert({ name: name.trim(), pin: finalPin });
    if (error) return toast.error(error.message);
    setName(""); setPin(""); toast.success("Loja cadastrada"); reload();
  };

  const renamePrompt = async (s: Store) => {
    const v = prompt("Novo nome da loja:", s.name);
    if (!v || !v.trim() || v.trim() === s.name) return;
    const { error } = await supabase.from("stores").update({ name: v.trim() }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Nome atualizado"); reload();
  };

  const changePin = async (s: Store) => {
    const v = prompt(`Novo PIN para ${s.name} (4 a 8 dígitos):`);
    if (!v) return;
    const trimmed = v.trim();
    if (!/^\d{4,8}$/.test(trimmed)) return toast.error("PIN deve ter 4 a 8 dígitos");
    const { error } = await supabase.from("stores").update({ pin: trimmed }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("PIN atualizado"); reload();
  };

  const regenPin = async (s: Store) => {
    if (!confirm(`Gerar um novo PIN aleatório para ${s.name}?`)) return;
    const newPin = randomPin();
    const { error } = await supabase.from("stores").update({ pin: newPin }).eq("id", s.id);
    if (error) return toast.error(error.message);
    alert(`Novo PIN de ${s.name}: ${newPin}\n\nAnote agora — ele não será mostrado novamente.`);
    toast.success(`Novo PIN: ${newPin}`);
    reload();
  };

  const toggle = async (s: Store) => {
    const { error } = await supabase.from("stores").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    reload();
  };

  const remove = async (s: Store) => {
    if (!confirm(`Excluir ${s.name}? Todas as vendedoras e atendimentos vinculados serão apagados.`)) return;
    const { error } = await supabase.from("stores").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Loja excluída"); reload();
  };

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-bold">Nova loja</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da loja"
            className="rounded-xl border-2 border-border bg-background px-4 py-3 text-lg"
          />
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="PIN (opcional)"
            inputMode="numeric"
            maxLength={8}
            className="rounded-xl border-2 border-border bg-background px-4 py-3 text-lg text-center tracking-widest"
          />
          <button onClick={add} className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-bold text-brand-foreground">
            <Plus size={20} /> Adicionar
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Deixe o PIN em branco para gerar um aleatório de 4 dígitos.</p>
      </div>

      <ul className="space-y-2">
        {stores.map((s) => (
          <li key={s.id} className="rounded-xl bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <StoreIcon size={20} />
                </div>
                <div>
                  <p className="text-lg font-bold">{s.name}</p>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    PIN oculto por segurança
                    {!s.active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Inativa</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => renamePrompt(s)} className="rounded-lg border border-border px-3 py-2 text-sm">
                  Renomear
                </button>
                <button onClick={() => changePin(s)} className="rounded-lg border border-border px-3 py-2 text-sm">
                  Editar PIN
                </button>
                <button onClick={() => regenPin(s)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm">
                  <RefreshCw size={14} /> Gerar PIN
                </button>
                <button onClick={() => toggle(s)} className="rounded-lg border border-border px-3 py-2 text-sm">
                  {s.active ? "Desativar" : "Ativar"}
                </button>
                <button onClick={() => remove(s)} className="rounded-lg bg-destructive/10 p-2 text-destructive" aria-label="Excluir">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </li>
        ))}
        {stores.length === 0 && <p className="text-muted-foreground">Nenhuma loja cadastrada.</p>}
      </ul>
    </div>
  );
}

// ------------ Sales reps tab ------------

type Rep = { id: string; name: string; active: boolean; store_id: string | null };

function SalesRepsTab() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [name, setName] = useState("");
  const [newStoreId, setNewStoreId] = useState<string>("");
  const [filterStoreId, setFilterStoreId] = useState<string>(ALL_STORES);
  const { stores } = useStores();

  const load = () =>
    supabase.from("sales_reps").select("id,name,active,store_id").order("name").then(({ data }) => setReps((data ?? []) as Rep[]));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!newStoreId && stores.length > 0) setNewStoreId(stores[0].id);
  }, [stores, newStoreId]);

  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "—";

  const add = async () => {
    if (!name.trim()) return toast.error("Informe o nome");
    if (!newStoreId) return toast.error("Selecione a loja");
    // compute next queue_position within that store
    const { data: existing } = await supabase.from("sales_reps").select("queue_position").eq("store_id", newStoreId);
    const nextPos = ((existing ?? []).reduce((m, r) => Math.max(m, r.queue_position ?? 0), 0)) + 1;
    const { error } = await supabase.from("sales_reps").insert({ name: name.trim(), store_id: newStoreId, queue_position: nextPos });
    if (error) return toast.error(error.message);
    setName(""); toast.success("Vendedora cadastrada"); load();
  };

  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("sales_reps").update({ active: !active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const changeStore = async (rep: Rep) => {
    const options = stores.map((s, i) => `${i + 1}. ${s.name}`).join("\n");
    const choice = prompt(`Mover ${rep.name} para qual loja? Digite o número:\n\n${options}`);
    if (!choice) return;
    const idx = parseInt(choice.trim(), 10) - 1;
    const target = stores[idx];
    if (!target) return toast.error("Opção inválida");
    const { data: existing } = await supabase.from("sales_reps").select("queue_position").eq("store_id", target.id);
    const nextPos = ((existing ?? []).reduce((m, r) => Math.max(m, r.queue_position ?? 0), 0)) + 1;
    const { error } = await supabase.from("sales_reps").update({ store_id: target.id, queue_position: nextPos }).eq("id", rep.id);
    if (error) return toast.error(error.message);
    toast.success(`Movida para ${target.name}`); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta vendedora?")) return;
    const { error } = await supabase.from("sales_reps").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir.");
    toast.success("Excluída"); load();
  };

  const filtered = filterStoreId === ALL_STORES ? reps : reps.filter((r) => r.store_id === filterStoreId);

  return (
    <div>
      <StoreFilter storeId={filterStoreId} setStoreId={setFilterStoreId} stores={stores} />

      <div className="mb-6 rounded-2xl bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-bold">Nova vendedora</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome"
            className="rounded-xl border-2 border-border bg-background px-4 py-3 text-lg"
          />
          <select
            value={newStoreId}
            onChange={(e) => setNewStoreId(e.target.value)}
            className="rounded-xl border-2 border-border bg-background px-4 py-3 text-base"
          >
            <option value="" disabled>Selecione a loja</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={add} className="flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 font-bold text-brand-foreground">
            <Plus size={20} /> Adicionar
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {filtered.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 shadow-sm">
            <div>
              <p className="text-lg font-semibold">{r.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <StoreIcon size={12} /> {storeName(r.store_id)}
                {!r.active && <span className="rounded-full bg-muted px-2 py-0.5">Inativa</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => changeStore(r)} className="rounded-lg border border-border px-3 py-2 text-sm">
                Mudar loja
              </button>
              <button onClick={() => toggle(r.id, r.active)} className="rounded-lg border border-border px-3 py-2 text-sm">
                {r.active ? "Desativar" : "Ativar"}
              </button>
              <button onClick={() => remove(r.id)} className="rounded-lg bg-destructive/10 p-2 text-destructive" aria-label="Excluir">
                <Trash2 size={18} />
              </button>
            </div>
          </li>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground">Nenhuma vendedora {filterStoreId !== ALL_STORES ? "nesta loja" : "cadastrada"}.</p>}
      </ul>
    </div>
  );
}

// ------------ Reasons tab ------------

function ReasonsTab() {
  const [items, setItems] = useState<{ id: string; label: string; active: boolean; is_other: boolean }[]>([]);
  const [label, setLabel] = useState("");
  const load = () => supabase.from("no_sale_reasons").select("id,label,active,is_other").order("sort_order").then(({ data }) => setItems(data ?? []));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!label.trim()) return;
    const max = Math.max(0, ...items.filter((i) => !i.is_other).map((_, idx) => idx + 1));
    const { error } = await supabase.from("no_sale_reasons").insert({ label: label.trim(), sort_order: max + 1 });
    if (error) return toast.error(error.message);
    setLabel(""); load();
  };
  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("no_sale_reasons").update({ active: !active }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  const remove = async (id: string, is_other: boolean) => {
    if (is_other) return toast.error("O motivo \"Outro\" não pode ser excluído.");
    if (!confirm("Excluir este motivo?")) return;
    const { error } = await supabase.from("no_sale_reasons").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir. Você pode desativá-lo.");
    load();
  };

  return (
    <div>
      <div className="mb-6 flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="Novo motivo" className="flex-1 rounded-xl border-2 border-border bg-card px-4 py-3 text-lg" />
        <button onClick={add} className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-bold text-brand-foreground">
          <Plus size={20} /> Adicionar
        </button>
      </div>
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-xl bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-lg">{r.label}</span>
              {r.is_other && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">Especial</span>}
              {!r.active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Inativo</span>}
            </div>
            <div className="flex gap-2">
              {!r.is_other && (
                <button onClick={() => toggle(r.id, r.active)} className="rounded-lg border border-border px-3 py-2 text-sm">
                  {r.active ? "Desativar" : "Ativar"}
                </button>
              )}
              <button onClick={() => remove(r.id, r.is_other)} className="rounded-lg bg-destructive/10 p-2 text-destructive" aria-label="Excluir">
                <Trash2 size={18} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------ Per rep tab ------------

function PerRepTab() {
  const [preset, setPreset] = useState<Preset>("mes");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [storeId, setStoreId] = useState<string>(ALL_STORES);
  const { stores } = useStores();
  const { start, end } = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);
  const { data, loading } = useAttendances(start, end, storeId);
  const [reps, setReps] = useState<Rep[]>([]);
  const [reasons, setReasons] = useState<{ id: string; label: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("sales_reps").select("id,name,active,store_id").order("name").then(({ data }) => setReps((data ?? []) as Rep[]));
    supabase.from("no_sale_reasons").select("id,label").then(({ data }) => setReasons(data ?? []));
  }, []);

  const filteredReps = storeId === ALL_STORES ? reps : reps.filter((r) => r.store_id === storeId);

  const perRep = useMemo(() => {
    const map = new Map<string, { att: number; sales: number; noSales: number }>();
    for (const a of data) {
      const cur = map.get(a.sales_rep_id) ?? { att: 0, sales: 0, noSales: 0 };
      cur.att++;
      if (a.type === "sale") cur.sales++; else cur.noSales++;
      map.set(a.sales_rep_id, cur);
    }
    return map;
  }, [data]);

  const selected = selectedId ? reps.find((r) => r.id === selectedId) : null;
  const selectedData = useMemo(() => data.filter((a) => a.sales_rep_id === selectedId), [data, selectedId]);
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "—";

  const detail = useMemo(() => {
    const total = selectedData.length;
    const sales = selectedData.filter((a) => a.type === "sale");
    const noSales = selectedData.filter((a) => a.type === "no_sale");
    const conversion = total > 0 ? (sales.length / total) * 100 : 0;

    const reasonMap = new Map<string, number>();
    for (const a of noSales) {
      const key = a.reason_id ?? "__other__";
      reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
    }
    const reasonChart = Array.from(reasonMap.entries()).map(([id, qtd]) => ({
      name: reasons.find((r) => r.id === id)?.label ?? "Outro",
      qtd,
    })).sort((a, b) => b.qtd - a.qtd);

    const hours = new Map<number, { hour: number; vendas: number; naovendas: number }>();
    for (let h = 8; h <= 22; h++) hours.set(h, { hour: h, vendas: 0, naovendas: 0 });
    for (const a of selectedData) {
      const h = new Date(a.created_at).getHours();
      if (!hours.has(h)) hours.set(h, { hour: h, vendas: 0, naovendas: 0 });
      const cur = hours.get(h)!;
      if (a.type === "sale") cur.vendas++; else cur.naovendas++;
    }
    const hourlyChart = Array.from(hours.values()).sort((a, b) => a.hour - b.hour).map((v) => ({ ...v, hour: `${v.hour}h` }));

    return { total, sales: sales.length, noSales: noSales.length, conversion, reasonChart, hourlyChart };
  }, [selectedData, reasons]);

  return (
    <div>
      <StoreFilter storeId={storeId} setStoreId={setStoreId} stores={stores} />
      <DateRangeBar preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />

      {!selected ? (
        <>
          <h3 className="mb-3 text-lg font-bold">Toque em uma vendedora para ver os detalhes</h3>
          {loading && <p className="text-muted-foreground">Carregando…</p>}
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {filteredReps.map((r) => {
              const s = perRep.get(r.id) ?? { att: 0, sales: 0, noSales: 0 };
              const conv = s.att > 0 ? (s.sales / s.att) * 100 : 0;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className="flex w-full items-center justify-between rounded-2xl bg-card p-4 text-left shadow-sm transition hover:bg-brand/5"
                  >
                    <div>
                      <p className="text-lg font-bold">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{storeName(r.store_id)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {s.att} atend. · <span className="text-success font-semibold">{s.sales} vendas</span> · {conv.toFixed(0)}% conv.
                      </p>
                    </div>
                    <ChevronRight className="text-muted-foreground" />
                  </button>
                </li>
              );
            })}
            {filteredReps.length === 0 && <p className="text-muted-foreground">Nenhuma vendedora.</p>}
          </ul>
        </>
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <button onClick={() => setSelectedId(null)} className="mb-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft size={16} /> Voltar
              </button>
              <h3 className="text-2xl font-extrabold">{selected.name}</h3>
              <p className="text-sm text-muted-foreground">{storeName(selected.store_id)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi title="Atendimentos" value={detail.total} />
            <Kpi title="Vendas" value={detail.sales} accent="success" />
            <Kpi title="Não vendas" value={detail.noSales} accent="destructive" />
            <Kpi title="Conversão" value={`${detail.conversion.toFixed(1)}%`} accent="brand" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-card p-5 shadow-sm">
              <h4 className="mb-4 text-lg font-bold">Motivos de não venda</h4>
              {detail.reasonChart.length === 0 ? (
                <p className="text-muted-foreground">Sem não vendas no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={detail.reasonChart} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="qtd" fill="var(--color-destructive)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="rounded-2xl bg-card p-5 shadow-sm">
              <h4 className="mb-4 text-lg font-bold">Atendimentos por horário</h4>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={detail.hourlyChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="vendas" stroke="var(--color-success)" strokeWidth={3} dot />
                  <Line type="monotone" dataKey="naovendas" stroke="var(--color-destructive)" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </section>
          </div>

          <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
            <h4 className="mb-4 text-lg font-bold">Últimos atendimentos</h4>
            {selectedData.length === 0 ? (
              <p className="text-muted-foreground">Sem atendimentos no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Data/Hora</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Motivo</th>
                      <th className="px-3 py-2">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedData.slice(0, 50).map((a) => (
                      <tr key={a.id} className="border-t border-border">
                        <td className="px-3 py-2">{new Date(a.created_at).toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2">
                          {a.type === "sale"
                            ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">Venda</span>
                            : <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">Não venda</span>}
                        </td>
                        <td className="px-3 py-2">{a.type === "no_sale" ? (reasons.find((r) => r.id === a.reason_id)?.label ?? "—") : "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{a.type === "no_sale" ? (a.reason_other_text || "—") : "—"}</td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ------------ Export tab ------------

function ExportTab() {
  const [preset, setPreset] = useState<Preset>("mes");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [storeId, setStoreId] = useState<string>(ALL_STORES);
  const { stores } = useStores();
  const { start, end, label } = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);
  const { data } = useAttendances(start, end, storeId);
  const [reps, setReps] = useState<Map<string, string>>(new Map());
  const [reasons, setReasons] = useState<Map<string, string>>(new Map());
  const storesMap = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  useEffect(() => {
    supabase.from("sales_reps").select("id,name").then(({ data }) => setReps(new Map((data ?? []).map((r) => [r.id, r.name]))));
    supabase.from("no_sale_reasons").select("id,label").then(({ data }) => setReasons(new Map((data ?? []).map((r) => [r.id, r.label]))));
  }, []);

  const rows = useMemo(() => data.map((a) => ({
    Data: new Date(a.created_at).toLocaleDateString("pt-BR"),
    Hora: new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    Loja: storesMap.get(a.store_id ?? "") ?? "—",
    Vendedora: reps.get(a.sales_rep_id) ?? "—",
    Tipo: a.type === "sale" ? "Venda" : "Não venda",
    Motivo: a.type === "no_sale" ? (reasons.get(a.reason_id ?? "") ?? "") : "",
    Observações: a.type === "no_sale" ? (a.reason_other_text ?? "") : (a.notes ?? ""),

  })), [data, reps, reasons, storesMap]);

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
    XLSX.writeFile(wb, `bpinfo-atendimentos-${Date.now()}.xlsx`);
  };
  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text("BPInfo ERP — Atendimentos", 14, 15);
    doc.setFontSize(10); doc.text(`Período: ${label} — ${start.toLocaleDateString("pt-BR")} a ${end.toLocaleDateString("pt-BR")}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [Object.keys(rows[0] ?? { Data: "", Hora: "", Loja: "", Vendedora: "", Tipo: "", Motivo: "", Observações: "" })],
      body: rows.map((r) => Object.values(r).map(String)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 30, 66] },
    });
    doc.save(`bpinfo-atendimentos-${Date.now()}.pdf`);
  };

  return (
    <div>
      <StoreFilter storeId={storeId} setStoreId={setStoreId} stores={stores} />
      <DateRangeBar preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />
      <div className="mb-6 rounded-2xl bg-card p-5 shadow-sm">
        <p className="text-lg">Total de registros: <span className="font-bold">{rows.length}</span></p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={exportXlsx} disabled={rows.length === 0}
          className="flex items-center gap-2 rounded-xl bg-success px-6 py-4 text-lg font-bold text-success-foreground shadow disabled:opacity-50">
          <Download /> Excel (.xlsx)
        </button>
        <button onClick={exportPdf} disabled={rows.length === 0}
          className="flex items-center gap-2 rounded-xl bg-destructive px-6 py-4 text-lg font-bold text-destructive-foreground shadow disabled:opacity-50">
          <Download /> PDF
        </button>
      </div>
    </div>
  );
}

// ------------ Breaks tab ------------

type BreakRec = {
  id: string;
  sales_rep_id: string;
  store_id: string | null;
  break_type: "lunch" | "off";
  reason: string | null;
  started_at: string;
  ended_at: string | null;
};

function formatDuration(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function BreaksTab() {
  const [preset, setPreset] = useState<Preset>("hoje");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [storeId, setStoreId] = useState<string>(ALL_STORES);
  const { stores } = useStores();
  const { start, end } = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);
  const [data, setData] = useState<BreakRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [reps, setReps] = useState<{ id: string; name: string; store_id: string | null }[]>([]);

  useEffect(() => {
    supabase.from("sales_reps").select("id,name,store_id").then(({ data }) => setReps(data ?? []));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    let q = supabase
      .from("rep_breaks")
      .select("id,sales_rep_id,store_id,break_type,reason,started_at,ended_at")
      .gte("started_at", start.toISOString())
      .lte("started_at", end.toISOString())
      .order("started_at", { ascending: false });
    if (storeId !== ALL_STORES) q = q.eq("store_id", storeId);
    q.then(({ data }) => {
      if (!alive) return;
      setData((data as BreakRec[]) ?? []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [start.getTime(), end.getTime(), storeId]);

  const repName = (id: string) => reps.find((r) => r.id === id)?.name ?? "—";
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "—";

  const now = Date.now();
  // "Fora horário de trabalho" não conta nas métricas — é ausência esperada, não pausa.
  const countable = data.filter((b) => b.reason !== "Fora horário de trabalho");
  const withDuration = countable.map((b) => {
    const endMs = b.ended_at ? new Date(b.ended_at).getTime() : now;
    const mins = Math.max(0, Math.floor((endMs - new Date(b.started_at).getTime()) / 60000));
    return { ...b, minutes: mins };
  });

  const totalLunch = withDuration.filter((b) => b.break_type === "lunch").length;
  const totalOff = withDuration.filter((b) => b.break_type === "off").length;
  const totalMinsLunch = withDuration.filter((b) => b.break_type === "lunch").reduce((s, b) => s + b.minutes, 0);
  const totalMinsOff = withDuration.filter((b) => b.break_type === "off").reduce((s, b) => s + b.minutes, 0);

  // Per rep aggregation
  const perRep = useMemo(() => {
    const map = new Map<string, { name: string; count: number; totalMin: number; lunchMin: number; offMin: number; reasons: Record<string, number> }>();
    for (const b of withDuration) {
      const cur = map.get(b.sales_rep_id) ?? {
        name: repName(b.sales_rep_id),
        count: 0, totalMin: 0, lunchMin: 0, offMin: 0, reasons: {},
      };
      cur.count++;
      cur.totalMin += b.minutes;
      if (b.break_type === "lunch") cur.lunchMin += b.minutes;
      else cur.offMin += b.minutes;
      const key = b.reason ?? (b.break_type === "lunch" ? "Almoço" : "Fora");
      cur.reasons[key] = (cur.reasons[key] ?? 0) + 1;
      map.set(b.sales_rep_id, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.totalMin - a.totalMin);
  }, [withDuration, reps]);

  // Reason breakdown
  const reasonBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of withDuration) {
      const key = b.reason ?? (b.break_type === "lunch" ? "Almoço" : "Fora");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, qtd]) => ({ name, qtd })).sort((a, b) => b.qtd - a.qtd);
  }, [withDuration]);

  return (
    <div>
      <StoreFilter storeId={storeId} setStoreId={setStoreId} stores={stores} />
      <DateRangeBar preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi title="Saídas (fora)" value={totalOff} accent="destructive" />
        <Kpi title="Tempo fora" value={formatDuration(totalMinsOff)} accent="destructive" />
        <Kpi title="Almoços" value={totalLunch} accent="brand" />
        <Kpi title="Tempo almoço" value={formatDuration(totalMinsLunch)} accent="brand" />
      </div>

      {loading && <p className="mt-6 text-center text-muted-foreground">Carregando…</p>}

      <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold">Motivos de saída</h3>
        {reasonBreakdown.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma pausa no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={reasonBreakdown} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="qtd" fill="var(--color-brand)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold">Por vendedora</h3>
        {perRep.length === 0 ? (
          <p className="text-muted-foreground">Sem dados no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Vendedora</th>
                  <th className="px-3 py-2 text-right">Saídas</th>
                  <th className="px-3 py-2 text-right">Tempo almoço</th>
                  <th className="px-3 py-2 text-right">Tempo fora</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Principais motivos</th>
                </tr>
              </thead>
              <tbody>
                {perRep.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-3 font-semibold">{r.name}</td>
                    <td className="px-3 py-3 text-right">{r.count}</td>
                    <td className="px-3 py-3 text-right">{formatDuration(r.lunchMin)}</td>
                    <td className="px-3 py-3 text-right">{formatDuration(r.offMin)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatDuration(r.totalMin)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {Object.entries(r.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3)
                        .map(([k, v]) => `${k} (${v})`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold">Histórico</h3>
        {withDuration.length === 0 ? (
          <p className="text-muted-foreground">Sem pausas no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Início</th>
                  <th className="px-3 py-2">Vendedora</th>
                  <th className="px-3 py-2">Loja</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2 text-right">Duração</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {withDuration.slice(0, 200).map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(b.started_at).toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 font-semibold">{repName(b.sales_rep_id)}</td>
                    <td className="px-3 py-2">{storeName(b.store_id)}</td>
                    <td className="px-3 py-2">
                      {b.break_type === "lunch"
                        ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Almoço</span>
                        : <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">Fora</span>}
                    </td>
                    <td className="px-3 py-2">{b.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatDuration(b.minutes)}</td>
                    <td className="px-3 py-2">
                      {b.ended_at
                        ? <span className="text-xs text-muted-foreground">Encerrada</span>
                        : <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">Em curso</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ------------ Users (admin credentials) ------------

type AdminUser = { id: string; username: string; created_at: string; updated_at: string };

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editUser, setEditUser] = useState("");
  const [editPass, setEditPass] = useState("");

  const actor = getAdminActor();

  const load = async () => {
    if (!actor) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list", {
      _actor: actor.user,
      _actor_password: actor.pass,
    });
    setLoading(false);
    if (error) { toast.error("Erro ao carregar usuários"); return; }
    setUsers((data ?? []) as AdminUser[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const create = async () => {
    if (!actor) return;
    if (!newUser.trim() || newPass.length < 4) {
      toast.error("Usuário e senha (mínimo 4 caracteres) obrigatórios");
      return;
    }
    const { error } = await supabase.rpc("admin_create", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _username: newUser.trim(),
      _password: newPass,
    });
    if (error) { toast.error("Erro ao criar usuário"); return; }
    toast.success("Usuário criado");
    setNewUser(""); setNewPass(""); setShowNew(false);
    load();
  };

  const save = async () => {
    if (!actor || !editing) return;
    const newName = editUser.trim();
    const newPwd = editPass;
    if (!newName && !newPwd) { setEditing(null); return; }
    if (newPwd && newPwd.length < 4) { toast.error("Senha muito curta"); return; }
    const { error } = await supabase.rpc("admin_update", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _id: editing.id,
      _new_username: newName || (null as unknown as string),
      _new_password: newPwd || (null as unknown as string),
    });
    if (error) { toast.error("Erro ao salvar"); return; }
    toast.success("Usuário atualizado");
    setEditing(null); setEditUser(""); setEditPass("");
    load();
  };

  const remove = async (u: AdminUser) => {
    if (!actor) return;
    if (u.username === actor.user) { toast.error("Você não pode excluir seu próprio usuário"); return; }
    if (!confirm(`Excluir o usuário "${u.username}"?`)) return;
    const { error } = await supabase.rpc("admin_delete", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _id: u.id,
    });
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Usuário excluído");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Usuários administradores</h2>
          <p className="text-sm text-muted-foreground">Quem pode acessar o painel de administração.</p>
        </div>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-foreground"
        >
          <Plus size={18} /> Novo usuário
        </button>
      </div>

      {showNew && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-semibold">Criar novo usuário</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold">Usuário</label>
              <input value={newUser} onChange={(e) => setNewUser(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold">Senha</label>
              <input type="text" value={newPass} onChange={(e) => setNewPass(e.target.value)}
                placeholder="mínimo 4 caracteres"
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={create} className="rounded-xl bg-brand px-4 py-2 font-semibold text-brand-foreground">Salvar</button>
            <button onClick={() => { setShowNew(false); setNewUser(""); setNewPass(""); }}
              className="rounded-xl border border-border px-4 py-2 font-semibold">Cancelar</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Carregando...</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">Nenhum usuário cadastrado.</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-sm">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Criado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">
                    {u.username}
                    {actor && u.username === actor.user && (
                      <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">você</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setEditing(u); setEditUser(u.username); setEditPass(""); }}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        onClick={() => remove(u)}
                        disabled={!!actor && u.username === actor.user}
                        className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold">Editar {editing.username}</h3>
            <label className="mb-1 block text-sm font-semibold">Usuário</label>
            <input value={editUser} onChange={(e) => setEditUser(e.target.value)}
              className="mb-4 w-full rounded-xl border-2 border-border bg-background px-4 py-2.5" />
            <label className="mb-1 block text-sm font-semibold">Nova senha</label>
            <input type="text" value={editPass} onChange={(e) => setEditPass(e.target.value)}
              placeholder="deixe em branco para manter a atual"
              className="mb-4 w-full rounded-xl border-2 border-border bg-background px-4 py-2.5" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)}
                className="rounded-xl border border-border px-4 py-2 font-semibold">Cancelar</button>
              <button onClick={save}
                className="rounded-xl bg-brand px-4 py-2 font-semibold text-brand-foreground">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
