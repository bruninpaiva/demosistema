import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ShoppingBag, XCircle, Loader2, UserPlus, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/loja/$storeId/vendedora/$repId/")({
  component: ActionPage,
});

type OpenAttendance = { id: string; created_at: string };

function elapsedLabel(createdAt: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  return mins < 1 ? "agora" : `há ${mins} min`;
}

function ActionPage() {
  const { storeId, repId } = Route.useParams();
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [open, setOpen] = useState<OpenAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [startingNew, setStartingNew] = useState(false);

  const loadOpen = async () => {
    const { data } = await supabase
      .from("attendances")
      .select("id,created_at")
      .eq("sales_rep_id", repId)
      .eq("status", "open")
      .order("created_at", { ascending: true });
    return (data ?? []) as OpenAttendance[];
  };

  const openNewAttendance = async () => {
    const { error } = await supabase.from("attendances").insert({
      sales_rep_id: repId,
      store_id: storeId,
      status: "open",
    });
    if (error) {
      console.error("open attendance error", error);
      toast.error("Erro ao iniciar atendimento");
      return false;
    }
    return true;
  };

  useEffect(() => {
    supabase.from("sales_reps").select("name,store_id").eq("id", repId).maybeSingle().then(async ({ data }) => {
      if (!data || data.store_id !== storeId) {
        navigate({ to: "/loja/$storeId", params: { storeId }, replace: true });
        return;
      }
      setName(data.name);
      let rows = await loadOpen();
      if (rows.length === 0) {
        await openNewAttendance();
        rows = await loadOpen();
      }
      setOpen(rows);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, repId, navigate]);

  const finishOrStay = async (remaining: OpenAttendance[]) => {
    setOpen(remaining);
    if (remaining.length === 0) {
      await supabase.from("sales_reps").update({ status: "available" }).eq("id", repId);
      await supabase.rpc("send_to_end_of_queue", { _rep_id: repId });
      navigate({ to: "/loja/$storeId", params: { storeId }, replace: true });
    }
  };

  const registerSale = async (attendanceId: string) => {
    if (closingId) return;
    setClosingId(attendanceId);
    const { error } = await supabase
      .from("attendances")
      .update({ type: "sale", status: "closed", closed_at: new Date().toISOString() })
      .eq("id", attendanceId);
    setClosingId(null);
    if (error) {
      toast.error("Erro ao registrar. Tente novamente.");
      return;
    }
    toast.success("Venda registrada!");
    await finishOrStay(open.filter((a) => a.id !== attendanceId));
  };

  const attendAnother = async () => {
    if (startingNew) return;
    setStartingNew(true);
    const ok = await openNewAttendance();
    if (ok) setOpen(await loadOpen());
    setStartingNew(false);
  };

  if (loading) {
    return <p className="p-8 text-center text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center gap-3 bg-brand px-4 py-4 text-brand-foreground shadow-md">
        <Link
          to="/loja/$storeId"
          params={{ storeId }}
          className="rounded-lg p-2 hover:bg-white/10"
          aria-label="Voltar"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <p className="text-xs opacity-80">Vendedora</p>
          <h1 className="text-xl font-bold">{name || "…"}</h1>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 space-y-6">
        {open.length > 1 && (
          <p className="text-center text-sm font-semibold text-muted-foreground">
            {open.length} atendimentos em aberto — finalize cada um separadamente.
          </p>
        )}

        <div className="mx-auto max-w-3xl space-y-4">
          {open.map((att, idx) => (
            <div key={att.id} className="rounded-3xl border-2 border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock size={14} />
                Cliente {idx + 1} · {elapsedLabel(att.created_at)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => registerSale(att.id)}
                  disabled={closingId === att.id}
                  className="flex flex-col items-center justify-center rounded-2xl bg-success text-success-foreground shadow-xl transition active:scale-[0.98] hover:brightness-110 min-h-[160px] disabled:opacity-70"
                >
                  {closingId === att.id ? (
                    <Loader2 className="mb-3 animate-spin" size={64} strokeWidth={1.5} />
                  ) : (
                    <ShoppingBag className="mb-3" size={64} strokeWidth={1.5} />
                  )}
                  <span className="text-xl md:text-2xl font-extrabold tracking-tight">
                    {closingId === att.id ? "REGISTRANDO…" : "VENDA REALIZADA"}
                  </span>
                </button>

                <Link
                  to="/loja/$storeId/vendedora/$repId/nao-vendeu"
                  params={{ storeId, repId }}
                  search={{ attendanceId: att.id }}
                  className="flex flex-col items-center justify-center rounded-2xl bg-destructive text-destructive-foreground shadow-xl transition active:scale-[0.98] hover:brightness-110 min-h-[160px]"
                >
                  <XCircle className="mb-3" size={64} strokeWidth={1.5} />
                  <span className="text-xl md:text-2xl font-extrabold tracking-tight">NÃO VENDEU</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={attendAnother}
            disabled={startingNew}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/60 bg-brand/5 py-4 text-base font-bold text-brand hover:bg-brand/10 disabled:opacity-60"
          >
            <UserPlus size={20} /> {startingNew ? "Iniciando…" : "Atender outro cliente"}
          </button>
        </div>
      </main>
    </div>
  );
}
