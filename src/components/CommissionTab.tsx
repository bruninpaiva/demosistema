import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Download,
  Search,
  Settings as SettingsIcon,
  Target,
  Trophy,
  Printer,
  FileText,
  X,
  Users,
  Package,
  Award,
  Medal,
  Lock,
  Unlock,
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Store as StoreIcon,
  Plus,
  History,
  ChevronRight,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAdminActor } from "@/routes/admin";

/* ============================================================
   Utilities: header normalization + BR number parsing
   ============================================================ */
function norm(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const FIELDS = {
  NOME: "DESCRICAO",
  BRUTO: "TOTAL BRUTO",
  LIQUIDO: "TOTAL LIQUIDO",
  DESC_PCT: "DESC %",
  DESCONTO: "DESCONTO",
  VENDAS: "NUMERO DE VENDAS",
  VENDAS_COM: "NUMERO DE VENDAS COM CADASTRO",
  VENDAS_SEM: "NUMERO VENDAS SEM CADASTRO",
  CONSENT: "NUMERO DE CONSENTIMENTOS",
  UNI: "TOTAL UNI",
  TM: "TM",
  PA: "PA",
  PM: "PM",
} as const;

const ALIASES: Record<string, string> = {
  DESCRICAO: FIELDS.NOME, "DESCRIÇÃO": FIELDS.NOME, NOME: FIELDS.NOME, VENDEDOR: FIELDS.NOME, VENDEDORA: FIELDS.NOME,
  "TOTAL BRUTO": FIELDS.BRUTO, "VENDA BRUTA": FIELDS.BRUTO,
  "TOTAL LIQUIDO": FIELDS.LIQUIDO, "TOTAL LÍQUIDO": FIELDS.LIQUIDO, "VENDA LIQUIDA": FIELDS.LIQUIDO, "VENDA LÍQUIDA": FIELDS.LIQUIDO,
  "DESC %": FIELDS.DESC_PCT, "DESC%": FIELDS.DESC_PCT, "DESCONTO %": FIELDS.DESC_PCT, "% DESCONTO": FIELDS.DESC_PCT,
  DESCONTO: FIELDS.DESCONTO, "TOTAL DESCONTO": FIELDS.DESCONTO,
  "NUMERO DE VENDAS": FIELDS.VENDAS, "NÚMERO DE VENDAS": FIELDS.VENDAS, "N VENDAS": FIELDS.VENDAS, "QTD VENDAS": FIELDS.VENDAS,
  "NUMERO DE VENDAS COM CADASTRO": FIELDS.VENDAS_COM, "NÚMERO DE VENDAS COM CADASTRO": FIELDS.VENDAS_COM, "VENDAS COM CADASTRO": FIELDS.VENDAS_COM,
  "NUMERO VENDAS SEM CADASTRO": FIELDS.VENDAS_SEM, "NÚMERO VENDAS SEM CADASTRO": FIELDS.VENDAS_SEM, "NUMERO DE VENDAS SEM CADASTRO": FIELDS.VENDAS_SEM, "VENDAS SEM CADASTRO": FIELDS.VENDAS_SEM,
  "NUMERO DE CONSENTIMENTOS": FIELDS.CONSENT, "NÚMERO DE CONSENTIMENTOS": FIELDS.CONSENT, CONSENTIMENTOS: FIELDS.CONSENT,
  "TOTAL UNI": FIELDS.UNI, "TOTAL UNIDADES": FIELDS.UNI, UNIDADES: FIELDS.UNI, PECAS: FIELDS.UNI, "PEÇAS": FIELDS.UNI,
  TM: FIELDS.TM, "TICKET MEDIO": FIELDS.TM, "TICKET MÉDIO": FIELDS.TM,
  PA: FIELDS.PA,
  PM: FIELDS.PM, "PRECO MEDIO": FIELDS.PM, "PREÇO MÉDIO": FIELDS.PM,
};

const REQUIRED = [
  FIELDS.NOME, FIELDS.BRUTO, FIELDS.LIQUIDO, FIELDS.DESC_PCT, FIELDS.DESCONTO,
  FIELDS.VENDAS, FIELDS.VENDAS_COM, FIELDS.VENDAS_SEM, FIELDS.CONSENT,
  FIELDS.UNI, FIELDS.TM, FIELDS.PA, FIELDS.PM,
];

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/R\$\s?/gi, "").replace(/%/g, "").replace(/\s/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = (n: number, d = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const INT = (n: number) => Math.round(n).toLocaleString("pt-BR");
const PCT = (n: number, d = 1) => `${NUM(n, d)}%`;

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/* Premiação por atingimento de metas da loja (não cumulativa — apenas a maior) */
const PREMIO_META = 150;
const PREMIO_SUPER = 200;
const PREMIO_HIPER = 250;

type PremioInfo = { valor: number; nivel: "hiper" | "super" | "meta" | "nenhum"; motivo: string };

function premioForHits(hitMeta: boolean, hitSuper: boolean, hitHiper: boolean): PremioInfo {
  if (hitHiper) return { valor: PREMIO_HIPER, nivel: "hiper", motivo: "Hiper Meta atingida" };
  if (hitSuper) return { valor: PREMIO_SUPER, nivel: "super", motivo: "Super Meta atingida" };
  if (hitMeta)  return { valor: PREMIO_META,  nivel: "meta",  motivo: "Meta atingida" };
  return { valor: 0, nivel: "nenhum", motivo: "Meta não atingida" };
}

type Row = Record<string, unknown>;

type Vendedora = {
  nome: string;
  bruto: number;
  liquido: number;
  descPct: number;
  desconto: number;
  vendas: number;
  vendasCom: number;
  vendasSem: number;
  consentimentos: number;
  uni: number;
  tm: number;
  pa: number;
  pm: number;
  comissao: number;
};

type Store = { id: string; name: string; active: boolean };

type Comp = {
  id: string;
  store_id: string;
  store_name: string;
  month: number;
  year: number;
  meta_amount: number;
  imported_by: string | null;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
};

type Metas = { meta: number; superMeta: number; hiperMeta: number; rate: number };

type LoadedComp = {
  info: Comp;
  metas: Metas;
  vendedoras: Vendedora[];
};

type AdminRole = "admin" | "gerente" | "super_admin";

/* ============================================================
   File parser
   ============================================================ */
function parseFile(file: File): Promise<{ headers: string[]; rows: Row[]; map: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try {
        const data = reader.result as ArrayBuffer;
        const wb = XLSX.read(data, { type: "array", raw: false, cellText: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) { resolve({ headers: [], rows: [], map: {} }); return; }
        // Read as array-of-arrays so we can auto-detect the header row.
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false, blankrows: false }) as unknown[][];
        if (!aoa.length) { resolve({ headers: [], rows: [], map: {} }); return; }

        // Find the row that contains the most recognized column aliases.
        let bestIdx = 0;
        let bestScore = -1;
        const scanLimit = Math.min(aoa.length, 25);
        for (let i = 0; i < scanLimit; i++) {
          const row = aoa[i] ?? [];
          let score = 0;
          for (const cell of row) {
            const key = ALIASES[norm(String(cell ?? ""))];
            if (key) score++;
          }
          if (score > bestScore) { bestScore = score; bestIdx = i; }
        }
        if (bestScore <= 0) {
          reject(new Error("Não foi possível identificar as colunas da planilha. Verifique se contém DESCRICAO, TOTAL LIQUIDO, etc."));
          return;
        }

        const rawHeaders: string[] = (aoa[bestIdx] ?? []).map((h, i) => {
          const s = String(h ?? "").trim();
          return s || `__col_${i}`;
        });
        const rows: Row[] = [];
        for (let i = bestIdx + 1; i < aoa.length; i++) {
          const arr = aoa[i] ?? [];
          if (!arr.length) continue;
          const obj: Row = {};
          let hasVal = false;
          for (let c = 0; c < rawHeaders.length; c++) {
            const v = arr[c];
            obj[rawHeaders[c]] = v ?? "";
            if (v != null && String(v).trim() !== "") hasVal = true;
          }
          if (hasVal) rows.push(obj);
        }
        const map: Record<string, string> = {};
        for (const h of rawHeaders) {
          const key = ALIASES[norm(h)];
          if (key) map[h] = key;
        }
        resolve({ headers: rawHeaders, rows, map });
      } catch (e) { reject(e); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function isTotalRow(nome: string): boolean {
  const n = norm(nome);
  return !n || n === "TOTAL" || n.startsWith("TOTAL ") || n.startsWith("TOTAIS") || n.includes("SUBTOTAL") || n.includes("SOMA") || n.startsWith("LOJA ");
}

function rowsToVendedoras(rows: Row[], map: Record<string, string>, rate: number): Vendedora[] {
  const reverse: Record<string, string> = {};
  for (const [rawH, key] of Object.entries(map)) reverse[key] = rawH;
  const get = (row: Row, key: string) => (reverse[key] ? row[reverse[key]] : "");
  const out: Vendedora[] = [];
  for (const r of rows) {
    const nome = String(get(r, FIELDS.NOME) ?? "").trim();
    if (!nome || isTotalRow(nome)) continue;
    const liquido = toNum(get(r, FIELDS.LIQUIDO));
    out.push({
      nome,
      bruto: toNum(get(r, FIELDS.BRUTO)),
      liquido,
      descPct: toNum(get(r, FIELDS.DESC_PCT)),
      desconto: toNum(get(r, FIELDS.DESCONTO)),
      vendas: toNum(get(r, FIELDS.VENDAS)),
      vendasCom: toNum(get(r, FIELDS.VENDAS_COM)),
      vendasSem: toNum(get(r, FIELDS.VENDAS_SEM)),
      consentimentos: toNum(get(r, FIELDS.CONSENT)),
      uni: toNum(get(r, FIELDS.UNI)),
      tm: toNum(get(r, FIELDS.TM)),
      pa: toNum(get(r, FIELDS.PA)),
      pm: toNum(get(r, FIELDS.PM)),
      comissao: liquido * (rate / 100),
    });
  }
  return out;
}

/* ============================================================
   BRL input formatter
   ============================================================ */
function formatBRLInput(digitsOnly: string): string {
  if (!digitsOnly) return "";
  const cents = parseInt(digitsOnly, 10) || 0;
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseBRLInput(formatted: string): number {
  const digits = formatted.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

/* ============================================================
   Main component
   ============================================================ */
export default function CommissionTab({ autoOpenImportId }: { autoOpenImportId?: string } = {}) {
  const [actorRole, setActorRole] = useState<AdminRole | null>(null);
  const [actorStoreId, setActorStoreId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [history, setHistory] = useState<Comp[]>([]);
  const [loaded, setLoaded] = useState<LoadedComp | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const autoOpenedRef = useRef<string | null>(null);

  const actor = getAdminActor();

  // Detect actor role & store, and load stores + history
  useEffect(() => {
    if (!actor) return;
    (async () => {
      const { data } = await supabase.rpc("verify_admin_user" as never, {
        _email: actor.user, _password: actor.pass,
      } as never);
      const arr = (data as unknown as { role: AdminRole; store_id: string | null }[]) || [];
      if (arr[0]) {
        setActorRole(arr[0].role);
        setActorStoreId(arr[0].store_id);
      } else {
        // Legacy admin_users record without role — assume admin
        setActorRole("admin");
      }
      const { data: s } = await supabase.from("stores").select("id,name,active").eq("active", true).order("name");
      setStores((s ?? []) as Store[]);
      await reloadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadHistory = useCallback(async () => {
    if (!actor) return;
    const { data, error } = await supabase.rpc("list_commission_imports" as never, {
      _actor: actor.user, _actor_password: actor.pass,
    } as never);
    if (error) { toast.error("Falha ao carregar histórico"); return; }
    setHistory((data as unknown as Comp[]) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openComp = useCallback(async (id: string) => {
    if (!actor) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("get_commission_full" as never, {
        _actor: actor.user, _actor_password: actor.pass, _import_id: id,
      } as never);
      if (error) throw error;
      const payload = data as unknown as { import: Comp & { commission_config: Metas }; rows: Vendedora[] };
      const cfg = (payload.import.commission_config ?? {}) as Partial<Metas>;
      const metas: Metas = {
        meta: Number(payload.import.meta_amount) || 0,
        superMeta: Number(cfg.superMeta) || 0,
        hiperMeta: Number(cfg.hiperMeta) || 0,
        rate: Number(cfg.rate) || 2.5,
      };
      const vend = (payload.rows ?? []).map((r) => ({
        ...r,
        bruto: Number(r.bruto) || 0,
        liquido: Number(r.liquido) || 0,
        descPct: Number(r.descPct) || 0,
        desconto: Number(r.desconto) || 0,
        vendas: Number(r.vendas) || 0,
        vendasCom: Number(r.vendasCom) || 0,
        vendasSem: Number(r.vendasSem) || 0,
        consentimentos: Number(r.consentimentos) || 0,
        uni: Number(r.uni) || 0,
        tm: Number(r.tm) || 0,
        pa: Number(r.pa) || 0,
        pm: Number(r.pm) || 0,
        comissao: (Number(r.liquido) || 0) * (metas.rate / 100),
      }));
      const storeName =
        payload.import.store_name ??
        stores.find((s) => s.id === payload.import.store_id)?.name ??
        history.find((h) => h.id === payload.import.id)?.store_name ??
        "Loja";
      setLoaded({ info: { ...payload.import, store_name: storeName }, metas, vendedoras: vend });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao abrir competência");
    } finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, history]);

  useEffect(() => {
    if (!autoOpenImportId || actorRole === null) return;
    if (autoOpenedRef.current === autoOpenImportId) return;
    autoOpenedRef.current = autoOpenImportId;
    openComp(autoOpenImportId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenImportId, actorRole]);

  const deleteComp = useCallback(async (id: string) => {
    if (!actor) return;
    const c = history.find((h) => h.id === id);
    const label = c ? `${c.store_name} — ${MESES[c.month - 1]}/${c.year}` : "esta competência";
    if (!confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return;
    try {
      const { error } = await supabase.rpc("delete_commission_import" as never, {
        _actor: actor.user, _actor_password: actor.pass, _import_id: id,
      } as never);
      if (error) throw error;
      toast.success("Competência excluída");
      await reloadHistory();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, history]);

  if (!actor) return <div className="p-8 text-muted-foreground">Faça login para acessar Comissão.</div>;
  if (actorRole === null) return <div className="p-8 text-muted-foreground">Carregando…</div>;

  const isGlobalAdmin = actorRole === "admin" || actorRole === "super_admin";
  const visibleStores = isGlobalAdmin ? stores : stores.filter((s) => s.id === actorStoreId);

  if (loaded) {
    return (
      <WorkView
        loaded={loaded}
        setLoaded={setLoaded}
        actor={actor}
        actorRole={actorRole}
        onBack={() => { setLoaded(null); reloadHistory(); }}
        onReload={openComp}
      />
    );
  }

  if (showNewForm) {
    return (
      <NewCompForm
        actor={actor}
        stores={visibleStores}
        defaultStoreId={actorRole === "gerente" ? actorStoreId : null}
        onCancel={() => setShowNewForm(false)}
        onCreated={async (id) => { setShowNewForm(false); await reloadHistory(); await openComp(id); }}
        history={history}
      />
    );
  }


  return (
    <SelectorView
      history={history}
      stores={visibleStores}
      onNew={() => setShowNewForm(true)}
      onOpen={openComp}
      onDelete={isGlobalAdmin ? deleteComp : undefined}
      busy={busy}
      actorRole={actorRole}
    />
  );
}

/* ============================================================
   Selector — pick existing competência or create new
   ============================================================ */
function SelectorView({
  history, stores, onNew, onOpen, onDelete, busy, actorRole,
}: {
  history: Comp[];
  stores: Store[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  busy: boolean;
  actorRole: AdminRole;
}) {
  const [storeFilter, setStoreFilter] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>("");

  const years = useMemo(() => Array.from(new Set(history.map((h) => h.year))).sort((a, b) => b - a), [history]);
  const filtered = useMemo(() => {
    return history.filter((h) => (!storeFilter || h.store_id === storeFilter) && (!yearFilter || String(h.year) === yearFilter));
  }, [history, storeFilter, yearFilter]);

  // Group by store → year → months
  const grouped = useMemo(() => {
    const g: Record<string, Record<number, Comp[]>> = {};
    for (const h of filtered) {
      g[h.store_name] ??= {};
      g[h.store_name][h.year] ??= [];
      g[h.store_name][h.year].push(h);
    }
    return g;
  }, [filtered]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-3 text-3xl font-bold text-brand">
            <Target size={30} /> Comissão por Competência
          </h2>
          <p className="mt-1 text-muted-foreground">Selecione uma competência existente ou inicie uma nova.</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-white shadow-sm hover:bg-brand/90"
        >
          <Plus size={20} /> Nova competência
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2">
          <option value="">Todas as lojas</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2">
          <option value="">Todos os anos</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {(storeFilter || yearFilter) && (
          <button onClick={() => { setStoreFilter(""); setYearFilter(""); }} className="text-sm text-muted-foreground underline">Limpar</button>
        )}
      </div>

      {/* History grouped */}
      {busy && <div className="text-muted-foreground">Abrindo…</div>}

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <History className="mx-auto mb-3 text-muted-foreground" size={40} />
          <p className="text-lg font-semibold">Nenhuma competência encontrada</p>
          <p className="mt-1 text-muted-foreground">Clique em "Nova competência" para começar.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([storeName, byYear]) => (
            <div key={storeName} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-lg font-bold text-brand">
                <StoreIcon size={18} /> {storeName}
              </div>
              <div className="space-y-4">
                {Object.entries(byYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, comps]) => (
                  <div key={year}>
                    <div className="mb-2 text-sm font-semibold text-muted-foreground">{year}</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                      {comps.sort((a, b) => a.month - b.month).map((c) => (
                        <div
                          key={c.id}
                          className={`group relative flex flex-col rounded-lg border transition hover:border-brand hover:shadow-md ${
                            c.closed_at ? "border-emerald-300 bg-emerald-50" : "border-border bg-background"
                          }`}
                        >
                          <button
                            onClick={() => onOpen(c.id)}
                            className="flex flex-col items-start gap-1 px-3 py-3 text-left"
                          >
                            <div className="flex w-full items-center justify-between">
                              <span className="font-semibold">{MESES[c.month - 1]}</span>
                              {c.closed_at ? <Lock size={14} className="text-emerald-600" /> : <Unlock size={14} className="text-amber-500" />}
                            </div>
                            <span className="text-xs text-muted-foreground">Meta: {BRL(Number(c.meta_amount))}</span>
                            <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:text-brand" />
                          </button>
                          {onDelete && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                              title="Excluir competência"
                              className="absolute right-1 top-1 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-red-100 hover:text-red-600 group-hover:opacity-100"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   New competência form — Loja, Mês, Ano, Metas
   ============================================================ */
function NewCompForm({
  actor, stores, defaultStoreId, onCancel, onCreated, history,
}: {
  actor: { user: string; pass: string };
  stores: Store[];
  defaultStoreId: string | null;
  onCancel: () => void;
  onCreated: (id: string) => void;
  history: Comp[];
}) {
  const now = new Date();
  const [storeId, setStoreId] = useState<string>(defaultStoreId ?? stores[0]?.id ?? "");
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [metaTxt, setMetaTxt] = useState("");
  const [superTxt, setSuperTxt] = useState("");
  const [hiperTxt, setHiperTxt] = useState("");
  const [rate, setRate] = useState(2.5);
  const [saving, setSaving] = useState(false);

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  const existing = history.find((h) => h.store_id === storeId && h.month === month && h.year === year);

  const submit = async () => {
    const meta = parseBRLInput(metaTxt);
    const superMeta = parseBRLInput(superTxt);
    const hiperMeta = parseBRLInput(hiperTxt);
    if (!storeId) return toast.error("Selecione uma loja");
    if (meta <= 0) return toast.error("Informe a Meta Mensal");
    if (superMeta && superMeta < meta) return toast.error("Super Meta deve ser maior ou igual à Meta");
    if (hiperMeta && hiperMeta < superMeta) return toast.error("Hiper Meta deve ser maior ou igual à Super Meta");
    if (existing) return toast.error("Já existe uma competência para essa loja/mês/ano — abra pelo histórico.");
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("save_commission_import" as never, {
        _actor: actor.user, _actor_password: actor.pass,
        _store_id: storeId, _month: month, _year: year,
        _meta: meta,
        _config: { superMeta, hiperMeta, rate } as unknown as never,
        _rows: [] as unknown as never,
      } as never);
      if (error) throw error;
      toast.success("Competência criada. Importe a planilha em seguida.");
      onCreated(data as unknown as string);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao criar competência");
    } finally { setSaving(false); }
  };

  const BRLField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div>
      <label className="mb-1 block text-sm font-semibold">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(formatBRLInput(e.target.value.replace(/\D/g, "")))}
          placeholder="0,00"
          className="w-full rounded-lg border border-border py-3 pl-10 pr-3 text-lg outline-none focus:ring-2 focus:ring-brand"
        />
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button onClick={onCancel} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-6 flex items-center gap-2 text-2xl font-bold text-brand">
          <Plus size={22} /> Nova competência
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="mb-1 block text-sm font-semibold">Loja</label>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-3">
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Mês</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-3">
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Ano</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-3">
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Comissão (%)</label>
            <input
              type="number" min={0} step={0.1} value={rate}
              onChange={(e) => setRate(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-border bg-background px-3 py-3"
            />
          </div>
        </div>

        {existing && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Já existe uma competência para {MESES[month - 1]}/{year} nessa loja. Volte e abra pelo histórico.
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {BRLField({ label: "Meta Mensal", value: metaTxt, onChange: setMetaTxt })}
          {BRLField({ label: "Super Meta", value: superTxt, onChange: setSuperTxt })}
          {BRLField({ label: "Hiper Meta", value: hiperTxt, onChange: setHiperTxt })}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving || !!existing}
            className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Criar competência"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Working view — dashboard, upload, table, ranking, close, export
   ============================================================ */
function WorkView({
  loaded, setLoaded, actor, actorRole, onBack, onReload,
}: {
  loaded: LoadedComp;
  setLoaded: (l: LoadedComp) => void;
  actor: { user: string; pass: string };
  actorRole: AdminRole;
  onBack: () => void;
  onReload: (id: string) => void;
}) {
  const { info, metas, vendedoras } = loaded;
  const isClosed = !!info.closed_at;
  const canFinance = actorRole === "admin" || actorRole === "super_admin";
  const inputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof Vendedora>("liquido");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const perPage = 15;
  const [detail, setDetail] = useState<Vendedora | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const t = vendedoras.reduce((a, v) => {
      a.bruto += v.bruto; a.liquido += v.liquido; a.vendas += v.vendas; a.uni += v.uni;
      a.desconto += v.desconto; a.comissao += v.comissao; a.cadastros += v.vendasCom; a.consent += v.consentimentos;
      return a;
    }, { bruto: 0, liquido: 0, vendas: 0, uni: 0, desconto: 0, comissao: 0, cadastros: 0, consent: 0 });
    const tm = t.vendas ? t.liquido / t.vendas : 0;
    const pa = t.vendas ? t.uni / t.vendas : 0;
    const pm = t.uni ? t.liquido / t.uni : 0;
    return { ...t, tm, pa, pm };
  }, [vendedoras]);

  const pctMeta = metas.meta ? (totals.liquido / metas.meta) * 100 : 0;
  const pctSuper = metas.superMeta ? (totals.liquido / metas.superMeta) * 100 : 0;
  const pctHiper = metas.hiperMeta ? (totals.liquido / metas.hiperMeta) * 100 : 0;
  const hitMeta = metas.meta > 0 && totals.liquido >= metas.meta;
  const hitSuper = metas.superMeta > 0 && totals.liquido >= metas.superMeta;
  const hitHiper = metas.hiperMeta > 0 && totals.liquido >= metas.hiperMeta;

  const premio = useMemo(() => premioForHits(hitMeta, hitSuper, hitHiper), [hitMeta, hitSuper, hitHiper]);
  const premioTotal = premio.valor * vendedoras.length;
  const comissaoFinalTotal = totals.comissao + premioTotal;

  const comissaoFinalDe = (v: Vendedora) => v.comissao + premio.valor;

  const ranking = useMemo(() => [...vendedoras].sort((a, b) => b.liquido - a.liquido), [vendedoras]);
  const rankPos = useMemo(() => {
    const m = new Map<string, number>();
    ranking.forEach((v, i) => m.set(v.nome, i + 1));
    return m;
  }, [ranking]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? vendedoras.filter((v) => v.nome.toLowerCase().includes(q)) : [...vendedoras];
    list.sort((a, b) => {
      if (sortKey === ("comissaoFinal" as keyof Vendedora)) {
        const av = a.comissao + premio.valor; const bv = b.comissao + premio.valor;
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "pt-BR")
        : String(bv).localeCompare(String(av), "pt-BR");
    });
    return list;
  }, [vendedoras, search, sortKey, sortDir, premio.valor]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const setSort = (k: keyof Vendedora) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "nome" ? "asc" : "desc"); }
  };

  /* ---------- Upload spreadsheet ---------- */
  const handleFile = async (f?: File) => {
    if (!f) return;
    if (isClosed) { toast.error("Competência fechada — não é possível importar."); return; }
    try {
      const { rows, map } = await parseFile(f);
      const found = new Set(Object.values(map));
      const miss = REQUIRED.filter((k) => !found.has(k));
      if (miss.length) toast.warning(`Colunas ausentes: ${miss.join(", ")}`);
      const vend = rowsToVendedoras(rows, map, metas.rate);
      setSaving(true);
      const rowsPayload = vend.map((v) => ({
        nome: v.nome, bruto: v.bruto, liquido: v.liquido, descPct: v.descPct, desconto: v.desconto,
        vendas: v.vendas, vendasCom: v.vendasCom, vendasSem: v.vendasSem, consentimentos: v.consentimentos,
        uni: v.uni, tm: v.tm, pa: v.pa, pm: v.pm,
      }));
      const { error } = await supabase.rpc("save_commission_import" as never, {
        _actor: actor.user, _actor_password: actor.pass,
        _store_id: info.store_id, _month: info.month, _year: info.year,
        _meta: metas.meta,
        _config: metas as unknown as never,
        _rows: rowsPayload as unknown as never,
      } as never);
      if (error) throw error;
      toast.success(`${vend.length} funcionárias importadas`);
      onReload(info.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar");
    } finally { setSaving(false); }
  };

  /* ---------- Save metas / rate ---------- */
  const saveMetas = async (m: Metas) => {
    if (isClosed) return;
    setSaving(true);
    try {
      const rowsPayload = vendedoras.map((v) => ({
        nome: v.nome, bruto: v.bruto, liquido: v.liquido, descPct: v.descPct, desconto: v.desconto,
        vendas: v.vendas, vendasCom: v.vendasCom, vendasSem: v.vendasSem, consentimentos: v.consentimentos,
        uni: v.uni, tm: v.tm, pa: v.pa, pm: v.pm,
      }));
      const { error } = await supabase.rpc("save_commission_import" as never, {
        _actor: actor.user, _actor_password: actor.pass,
        _store_id: info.store_id, _month: info.month, _year: info.year,
        _meta: m.meta,
        _config: m as unknown as never,
        _rows: rowsPayload as unknown as never,
      } as never);
      if (error) throw error;
      toast.success("Metas atualizadas");
      setShowSettings(false);
      onReload(info.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar");
    } finally { setSaving(false); }
  };

  /* ---------- Close / reopen ---------- */
  const closeComp = async () => {
    if (!confirm(`Fechar a competência de ${MESES[info.month - 1]}/${info.year}?\nApós fechada, ela ficará bloqueada.`)) return;
    const { error } = await supabase.rpc("close_commission_import" as never, {
      _actor: actor.user, _actor_password: actor.pass, _import_id: info.id,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Competência fechada");
    onReload(info.id);
  };
  const reopenComp = async () => {
    if (!confirm("Reabrir competência para edição?")) return;
    const { error } = await supabase.rpc("reopen_commission_import" as never, {
      _actor: actor.user, _actor_password: actor.pass, _import_id: info.id,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Competência reaberta");
    onReload(info.id);
  };

  /* ---------- Export ---------- */
  const fileBase = `comissoes_${info.store_name.replace(/\s+/g, "_")}_${info.year}-${String(info.month).padStart(2, "0")}`;

  const nivelLabel = premio.nivel === "hiper" ? "Hiper Meta" : premio.nivel === "super" ? "Super Meta" : premio.nivel === "meta" ? "Meta" : "—";
  const metaGoals = [
    { label: "Meta", value: metas.meta, pct: pctMeta, hit: hitMeta, reward: PREMIO_META, tone: "bg-emerald-500" },
    { label: "Super", value: metas.superMeta, pct: pctSuper, hit: hitSuper, reward: PREMIO_SUPER, tone: "bg-indigo-500" },
    { label: "Hiper", value: metas.hiperMeta, pct: pctHiper, hit: hitHiper, reward: PREMIO_HIPER, tone: "bg-fuchsia-500" },
  ].filter((goal) => goal.value > 0);
  const nextGoal = metaGoals.find((goal) => !goal.hit) ?? metaGoals[metaGoals.length - 1];
  const highestGoal = metaGoals[metaGoals.length - 1]?.value ?? metas.meta;
  const trackPct = highestGoal > 0 ? Math.min(100, (totals.liquido / highestGoal) * 100) : 0;

  const exportExcel = () => {
    const data = ranking.map((v, i) => {
      const base: Record<string, unknown> = {
        Posição: i + 1, Nome: v.nome,
        "Nº Vendas": v.vendas, "Peças": v.uni, "Ticket Médio": v.tm,
        PA: v.pa, "Preço Médio": v.pm, Cadastros: v.vendasCom, Consentimentos: v.consentimentos,
      };
      if (canFinance) {
        base["Venda Bruta"] = v.bruto; base["Venda Líquida"] = v.liquido;
        base["Comissão Base"] = v.comissao;
        base["Meta Atingida"] = nivelLabel;
        base["Premiação"] = premio.valor;
        base["Comissão Final"] = comissaoFinalDe(v);
        base["Desconto %"] = v.descPct; base["Desconto Total"] = v.desconto;
      }
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comissões");
    if (canFinance) {
      const resumo = [
        ["Loja", info.store_name],
        ["Competência", `${MESES[info.month - 1]}/${info.year}`],
        ["Venda Líquida Loja", totals.liquido],
        ["Meta", metas.meta],
        ["Super Meta", metas.superMeta],
        ["Hiper Meta", metas.hiperMeta],
        ["Nível Atingido", nivelLabel],
        ["Motivo", premio.motivo],
        ["Premiação Individual", premio.valor],
        ["Funcionárias Premiadas", premio.valor > 0 ? vendedoras.length : 0],
        ["Comissão Base Total", totals.comissao],
        ["Premiação Total", premioTotal],
        ["Comissão Final Total", comissaoFinalTotal],
      ];
      const wsR = XLSX.utils.aoa_to_sheet(resumo);
      XLSX.utils.book_append_sheet(wb, wsR, "Resumo");
    }
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  };

  const buildPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`Comissões — ${info.store_name} — ${MESES[info.month - 1]}/${info.year}`, 14, 14);
    doc.setFontSize(10);
    const header = canFinance
      ? `Meta: ${BRL(metas.meta)} • Super: ${BRL(metas.superMeta)} • Hiper: ${BRL(metas.hiperMeta)} • Vendido: ${BRL(totals.liquido)} (${PCT(pctMeta)})`
      : `Vendas: ${INT(totals.vendas)} • Peças: ${INT(totals.uni)} • PA: ${NUM(totals.pa)} • TM: ${BRL(totals.tm)}`;
    doc.text(header, 14, 21);
    if (canFinance) {
      doc.setFontSize(10);
      doc.text(
        `Comissão base: ${BRL(totals.comissao)} • ${premio.valor > 0 ? `Premiação (${nivelLabel}): ${BRL(premio.valor)} × ${vendedoras.length} = ${BRL(premioTotal)}` : "Sem premiação"} • Total: ${BRL(comissaoFinalTotal)}`,
        14, 27,
      );
    }
    const cols = canFinance
      ? ["#", "Nome", "V. Líquida", "Comissão Base", "Meta", "Premiação", "Comissão Final", "Vendas", "Peças", "TM", "PA", "Cad.", "Cons."]
      : ["#", "Nome", "Vendas", "Peças", "TM", "PA", "PM", "Cad.", "Cons."];
    autoTable(doc, {
      startY: canFinance ? 32 : 26,
      head: [cols],
      body: ranking.map((v, i) => canFinance ? [
        i + 1, v.nome, BRL(v.liquido), BRL(v.comissao),
        premio.valor > 0 ? nivelLabel : "—",
        premio.valor > 0 ? BRL(premio.valor) : "—",
        BRL(comissaoFinalDe(v)),
        INT(v.vendas), INT(v.uni), BRL(v.tm), NUM(v.pa), INT(v.vendasCom), INT(v.consentimentos),
      ] : [
        i + 1, v.nome, INT(v.vendas), INT(v.uni), BRL(v.tm), NUM(v.pa), BRL(v.pm), INT(v.vendasCom), INT(v.consentimentos),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 47, 135] },
    });
    if (info.closed_at) {
      const y = (doc as any).lastAutoTable?.finalY ?? 60;
      doc.setFontSize(9);
      doc.text(`Fechado em ${new Date(info.closed_at).toLocaleString("pt-BR")} por ${info.closed_by ?? "—"}`, 14, y + 8);
    }
    return doc;
  };

  const exportPDF = () => {
    buildPDF().save(`${fileBase}.pdf`);
  };

  const printPDF = () => {
    const doc = buildPDF();
    doc.autoPrint();
    const url = doc.output("bloburl");
    const w = window.open(url, "_blank");
    if (!w) { toast.error("Bloqueador de pop-up impediu a impressão"); return; }
  };

  const printRecibos = () => {
    const compLabel = `${MESES[info.month - 1]}/${info.year}`;
    const emitidoEm = new Date().toLocaleString("pt-BR");
    const rate = metas.rate;

    const cards = ranking.map((v, i) => {
      const pos = i + 1;
      const total = comissaoFinalDe(v);
      const finBlock = canFinance ? `
        <div class="row primary"><span>Venda Bruta</span><b>${BRL(v.bruto)}</b></div>
        <div class="row primary"><span>Venda Líquida</span><b class="hl">${BRL(v.liquido)}</b></div>
        <div class="row"><span>Desconto (${NUM(v.descPct)}%)</span><b>${BRL(v.desconto)}</b></div>
      ` : "";
      const payBlock = canFinance ? `
        <div class="pay">
          <div class="pay-title">COMPOSIÇÃO DO PAGAMENTO</div>
          <div class="row"><span>Comissão base (${rate.toFixed(1)}% sobre líquido)</span><b>${BRL(v.comissao)}</b></div>
          ${premio.valor > 0
            ? `<div class="row"><span>Premiação — ${nivelLabel} atingida</span><b class="green">+ ${BRL(premio.valor)}</b></div>`
            : `<div class="row muted"><span>Premiação</span><b>— sem premiação —</b></div>`}
          <div class="row total"><span>Total a receber</span><b class="hl">${BRL(total)}</b></div>
        </div>
      ` : "";
      return `
        <section class="card">
          <header>
            <div class="brand">
              <div class="logo">BPINFO</div>
              <div class="store">${info.store_name}</div>
            </div>
            <div class="comp">
              <div class="lbl">Competência</div>
              <div class="val">${compLabel}</div>
            </div>
          </header>
          <div class="name-row">
            <div class="pos">#${pos}</div>
            <div class="name">${v.nome}</div>
          </div>
          <div class="grid">
            ${finBlock}
            <div class="row"><span>Nº Vendas</span><b>${INT(v.vendas)}</b></div>
            <div class="row"><span>Peças</span><b>${INT(v.uni)}</b></div>
            <div class="row"><span>Ticket Médio</span><b>${BRL(v.tm)}</b></div>
            <div class="row"><span>PA</span><b>${NUM(v.pa)}</b></div>
            <div class="row"><span>Preço Médio</span><b>${BRL(v.pm)}</b></div>
            <div class="row"><span>Cadastros</span><b>${INT(v.vendasCom)}</b></div>
            <div class="row"><span>Consentimentos</span><b>${INT(v.consentimentos)}</b></div>
          </div>
          ${payBlock}
          <footer>
            <div class="sig">
              <div class="line"></div>
              <div class="lbl">Assinatura da vendedora</div>
            </div>
            <div class="meta">Emitido em ${emitidoEm}</div>
          </footer>
        </section>
      `;
    }).join("");

    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Recibos — ${info.store_name} — ${compLabel}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #eef1f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }
  .sheet { max-width: 900px; margin: 0 auto; padding: 16px; }
  .toolbar { display: flex; gap: 8px; justify-content: flex-end; padding: 8px 0 16px; }
  .toolbar button { background: #002F87; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font-weight: 600; cursor: pointer; font-size: 14px; }
  .toolbar button.secondary { background: #fff; color: #002F87; border: 1px solid #002F87; }
  .card { background: #fff; border-radius: 14px; padding: 22px 26px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,0,0,.06); border-top: 6px solid #002F87; page-break-inside: avoid; break-inside: avoid; }
  .card header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo { background: #002F87; color: #fff; font-weight: 800; letter-spacing: 2px; padding: 6px 12px; border-radius: 6px; font-size: 18px; }
  .store { font-size: 14px; color: #4b5563; font-weight: 600; }
  .comp { text-align: right; }
  .comp .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; }
  .comp .val { font-size: 16px; font-weight: 700; color: #002F87; }
  .name-row { display: flex; align-items: center; gap: 14px; margin: 16px 0 14px; }
  .pos { background: #E30613; color: #fff; font-weight: 800; font-size: 16px; padding: 4px 10px; border-radius: 6px; }
  .name { font-size: 20px; font-weight: 800; color: #002F87; text-transform: uppercase; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 14px; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed #e5e7eb; font-size: 13px; }
  .row span { color: #4b5563; }
  .row b { color: #111827; font-weight: 700; }
  .row.primary { background: #f5f7fb; padding: 8px 10px; border-radius: 6px; border: 0; margin-bottom: 2px; }
  .row.primary b { font-size: 15px; }
  .hl { color: #002F87; }
  .green { color: #059669; }
  .muted b { color: #9ca3af; font-weight: 500; }
  .pay { margin-top: 6px; border: 2px solid #002F87; border-radius: 10px; padding: 12px 16px; background: #fafbff; }
  .pay-title { font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #002F87; margin-bottom: 8px; }
  .pay .row.total { border-top: 2px solid #002F87; border-bottom: 0; margin-top: 6px; padding-top: 10px; font-size: 15px; }
  .pay .row.total b { font-size: 18px; }
  footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px; gap: 20px; }
  .sig { flex: 1; max-width: 300px; }
  .sig .line { border-bottom: 1px solid #111827; height: 28px; }
  .sig .lbl { font-size: 10px; color: #6b7280; text-align: center; margin-top: 4px; }
  .meta { font-size: 10px; color: #9ca3af; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { max-width: none; padding: 0; }
    .card { box-shadow: none; margin: 0 0 12px; border: 1px solid #d1d5db; }
    @page { size: A4; margin: 12mm; }
  }
</style></head>
<body>
  <div class="sheet">
    <div class="toolbar">
      <button class="secondary" onclick="window.close()">Fechar</button>
      <button onclick="window.print()">Imprimir</button>
    </div>
    ${cards}
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { toast.error("Bloqueador de pop-up impediu a impressão"); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  /* ---------- Sub-widgets ---------- */
  const MetaProgressTrack = () => (
    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-sm">
        <span className="min-w-0 font-semibold text-foreground">Progresso da meta</span>
        <span className="whitespace-nowrap text-right text-xs text-muted-foreground tabular-nums sm:text-sm">
          {nextGoal ? `${BRL(Math.max(0, nextGoal.value - totals.liquido))} para ${nextGoal.label}` : "Metas não definidas"}
        </span>
      </div>
      <div className="relative h-4 min-w-0 overflow-hidden rounded-full bg-muted">
        <div className="h-4 rounded-full bg-brand" style={{ width: `${trackPct}%` }} />
        {metaGoals.map((goal) => (
          <div
            key={goal.label}
            className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center"
            style={{ left: `${Math.min(100, (goal.value / highestGoal) * 100)}%` }}
          >
            <span className={`h-5 w-1 rounded-full ${goal.hit ? goal.tone : "bg-border"}`} />
          </div>
        ))}
      </div>
      {metaGoals.length === 0 ? (
        <div className="min-w-0 overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground [text-wrap:balance]">
          Configure as metas para acompanhar o progresso.
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          {metaGoals.map((goal) => (
            <div key={goal.label} className={`flex min-w-0 flex-col overflow-hidden rounded-lg border px-2.5 py-2 ${goal.hit ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-border bg-background"}`}>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 text-xs font-bold uppercase text-muted-foreground">{goal.label}</span>
                {goal.hit && <CheckCircle2 size={14} />}
              </div>
              <div className="mt-1 whitespace-nowrap text-base font-extrabold leading-none tabular-nums">{BRL(goal.value)}</div>
              <div className="mt-1 min-w-0 text-xs leading-tight text-muted-foreground tabular-nums">
                <span className="whitespace-nowrap">Prêmio {BRL(goal.reward)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-5 overflow-hidden">
      {/* Header */}
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button onClick={onBack} className="mb-2 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> Voltar
          </button>
          <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-2xl font-bold leading-tight text-brand">
            <StoreIcon className="shrink-0" size={22} />
            <span className="min-w-0 max-w-full truncate">{info.store_name}</span>
            <span className="min-w-0 text-foreground">— {MESES[info.month - 1]}/{info.year}</span>
            {isClosed ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">
                <Lock size={12} /> Fechada
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-700">
                <Unlock size={12} /> Aberta
              </span>
            )}
          </h2>
          {isClosed && info.closed_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              Fechada em {new Date(info.closed_at).toLocaleString("pt-BR")} por {info.closed_by ?? "—"}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap justify-end gap-2">
          {!isClosed && (
            <>
              <button onClick={() => inputRef.current?.click()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand/90 disabled:opacity-50">
                <Upload size={18} /> Importar planilha
              </button>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
              <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 hover:bg-muted">
                <SettingsIcon size={18} /> Metas
              </button>
            </>
          )}
          {vendedoras.length > 0 && (
            <>
              <button onClick={exportExcel} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 hover:bg-muted">
                <Download size={18} /> Excel
              </button>
              <button onClick={exportPDF} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 hover:bg-muted">
                <FileText size={18} /> PDF
              </button>
              <button onClick={printPDF} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 hover:bg-muted">
                <Printer size={18} /> Imprimir PDF
              </button>
              <button onClick={printRecibos} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 hover:bg-muted">
                <Printer size={18} /> Recibos
              </button>
            </>
          )}
          {canFinance && (
            isClosed ? (
              <button onClick={reopenComp} className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 font-semibold text-amber-700 hover:bg-amber-100">
                <Unlock size={18} /> Reabrir
              </button>
            ) : (
              <button onClick={closeComp} disabled={vendedoras.length === 0} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                <Lock size={18} /> Fechar competência
              </button>
            )
          )}
        </div>
      </div>

      {vendedoras.length === 0 ? (
        <div className="min-w-0 overflow-hidden rounded-xl border border-dashed border-border bg-card p-8 text-center sm:p-12 lg:p-16">
          <Upload className="mx-auto mb-4 text-muted-foreground" size={48} />
          <p className="text-xl font-semibold">Importe a planilha para começar</p>
          <p className="mt-1 text-muted-foreground">A competência já foi criada com as metas informadas.</p>
        </div>
      ) : (
        <>
          {/* Resumo principal */}
          {canFinance && (
            <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.6fr)_minmax(0,0.92fr)]">
                <div className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-xl border border-brand/20 bg-brand p-4 text-white">
                  <div className="min-w-0 text-xs font-bold uppercase tracking-wide text-white/80">Venda Atual</div>
                  <div className="mt-1 whitespace-nowrap text-[clamp(1.75rem,1.55rem+0.4vw,2rem)] font-extrabold leading-none tabular-nums">{BRL(totals.liquido)}</div>
                  <div className="min-w-0 whitespace-nowrap text-sm text-white/80">{PCT(pctMeta)} da Meta Mensal</div>
                </div>
                <div className="flex min-w-0 overflow-hidden rounded-xl border border-border bg-background p-4">
                  <MetaProgressTrack />
                </div>
                <div className="flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-xl border border-brand bg-brand/5 p-4">
                  <div className="min-w-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">Comissão Final</div>
                  <div className="mt-1 whitespace-nowrap text-[clamp(1.75rem,1.55rem+0.4vw,2rem)] font-extrabold leading-none tabular-nums text-brand">{BRL(comissaoFinalTotal)}</div>
                  <div className="min-w-0 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                    Base {BRL(totals.comissao)} + prêmio {BRL(premioTotal)}
                  </div>
                </div>
              </div>
              <div className={`mt-4 min-w-0 overflow-hidden rounded-xl border p-4 ${premio.valor > 0 ? "border-emerald-300 bg-emerald-50" : "border-border bg-muted/30"}`}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="min-w-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">Premiação por atingimento</div>
                    <div className="mt-1 flex min-w-0 items-center gap-2 text-lg font-bold leading-tight">
                      {premio.valor > 0 && <CheckCircle2 className="text-emerald-600" size={18} />}
                      <span className={`min-w-0 ${premio.valor > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>{premio.motivo}</span>
                    </div>
                  </div>
                  <div className="grid min-w-0 grid-cols-1 gap-3 text-left sm:grid-cols-3 sm:text-right">
                    <div className="min-w-0 overflow-hidden">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Individual</div>
                      <div className="whitespace-nowrap font-extrabold tabular-nums text-brand">{BRL(premio.valor)}</div>
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Funcionárias</div>
                      <div className="whitespace-nowrap font-extrabold tabular-nums">{INT(premio.valor > 0 ? vendedoras.length : 0)}</div>
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <div className="text-[10px] font-bold uppercase text-muted-foreground">Total</div>
                      <div className="whitespace-nowrap font-extrabold tabular-nums text-emerald-700">{BRL(premioTotal)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* KPIs */}
          <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
            <KpiGroup title="Operação">
              <Kpi icon={<Users size={18} />} label="Funcionárias" value={INT(vendedoras.length)} />
              <Kpi icon={<Trophy size={18} />} label="Vendas" value={INT(totals.vendas)} />
              <Kpi icon={<Package size={18} />} label="Peças" value={INT(totals.uni)} />
            </KpiGroup>
            <KpiGroup title="Performance">
              <Kpi icon={<Target size={18} />} label="TM Geral" value={BRL(totals.tm)} />
              <Kpi icon={<Award size={18} />} label="PA Geral" value={NUM(totals.pa)} />
              <Kpi icon={<Medal size={18} />} label="PM Geral" value={BRL(totals.pm)} />
            </KpiGroup>
            {canFinance && (
              <KpiGroup title="Financeiro">
                <Kpi icon={<Target size={18} />} label="Comissão Base" value={BRL(totals.comissao)} />
                <Kpi icon={<Award size={18} />} label="Premiação" value={BRL(premioTotal)} />
                <Kpi icon={<Trophy size={18} />} label="Comissão Final" value={BRL(comissaoFinalTotal)} tone="bg-brand text-white" />
              </KpiGroup>
            )}
          </div>

          {/* Ranking podium */}
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
              <h3 className="flex min-w-0 items-center gap-2 text-xl font-extrabold leading-tight text-foreground">
                <Trophy className="text-yellow-500" size={22} /> Ranking
              </h3>
              <span className="max-w-full rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground [text-wrap:balance]">Ordenado por venda líquida</span>
            </div>
            <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 sm:grid-cols-3">
              {ranking.slice(0, 3).map((v, i) => {
                const bgs = ["from-yellow-100 to-yellow-50 border-yellow-300", "from-gray-100 to-gray-50 border-gray-300", "from-orange-100 to-orange-50 border-orange-300"];
                return (
                  <button
                    key={v.nome}
                    onClick={() => setDetail(v)}
                    className={`flex min-w-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-br ${bgs[i]} p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-sm font-extrabold text-brand shadow-sm">#{i + 1}</span>
                      <span className="min-w-0 truncate text-base font-extrabold text-foreground">{v.nome}</span>
                    </div>
                    <div className="mt-1 whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                      {canFinance ? BRL(v.liquido) : `${INT(v.vendas)} vendas · ${INT(v.uni)} peças`}
                    </div>
                    {canFinance && (
                      <div className="mt-1 min-w-0 space-y-0.5 text-xs">
                        <div className="whitespace-nowrap text-muted-foreground tabular-nums">Comissão: {BRL(v.comissao)}</div>
                        {premio.valor > 0 && <div className="whitespace-nowrap text-emerald-700 tabular-nums">+ Premiação: {BRL(premio.valor)}</div>}
                        <div className="whitespace-nowrap font-semibold tabular-nums text-brand">Final: {BRL(comissaoFinalDe(v))}</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border p-4">
              <div className="relative min-w-0 flex-1 basis-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Pesquisar funcionária…"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="text-sm text-muted-foreground">{filtered.length} funcionárias</div>
            </div>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-16 px-3 py-3 text-right">#</th>
                    <Th onClick={() => setSort("nome")} active={sortKey === "nome"} dir={sortDir}>Nome</Th>
                    {canFinance && <Th onClick={() => setSort("liquido")} active={sortKey === "liquido"} dir={sortDir} num>Venda Líquida</Th>}
                    {canFinance && <Th onClick={() => setSort("comissao")} active={sortKey === "comissao"} dir={sortDir} num>Comissão</Th>}
                    {canFinance && <th className="px-3 py-2 text-right">Meta Atingida</th>}
                    {canFinance && <th className="px-3 py-2 text-right">Premiação</th>}
                    {canFinance && <Th onClick={() => setSort("comissaoFinal" as keyof Vendedora)} active={sortKey === ("comissaoFinal" as keyof Vendedora)} dir={sortDir} num>Comissão Final</Th>}
                    <Th onClick={() => setSort("tm")} active={sortKey === "tm"} dir={sortDir} num>TM</Th>
                    <Th onClick={() => setSort("pa")} active={sortKey === "pa"} dir={sortDir} num>PA</Th>
                    <Th onClick={() => setSort("vendas")} active={sortKey === "vendas"} dir={sortDir} num>Vendas</Th>
                    <Th onClick={() => setSort("uni")} active={sortKey === "uni"} dir={sortDir} num>Peças</Th>
                    <Th onClick={() => setSort("vendasCom")} active={sortKey === "vendasCom"} dir={sortDir} num>Cad.</Th>
                    <Th onClick={() => setSort("consentimentos")} active={sortKey === "consentimentos"} dir={sortDir} num>Cons.</Th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((v, rowIndex) => (
                    <tr key={v.nome} className={`cursor-pointer border-t border-border transition hover:bg-brand/5 ${rowIndex % 2 === 1 ? "bg-muted/20" : ""}`} onClick={() => setDetail(v)}>
                      <td className="px-3 py-3 text-right font-extrabold text-brand">#{rankPos.get(v.nome)}</td>
                      <td className="min-w-[220px] max-w-[320px] px-3 py-3 font-semibold"><span className="block truncate">{v.nome}</span></td>
                      {canFinance && <td className="min-w-[130px] px-3 py-3 text-right tabular-nums">{BRL(v.liquido)}</td>}
                      {canFinance && <td className="min-w-[130px] px-3 py-3 text-right tabular-nums">{BRL(v.comissao)}</td>}
                      {canFinance && (
                        <td className="min-w-[120px] px-3 py-3 text-right">
                          {premio.valor > 0 ? (
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${premio.nivel === "hiper" ? "bg-fuchsia-100 text-fuchsia-700" : premio.nivel === "super" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {premio.nivel === "hiper" ? "Hiper Meta" : premio.nivel === "super" ? "Super Meta" : "Meta"}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      )}
                      {canFinance && <td className={`min-w-[120px] px-3 py-3 text-right tabular-nums ${premio.valor > 0 ? "font-semibold text-emerald-700" : "text-muted-foreground"}`}>{premio.valor > 0 ? `+ ${BRL(premio.valor)}` : "—"}</td>}
                      {canFinance && <td className="min-w-[140px] px-3 py-3 text-right font-extrabold tabular-nums text-brand">{BRL(comissaoFinalDe(v))}</td>}
                      <td className="min-w-[100px] px-3 py-3 text-right tabular-nums">{BRL(v.tm)}</td>
                      <td className="min-w-[80px] px-3 py-3 text-right tabular-nums">{NUM(v.pa)}</td>
                      <td className="min-w-[80px] px-3 py-3 text-right tabular-nums">{INT(v.vendas)}</td>
                      <td className="min-w-[80px] px-3 py-3 text-right tabular-nums">{INT(v.uni)}</td>
                      <td className="min-w-[80px] px-3 py-3 text-right tabular-nums">{INT(v.vendasCom)}</td>
                      <td className="min-w-[80px] px-3 py-3 text-right tabular-nums">{INT(v.consentimentos)}</td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr><td colSpan={canFinance ? 13 : 8} className="px-3 py-6 text-center text-muted-foreground">Nenhum resultado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border p-3 text-sm">
                <span className="min-w-0 text-muted-foreground">Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Anterior</button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-lg border border-border px-3 py-1 disabled:opacity-40">Próxima</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Detail dialog */}
      {detail && (
        <DetailDrawer
          v={detail}
          canFinance={canFinance}
          rank={rankPos.get(detail.nome) ?? 0}
          premio={premio}
          rate={metas.rate}
          comissaoFinal={comissaoFinalDe(detail)}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Settings dialog */}
      {showSettings && (
        <MetasDialog current={metas} onSave={saveMetas} onClose={() => setShowSettings(false)} saving={saving} />
      )}
    </div>
  );
}

function KpiGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-4">
      <h4 className="mb-3 min-w-0 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </section>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className={`flex min-h-12 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border border-border px-3 py-2 ${tone ?? "bg-background"}`}>
      <div className={`flex min-w-0 items-center gap-2 text-xs font-semibold uppercase leading-none ${tone ? "text-white/80" : "text-muted-foreground"}`}>
        <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="min-w-0 whitespace-nowrap">{label}</span>
      </div>
      <div className="shrink-0 whitespace-nowrap text-lg font-bold leading-tight tabular-nums">{value}</div>
    </div>
  );
}

function Th({ children, onClick, active, dir, num }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc"; num?: boolean }) {
  return (
    <th className={`px-3 py-2 ${num ? "text-right" : "text-left"} cursor-pointer select-none`} onClick={onClick}>
      <span className={active ? "text-brand" : ""}>{children}{active ? (dir === "asc" ? " ▲" : " ▼") : ""}</span>
    </th>
  );
}

function DetailDrawer({ v, canFinance, rank, premio, rate, comissaoFinal, onClose }: {
  v: Vendedora; canFinance: boolean; rank: number;
  premio: PremioInfo; rate: number; comissaoFinal: number;
  onClose: () => void;
}) {
  const conversion = v.vendas > 0 ? (v.vendasCom / v.vendas) * 100 : 0;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onClick={onClose}>
      <aside className="h-full w-full max-w-xl min-w-0 overflow-y-auto overflow-x-hidden bg-card p-4 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-extrabold text-brand">Ranking #{rank}</div>
            <h3 className="min-w-0 break-words text-2xl font-extrabold leading-tight text-foreground [overflow-wrap:anywhere]">{v.nome}</h3>
            <p className="mt-1 min-w-0 text-sm text-muted-foreground [text-wrap:balance]">Detalhe da funcionária na competência selecionada</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 hover:bg-muted"><X size={18} /></button>
        </div>

        {canFinance && (
          <div className="mb-5 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-brand bg-brand/5 p-5">
            <div className="min-w-0 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Comissão Final</div>
            <div className="mt-1 whitespace-nowrap text-[1.75rem] font-extrabold leading-none tabular-nums text-brand sm:text-3xl">{BRL(comissaoFinal)}</div>
            <div className="mt-1 min-w-0 whitespace-nowrap text-sm text-muted-foreground tabular-nums">Venda líquida {BRL(v.liquido)}</div>
          </div>
        )}

        <div className="space-y-5">
          {canFinance && (
            <section>
              <h4 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Financeiro</h4>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Venda Líquida" value={BRL(v.liquido)} highlight />
                <Field label="Comissão Base" value={BRL(v.comissao)} />
                <Field label="Meta atingida" value={premio.valor > 0 ? premio.motivo : "Nenhuma"} />
                <Field label="Premiação" value={premio.valor > 0 ? BRL(premio.valor) : BRL(0)} />
                <Field label="Venda Bruta" value={BRL(v.bruto)} />
                <Field label="Desconto Total" value={BRL(v.desconto)} />
                <Field label="Desconto %" value={PCT(v.descPct)} />
              </div>
            </section>
          )}

          <section>
            <h4 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">Performance</h4>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="TM" value={BRL(v.tm)} />
              <Field label="PA" value={NUM(v.pa)} />
              <Field label="PM" value={BRL(v.pm)} />
              <Field label="Vendas" value={INT(v.vendas)} />
              <Field label="Peças" value={INT(v.uni)} />
              <Field label="Cadastros" value={INT(v.vendasCom)} />
              <Field label="Conversões" value={PCT(conversion)} />
              <Field label="Consentimentos" value={INT(v.consentimentos)} />
            </div>
          </section>
        </div>

        {canFinance && (
          <div className="mt-5 min-w-0 overflow-hidden rounded-xl border border-border bg-muted/30 p-4">
            <div className="mb-2 text-sm font-extrabold uppercase text-muted-foreground [text-wrap:balance]">Composição do Pagamento</div>
            <div className="space-y-2 text-sm">
              <div className="flex min-w-0 flex-wrap justify-between gap-2"><span className="min-w-0 [text-wrap:balance]">Comissão base ({rate.toFixed(1)}% sobre líquido)</span><span className="whitespace-nowrap font-semibold tabular-nums">{BRL(v.comissao)}</span></div>
              <div className="flex min-w-0 flex-wrap justify-between gap-2">
                <span className="min-w-0 [text-wrap:balance]">Premiação — {premio.motivo}</span>
                <span className={`font-semibold ${premio.valor > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                  {premio.valor > 0 ? `+ ${BRL(premio.valor)}` : BRL(0)}
                </span>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap justify-between gap-2 border-t border-border pt-2 text-base">
                <span className="font-bold">Total a pagar</span>
                <span className="whitespace-nowrap font-bold tabular-nums text-brand">{BRL(comissaoFinal)}</span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-border p-3 ${highlight ? "bg-brand/5" : "bg-background"}`}>
      <div className="min-w-0 truncate text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className={`mt-0.5 whitespace-nowrap text-base font-bold leading-tight tabular-nums ${highlight ? "text-brand" : ""}`}>{value}</div>
    </div>
  );
}


function MetasDialog({ current, onSave, onClose, saving }: {
  current: Metas; onSave: (m: Metas) => void; onClose: () => void; saving: boolean;
}) {
  const [meta, setMeta] = useState(formatBRLInput(String(Math.round(current.meta * 100))));
  const [sup, setSup] = useState(formatBRLInput(String(Math.round(current.superMeta * 100))));
  const [hip, setHip] = useState(formatBRLInput(String(Math.round(current.hiperMeta * 100))));
  const [rate, setRate] = useState(current.rate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">Metas & Comissão</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {[
            { label: "Meta Mensal", v: meta, s: setMeta },
            { label: "Super Meta", v: sup, s: setSup },
            { label: "Hiper Meta", v: hip, s: setHip },
          ].map((f) => (
            <div key={f.label}>
              <label className="mb-1 block text-sm font-semibold">{f.label}</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <input
                  type="text" inputMode="numeric" value={f.v}
                  onChange={(e) => f.s(formatBRLInput(e.target.value.replace(/\D/g, "")))}
                  className="w-full rounded-lg border border-border py-2 pl-10 pr-3"
                />
              </div>
            </div>
          ))}
          <div>
            <label className="mb-1 block text-sm font-semibold">Comissão (%) sobre Venda Líquida</label>
            <input type="number" min={0} step={0.1} value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-border px-3 py-2" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2">Cancelar</button>
          <button
            disabled={saving}
            onClick={() => onSave({ meta: parseBRLInput(meta), superMeta: parseBRLInput(sup), hiperMeta: parseBRLInput(hip), rate })}
            className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
