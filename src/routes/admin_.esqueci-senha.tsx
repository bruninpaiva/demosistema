import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Loader2, ArrowLeft } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth/passwordReset.functions";

export const Route = createFileRoute("/admin_/esqueci-senha")({
  component: ForgotPasswordPage,
});

const GENERIC_ERROR = "Não foi possível processar sua solicitação agora. Tente novamente mais tarde.";

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");

    try {
      const result = await requestPasswordReset({ data: { email: email.trim() } });
      if (result.ok) {
        setSent(true);
      } else {
        setError(GENERIC_ERROR);
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-6 text-center">
          <img src="/bpinfo-logo.jpg" alt="BP Demo" className="mx-auto mb-4 h-12 w-auto sm:h-14" />
          <h1 className="text-lg font-bold text-foreground">Esqueci minha senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe seu e-mail para receber um link de redefinição.
          </p>
        </div>

        {!sent ? (
          <form onSubmit={submit}>
            <label className="mb-1.5 block text-sm font-semibold">E-mail</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background py-3 pl-11 pr-4 text-base transition focus:border-brand focus:outline-none"
              />
            </div>

            {error && <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-bold text-brand-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 size={18} className="animate-spin" />}
              {busy ? "Enviando..." : "Enviar link de redefinição"}
            </button>
          </form>
        ) : (
          <p className="rounded-xl bg-muted p-4 text-center text-sm text-foreground">
            Se esse e-mail estiver cadastrado, um link de redefinição válido por 15 minutos foi enviado.
          </p>
        )}

        <Link
          to="/admin"
          className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft size={14} /> Voltar para o login
        </Link>
      </div>
    </div>
  );
}
