import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Crown,
  Lock,
  Utensils,
  LogOut,
  CheckCircle2,
  GripVertical,
  HandMetal,
  Coffee,
  Bath,
  Briefcase,
  X,
  Loader2,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/loja/$storeId/")({
  component: LojaHome,
});

type Rep = { id: string; name: string; queue_position: number | null; status: string };
type Store = { id: string; name: string };
type AttendanceLite = { sales_rep_id: string; type: string };
type ConvStats = { total: number; sales: number };
type OpenLite = { sales_rep_id: string };

const pinKey = (id: string) => `lupo_store_pin_ok_${id}`;

function LojaHome() {
  const { storeId } = Route.useParams();
  const [store, setStore] = useState<Store | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [unlocked, setUnlocked] = useState<boolean>(() =>
    typeof window !== "undefined" && sessionStorage.getItem(pinKey(storeId)) === "1"
  );

  const loadStore = async () => {
    setNotFound(false);
    setLoadError(false);
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name")
        .eq("id", storeId)
        .maybeSingle();
      if (error) {
        setLoadError(true);
        return;
      }
      if (!data) setNotFound(true);
      else setStore(data as Store);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    loadStore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-card p-6 text-center shadow">
          <p className="mb-2 text-lg font-semibold">Não foi possível carregar a loja.</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Verifique sua conexão e tente novamente.
          </p>
          <button
            onClick={loadStore}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2 font-bold text-brand-foreground"
          >
            <RefreshCw size={16} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-card p-6 text-center shadow">
          <p className="mb-4 text-lg font-semibold">Loja não encontrada.</p>
          <Link to="/" className="rounded-xl bg-brand px-5 py-2 font-bold text-brand-foreground">
            Voltar
          </Link>
        </div>
      </div>
    );
  }
  if (!store) return <p className="p-8 text-center text-muted-foreground">Carregando…</p>;

  if (!unlocked) {
    return (
      <PinGate
        store={store}
        onOk={() => {
          sessionStorage.setItem(pinKey(storeId), "1");
          setUnlocked(true);
        }}
      />
    );
  }

  return <Queue store={store} />;
}

function PinGate({ store, onOk }: { store: Store; onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    setError(false);
    setNetworkError(false);
    try {
      const { data, error: rpcErr } = await supabase.rpc("verify_store_pin", {
        _store_id: store.id,
        _pin: pin,
      });
      if (rpcErr) {
        setNetworkError(true);
        return;
      }
      if (data === true) {
        onOk();
        return;
      }
      setError(true);
      setPin("");
    } catch {
      setNetworkError(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center gap-3 bg-brand px-4 py-4 text-brand-foreground">
        <Link to="/" className="rounded-lg p-2 hover:bg-white/10" aria-label="Voltar">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex items-center rounded-lg bg-white px-2.5 py-1">
          <img src="/bpinfo-logo.jpg" alt="BP Demo" className="h-6 w-auto" />
        </div>
        <h1 className="text-lg font-bold">{store.name}</h1>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-lg border-t-4 border-brand"
        >
          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Lock size={26} />
            </div>
            <h2 className="text-xl font-extrabold">{store.name}</h2>
            <p className="text-sm text-muted-foreground">Digite o PIN da loja</p>
          </div>
          <input
            autoFocus
            type="password"
            autoComplete="off"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={pin}
            disabled={checking}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(false);
              setNetworkError(false);
            }}
            className="mb-3 w-full rounded-xl border-2 border-border bg-background px-4 py-4 text-center text-3xl tracking-[0.5em] font-bold disabled:opacity-60"
            placeholder="••••"
          />
          {error && <p className="mb-3 text-center text-sm font-semibold text-destructive">PIN incorreto.</p>}
          {networkError && (
            <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-destructive">
              <WifiOff size={16} /> Não foi possível verificar o PIN. Verifique sua conexão e tente novamente.
            </p>
          )}
          <button
            type="submit"
            disabled={checking}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-4 text-lg font-bold text-brand-foreground disabled:opacity-60"
          >
            {checking && <Loader2 size={20} className="animate-spin" />}
            {checking ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </main>
    </div>
  );
}

function ConversionBadge({
  stats,
  tone = "default",
}: {
  stats?: ConvStats;
  tone?: "default" | "onBrand";
}) {
  if (!stats || stats.total === 0) {
    return (
      <span
        title="Sem atendimentos hoje"
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
          tone === "onBrand" ? "bg-white/20 text-brand-foreground/80" : "bg-muted text-muted-foreground"
        }`}
      >
        —
      </span>
    );
  }
  const noSales = stats.total - stats.sales;
  const pct = Math.round((stats.sales / stats.total) * 100);
  const saleColor = tone === "onBrand" ? "text-emerald-300" : "text-emerald-600";
  const noSaleColor = tone === "onBrand" ? "text-rose-300" : "text-rose-600";
  const sepColor = tone === "onBrand" ? "text-brand-foreground/50" : "text-muted-foreground/60";
  return (
    <span
      title={`${stats.sales} venda(s) e ${noSales} não venda(s) hoje`}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
        tone === "onBrand" ? "bg-white/25 text-brand-foreground" : "bg-brand/10 text-brand"
      }`}
    >
      <span className={saleColor}>{stats.sales}</span>
      <span className={sepColor}>/</span>
      <span className={noSaleColor}>{noSales}</span>
      <span className={sepColor}>-</span>
      <span>{pct}%</span>
    </span>
  );
}

function DraggableRep({ rep, badge, conv }: { rep: Rep; badge?: React.ReactNode; conv?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: rep.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
      className="flex items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-4 shadow-sm cursor-grab active:cursor-grabbing select-none"
    >
      <GripVertical size={22} className="text-muted-foreground shrink-0" />
      {badge}
      <span className="flex-1 text-lg sm:text-xl font-semibold text-foreground break-words">{rep.name}</span>
      {conv}
    </div>
  );
}

function Queue({ store }: { store: Store }) {
  const navigate = useNavigate();
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [offPickerFor, setOffPickerFor] = useState<Rep | null>(null);
  const [attendances, setAttendances] = useState<AttendanceLite[]>([]);
  const [openAttendances, setOpenAttendances] = useState<OpenLite[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const load = () => {
    supabase
      .from("sales_reps")
      .select("id,name,queue_position,status")
      .eq("active", true)
      .eq("store_id", store.id)
      .order("queue_position", { ascending: true })
      .then(({ data }) => {
        setReps((data ?? []) as Rep[]);
        setLoading(false);
      });
  };

  const loadAttendances = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    supabase
      .from("attendances")
      .select("sales_rep_id,type")
      .eq("store_id", store.id)
      .eq("status", "closed")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .then(({ data }) => setAttendances((data ?? []) as AttendanceLite[]));
  };

  const loadOpenAttendances = () => {
    supabase
      .from("attendances")
      .select("sales_rep_id")
      .eq("store_id", store.id)
      .eq("status", "open")
      .then(({ data }) => setOpenAttendances((data ?? []) as OpenLite[]));
  };

  useEffect(() => {
    load();
    loadAttendances();
    loadOpenAttendances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id]);

  const inService = reps.filter((r) => r.status === "in_service");
  const available = reps.filter((r) => r.status === "available");
  const onLunch = reps.filter((r) => r.status === "lunch");
  const off = reps.filter((r) => r.status === "off");

  const openCountByRep = new Map<string, number>();
  for (const a of openAttendances) {
    openCountByRep.set(a.sales_rep_id, (openCountByRep.get(a.sales_rep_id) ?? 0) + 1);
  }

  const convByRep = new Map<string, ConvStats>();
  for (const a of attendances) {
    const cur = convByRep.get(a.sales_rep_id) ?? { total: 0, sales: 0 };
    cur.total++;
    if (a.type === "sale") cur.sales++;
    convByRep.set(a.sales_rep_id, cur);
  }
  const storeSales = attendances.filter((a) => a.type === "sale").length;
  const storeNoSales = attendances.length - storeSales;
  const storeConversion = attendances.length > 0 ? Math.round((storeSales / attendances.length) * 100) : null;

  const setStatus = async (
    rep: Rep,
    status: "available" | "lunch" | "off" | "in_service",
    opts?: { sendToEnd?: boolean; silent?: boolean; message?: string; startBreakReason?: string; closeBreak?: boolean },
  ) => {
    const prevStatus = rep.status;
    const { error } = await supabase.from("sales_reps").update({ status }).eq("id", rep.id);
    if (error) {
      console.error("update status error", error);
      return toast.error("Erro ao atualizar status");
    }

    // Close any open break when leaving lunch/off
    const leavingBreak = (prevStatus === "lunch" || prevStatus === "off") && status !== prevStatus;
    if (leavingBreak || opts?.closeBreak) {
      const { error: closeErr } = await supabase
        .from("rep_breaks")
        .update({ ended_at: new Date().toISOString() })
        .eq("sales_rep_id", rep.id)
        .is("ended_at", null);
      if (closeErr) console.error("close break error", closeErr);
    }

    // Open a break record when entering lunch/off
    if ((status === "lunch" || status === "off") && prevStatus !== status) {
      const reason = opts?.startBreakReason ?? (status === "lunch" ? "Almoço" : "Fora");
      const { error: insErr } = await supabase.from("rep_breaks").insert({
        sales_rep_id: rep.id,
        store_id: store.id,
        break_type: status === "lunch" ? "lunch" : "off",
        reason,
      });
      if (insErr) console.error("insert break error", insErr);
    }

    if (opts?.sendToEnd) {
      await supabase.rpc("send_to_end_of_queue", { _rep_id: rep.id });
    }
    if (!opts?.silent) toast.success(opts?.message ?? "Atualizado");
    load();
  };

  const onDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveDragId(null);
    if (!e.over) return;
    const repId = String(e.active.id);
    const rep = reps.find((r) => r.id === repId);
    if (!rep) return;
    if (e.over.id === "in-service" && rep.status !== "in_service") {
      await setStatus(rep, "in_service", { message: `${rep.name} em atendimento` });
    }
  };

  const activeDragRep = activeDragId ? reps.find((r) => r.id === activeDragId) : null;

  const exitStore = () => {
    sessionStorage.removeItem(pinKey(store.id));
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between bg-brand px-4 py-4 text-brand-foreground shadow-md gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={exitStore} className="rounded-lg p-2 hover:bg-white/10 shrink-0" aria-label="Trocar loja">
            <ArrowLeft size={22} />
          </button>
          <div className="hidden sm:flex items-center rounded-lg bg-white px-2.5 py-1 shrink-0">
            <img src="/bpinfo-logo.jpg" alt="BP Demo" className="h-6 w-auto" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs opacity-80 truncate">Loja</p>
            <h1 className="text-lg font-bold truncate">{store.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-end leading-none shrink-0">
            <span className="hidden sm:block text-[10px] uppercase tracking-wide opacity-80">Conversão hoje</span>
            <span className="text-base sm:text-lg font-extrabold inline-flex items-center gap-1">
              {storeConversion !== null ? (
                <>
                  <span className="hidden sm:inline text-emerald-300">{storeSales}</span>
                  <span className="hidden sm:inline text-brand-foreground/50">/</span>
                  <span className="hidden sm:inline text-rose-300">{storeNoSales}</span>
                  <span className="hidden sm:inline text-brand-foreground/50">-</span>
                  <span>{storeConversion}%</span>
                </>
              ) : (
                "—"
              )}
            </span>
          </div>
          <Link
            to="/admin"
            className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 shrink-0"
          >
            <BarChart3 size={18} /> <span className="hidden sm:inline">Admin</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8">
        {loading ? (
          <p className="text-center text-muted-foreground">Carregando…</p>
        ) : reps.length === 0 ? (
          <p className="mx-auto max-w-md rounded-xl bg-muted p-6 text-center text-muted-foreground">
            Nenhuma vendedora cadastrada nesta loja. Vá em <span className="font-semibold">Admin</span> para cadastrar.
          </p>
        ) : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="mx-auto max-w-6xl space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                <section>
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                    <Crown size={16} className="text-brand" /> Fila de espera
                  </p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Arraste a vendedora para <strong>Em atendimento →</strong>
                  </p>
                  {available.length === 0 ? (
                    <div className="rounded-2xl bg-muted p-6 text-center text-muted-foreground">
                      Nenhuma vendedora disponível na fila.
                    </div>
                  ) : (
                    <ol className="space-y-2">
                      {available.map((r, idx) => (
                        <li key={r.id}>
                          <DraggableRep
                            rep={r}
                            badge={
                              <span
                                className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-extrabold shrink-0 ${
                                  idx === 0
                                    ? "bg-brand text-brand-foreground"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {idx + 1}
                              </span>
                            }
                            conv={<ConversionBadge stats={convByRep.get(r.id)} />}
                          />
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button
                              onClick={() =>
                                setStatus(r, "lunch", {
                                  message: `${r.name} está almoçando`,
                                  startBreakReason: "Almoço",
                                })
                              }
                              className="flex items-center justify-center gap-2 rounded-lg border border-amber-400 bg-amber-50 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              <Utensils size={16} /> Almoço
                            </button>
                            <button
                              onClick={() => setOffPickerFor(r)}
                              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted py-2 text-sm font-semibold text-foreground hover:bg-muted/70"
                            >
                              <LogOut size={16} /> Fora
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <InServiceDropZone
                  inService={inService}
                  isDragging={!!activeDragId}
                  convByRep={convByRep}
                  openCountByRep={openCountByRep}
                  onTapRep={(rep) =>
                    navigate({
                      to: "/loja/$storeId/vendedora/$repId",
                      params: { storeId: store.id, repId: rep.id },
                    })
                  }
                  onBackToQueue={(rep) => {
                    if ((openCountByRep.get(rep.id) ?? 0) > 0) {
                      return toast.error(`${rep.name} ainda tem atendimento(s) em aberto`);
                    }
                    setStatus(rep, "available", { message: `${rep.name} voltou para a fila` });
                  }}
                />
              </div>


              {onLunch.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-700">
                    <Utensils size={16} /> Almoçando
                  </h2>
                  <ul className="space-y-2">
                    {onLunch.map((r) => (
                      <BreakRow
                        key={r.id}
                        rep={r}
                        variant="lunch"
                        conv={convByRep.get(r.id)}
                        onReturn={() =>
                          setStatus(r, "available", {
                            sendToEnd: true,
                            closeBreak: true,
                            message: `${r.name} voltou do almoço`,
                          })
                        }
                        returnLabel="Voltei do almoço"
                      />
                    ))}
                  </ul>
                </section>
              )}

              {off.length > 0 && (
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                    <LogOut size={16} /> Fora da loja
                  </h2>
                  <ul className="space-y-2">
                    {off.map((r) => (
                      <BreakRow
                        key={r.id}
                        rep={r}
                        variant="off"
                        conv={convByRep.get(r.id)}
                        onReturn={() =>
                          setStatus(r, "available", {
                            sendToEnd: true,
                            closeBreak: true,
                            message: `${r.name} chegou na loja`,
                          })
                        }
                        returnLabel="Cheguei na loja"
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <DragOverlay>
              {activeDragRep ? (
                <div className="flex items-center gap-3 rounded-2xl border-2 border-brand bg-card px-4 py-4 shadow-2xl">
                  <GripVertical size={22} className="text-brand" />
                  <span className="text-xl font-semibold text-foreground">{activeDragRep.name}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {offPickerFor && (
        <OffReasonModal
          rep={offPickerFor}
          onClose={() => setOffPickerFor(null)}
          onPick={async (reason) => {
            const rep = offPickerFor;
            setOffPickerFor(null);
            await setStatus(rep, "off", {
              message: `${rep.name} saiu — ${reason}`,
              startBreakReason: reason,
            });
          }}
        />
      )}
    </div>
  );
}

function BreakRow({
  rep,
  variant,
  conv,
  onReturn,
  returnLabel,
}: {
  rep: Rep;
  variant: "lunch" | "off";
  conv?: ConvStats;
  onReturn: () => void;
  returnLabel: string;
}) {
  const [info, setInfo] = useState<{ started_at: string; reason: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    supabase
      .from("rep_breaks")
      .select("started_at,reason")
      .eq("sales_rep_id", rep.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data) {
          setInfo(data);
        } else {
          // Backfill: rep is in lunch/off but has no open break record.
          const reason = variant === "lunch" ? "Almoço" : "Fora";
          const started_at = new Date().toISOString();
          const { data: inserted } = await supabase
            .from("rep_breaks")
            .insert({
              sales_rep_id: rep.id,
              break_type: variant,
              reason,
              started_at,
            })
            .select("started_at,reason")
            .maybeSingle();
          setInfo(inserted ?? { started_at, reason });
        }
      });
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [rep.id, variant]);

  const elapsed = info ? Math.max(0, Math.floor((now - new Date(info.started_at).getTime()) / 60000)) : 0;
  const elapsedLabel = elapsed < 60 ? `${elapsed} min` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}min`;

  const isLunch = variant === "lunch";

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-2xl px-5 py-4 ${
        isLunch ? "border-2 border-amber-300 bg-amber-50" : "border border-border bg-muted"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-xl font-semibold ${isLunch ? "text-amber-950" : "text-foreground"}`}>{rep.name}</p>
          <ConversionBadge stats={conv} />
        </div>
        <p className={`text-xs ${isLunch ? "text-amber-800" : "text-muted-foreground"}`}>
          {isLunch
            ? `${info?.reason ?? "Almoço"} · há ${elapsedLabel}`
            : info?.reason === "Fora horário de trabalho"
              ? `Fora — ${info?.reason}`
              : `Fora — ${info?.reason ?? "Fora"} · há ${elapsedLabel}`}
        </p>
      </div>
      <button
        onClick={onReturn}
        className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-foreground hover:brightness-110"
      >
        <CheckCircle2 size={16} /> {returnLabel}
      </button>
    </li>
  );
}

function OffReasonModal({
  rep,
  onClose,
  onPick,
}: {
  rep: Rep;
  onClose: () => void;
  onPick: (reason: string) => void;
}) {
  const options = [
    { label: "Sair para café", icon: Coffee },
    { label: "Sair para banheiro", icon: Bath },
    { label: "Tarefa externa", icon: Briefcase },
    { label: "Fora horário de trabalho", icon: LogOut },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Fora da loja</p>
            <h3 className="text-xl font-extrabold">{rep.name}</h3>
            <p className="text-sm text-muted-foreground">Qual o motivo?</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted" aria-label="Fechar">
            <X size={22} />
          </button>
        </div>
        <div className="space-y-2">
          {options.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => onPick(label)}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-border bg-background px-4 py-4 text-left text-lg font-semibold hover:border-brand hover:bg-brand/5 active:scale-[0.98]"
            >
              <Icon size={22} className="text-brand shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InServiceDropZone({
  inService,
  isDragging,
  convByRep,
  openCountByRep,
  onTapRep,
  onBackToQueue,
}: {
  inService: Rep[];
  isDragging: boolean;
  convByRep: Map<string, ConvStats>;
  openCountByRep: Map<string, number>;
  onTapRep: (rep: Rep) => void;
  onBackToQueue: (rep: Rep) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "in-service" });
  return (
    <section
      ref={setNodeRef}
      className={`rounded-3xl border-4 border-dashed p-4 transition ${
        isOver
          ? "border-brand bg-brand/10"
          : isDragging
            ? "border-brand/60 bg-brand/5"
            : "border-border bg-card"
      }`}
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-brand">
        <HandMetal size={16} /> Em atendimento
      </p>
      {inService.length === 0 ? (
        <div className="rounded-2xl bg-muted/50 p-6 text-center text-muted-foreground">
          Arraste uma vendedora da fila para cá quando iniciar o atendimento.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {inService.map((rep) => {
            const openCount = openCountByRep.get(rep.id) ?? 0;
            return (
            <div key={rep.id} className="flex flex-col gap-2">
              <button
                onClick={() => onTapRep(rep)}
                className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl bg-brand px-3 py-6 text-brand-foreground shadow-xl active:scale-[0.98] hover:brightness-110 w-full overflow-hidden"
              >
                <span className="text-lg sm:text-xl md:text-2xl font-extrabold text-center leading-tight max-w-full px-2 whitespace-normal [overflow-wrap:normal] hyphens-none">{rep.name}</span>
                <span className="mt-1 flex items-center gap-1.5">
                  <ConversionBadge stats={convByRep.get(rep.id)} tone="onBrand" />
                  {openCount > 1 && (
                    <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">
                      {openCount} atendimentos abertos
                    </span>
                  )}
                </span>
                <span className="mt-2 text-sm opacity-90">Toque para finalizar</span>
              </button>
              <button
                onClick={() => onBackToQueue(rep)}
                className="rounded-lg border border-border bg-card py-2 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Voltar para a fila
              </button>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
