import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ResetSearch = { token: string };

export const Route = createFileRoute("/admin_/redefinir-senha")({
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    token: String(search.token ?? ""),
  }),
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) { setError("Link inválido."); return; }
    if (pass.length < 4) { setError("A senha precisa ter ao menos 4 caracteres."); return; }
    if (pass !== confirmPass) { setError("As senhas não coincidem."); return; }

    setBusy(true);
    const { data, error: err } = await supabase.rpc("admin_reset_password", {
      _token: token,
      _new_password: pass,
    });
    setBusy(false);

    if (err || !data) {
      setError("Esse link é inválido ou já expirou. Solicite um novo.");
      return;
    }
    setDone(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-6 text-center">
          <img src="/bpinfo-logo.jpg" alt="BP Demo" className="mx-auto mb-4 h-12 w-auto sm:h-14" />
          <h1 className="text-lg font-bold text-foreground">Redefinir senha</h1>
        </div>

        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 size={26} />
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Senha redefinida com sucesso. Já pode entrar com a nova senha.
            </p>
            <Link
              to="/admin"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-base font-bold text-brand-foreground transition hover:opacity-90"
            >
              Ir para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">Nova senha</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    autoFocus
                    type="password"
                    value={pass}
                    onChange={(e) => { setPass(e.target.value); setError(""); }}
                    className="w-full rounded-xl border-2 border-border bg-background py-3 pl-11 pr-4 text-base transition focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">Confirmar nova senha</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => { setConfirmPass(e.target.value); setError(""); }}
                    className="w-full rounded-xl border-2 border-border bg-background py-3 pl-11 pr-4 text-base transition focus:border-brand focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {error && <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-bold text-brand-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 size={18} className="animate-spin" />}
              {busy ? "Salvando..." : "Redefinir senha"}
            </button>

            <Link
              to="/admin"
              className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft size={14} /> Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
