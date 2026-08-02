import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Loader2, ArrowLeft, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin_/esqueci-senha")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_request_password_reset", {
      _email: email.trim(),
    });
    setBusy(false);
    setSent(true);
    // Sem provedor de e-mail configurado ainda: mostramos o link diretamente,
    // deixado claro na tela que é um substituto temporário do envio real.
    if (!error && data) {
      const link = `${window.location.origin}/admin/redefinir-senha?token=${data}`;
      setDevLink(link);
    }
  };

  const copyLink = async () => {
    if (!devLink) return;
    await navigator.clipboard.writeText(devLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <div>
            <p className="rounded-xl bg-muted p-4 text-center text-sm text-foreground">
              Se esse e-mail estiver cadastrado, um link de redefinição válido por 15 minutos foi enviado.
            </p>

            {devLink && (
              <div className="mt-4 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
                <p className="mb-2 text-xs font-semibold text-amber-800">
                  Sem provedor de e-mail configurado ainda — link temporário para teste:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-white px-2 py-1.5 text-xs text-amber-900">{devLink}</code>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="shrink-0 rounded-lg border border-amber-400 p-1.5 text-amber-800 hover:bg-amber-100"
                    aria-label="Copiar link"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>
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
