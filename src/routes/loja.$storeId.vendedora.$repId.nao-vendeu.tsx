import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type NaoVendeuSearch = { attendanceId: string };

export const Route = createFileRoute("/loja/$storeId/vendedora/$repId/nao-vendeu")({
  component: NoSalePage,
  validateSearch: (search: Record<string, unknown>): NaoVendeuSearch => ({
    attendanceId: String(search.attendanceId ?? ""),
  }),
});

type Reason = { id: string; label: string; is_other: boolean; sort_order: number };

function NoSalePage() {
  const { storeId, repId } = Route.useParams();
  const { attendanceId } = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!attendanceId) {
      navigate({ to: "/loja/$storeId/vendedora/$repId", params: { storeId, repId }, replace: true });
      return;
    }
    supabase.from("sales_reps").select("name,store_id").eq("id", repId).maybeSingle().then(({ data }) => {
      if (!data || data.store_id !== storeId) {
        navigate({ to: "/loja/$storeId", params: { storeId }, replace: true });
      } else {
        setName(data.name);
      }
    });
    supabase
      .from("no_sale_reasons")
      .select("id,label,is_other,sort_order")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setReasons(data ?? []));
  }, [storeId, repId, attendanceId, navigate]);

  const selectedReason = reasons.find((r) => r.id === reasonId);
  const isOther = selectedReason?.is_other;

  const finish = async () => {
    if (!reasonId) return toast.error("Selecione o motivo");
    if (isOther && !otherText.trim()) return toast.error("Descreva o motivo");
    setSaving(true);
    const { error } = await supabase
      .from("attendances")
      .update({
        type: "no_sale",
        status: "closed",
        closed_at: new Date().toISOString(),
        reason_id: reasonId,
        reason_other_text: isOther ? otherText.trim() : null,
      })
      .eq("id", attendanceId);
    setSaving(false);
    if (error) return toast.error("Erro ao registrar. Tente novamente.");

    const { data: stillOpen } = await supabase
      .from("attendances")
      .select("id")
      .eq("sales_rep_id", repId)
      .eq("status", "open");
    toast.success("Registrado!");
    if (!stillOpen || stillOpen.length === 0) {
      await supabase.from("sales_reps").update({ status: "available" }).eq("id", repId);
      await supabase.rpc("send_to_end_of_queue", { _rep_id: repId });
      navigate({ to: "/loja/$storeId", params: { storeId }, replace: true });
    } else {
      navigate({ to: "/loja/$storeId/vendedora/$repId", params: { storeId, repId }, replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 bg-brand px-4 py-4 text-brand-foreground">
        <Link
          to="/loja/$storeId/vendedora/$repId"
          params={{ storeId, repId }}
          className="rounded-lg p-2 hover:bg-white/10"
          aria-label="Voltar"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <p className="text-xs opacity-80">Não vendeu · {name}</p>
          <h1 className="text-xl font-bold">Motivo</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 md:p-8 space-y-8">
        <section>
          <h2 className="mb-4 text-lg font-bold">Toque no motivo</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {reasons.map((r) => (
              <button
                key={r.id}
                onClick={() => setReasonId(r.id)}
                className={`min-h-[70px] rounded-2xl border-2 p-4 text-left text-base font-semibold transition active:scale-95 ${
                  reasonId === r.id
                    ? "border-destructive bg-destructive text-destructive-foreground shadow-lg"
                    : "border-border bg-card"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {isOther && (
            <div className="mt-4">
              <label className="mb-2 block text-base font-semibold">Descreva:</label>
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-card p-4 text-lg outline-none focus:border-brand"
                autoFocus
              />
            </div>
          )}
        </section>

        <button
          onClick={finish}
          disabled={saving || !reasonId}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-brand py-6 text-2xl font-extrabold text-brand-foreground shadow-xl transition active:scale-[0.98] disabled:opacity-50"
        >
          <Check size={30} /> {saving ? "SALVANDO…" : "FINALIZAR"}
        </button>
      </main>
    </div>
  );
}
