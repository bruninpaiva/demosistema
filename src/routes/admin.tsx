import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Loader2,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  UserCheck,
  UserX,
  Mail,
  ChevronDown,
  LogOut,
  User,
  Lock,
  ShieldCheck,
  ShieldOff,
  Unlock,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
} from "lucide-react";
import PromotionsTab from "@/components/PromotionsTab";
import CommissionTab from "@/components/CommissionTab";
import BarcodeConverterTab from "@/components/BarcodeConverterTab";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import QRCode from "qrcode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
const ACTOR_NAME_KEY = "lupo_admin_name";
const ACTOR_ROLE_KEY = "lupo_admin_role";
const ACTOR_STORE_KEY = "lupo_admin_store";
const MUST_CHANGE_KEY = "lupo_admin_must_change";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Administrador",
  admin: "Administrador",
  gerente: "Gerente",
};

export function getAdminActor(): { user: string; pass: string; role: string; storeId: string | null } | null {
  if (typeof window === "undefined") return null;
  const user = sessionStorage.getItem(ACTOR_USER_KEY);
  const pass = sessionStorage.getItem(ACTOR_PASS_KEY);
  if (!user || !pass) return null;
  const role = sessionStorage.getItem(ACTOR_ROLE_KEY) ?? "";
  const storeId = sessionStorage.getItem(ACTOR_STORE_KEY) || null;
  return { user, pass, role, storeId };
}

const ALL_STORES = "__all__";
const ALL_REPS = "__all__";

// Horário operacional considerado pelos alertas do Dashboard (Etapa 4.1).
// Centralizado aqui de propósito: hoje é um valor único para toda a rede;
// quando cada loja tiver seu próprio horário cadastrado, é só trocar este
// valor fixo por uma consulta a essa nova coluna, sem mexer nas regras.
const OPERATING_HOURS = { start: 9, end: 20 };

function isWithinOperatingHours(date: Date): boolean {
  const h = date.getHours();
  return h >= OPERATING_HOURS.start && h < OPERATING_HOURS.end;
}

function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [authed, setAuthed] = useState<boolean>(() =>
    typeof window !== "undefined" && sessionStorage.getItem(AUTH_KEY) === "1"
  );
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [mustChange, setMustChange] = useState<boolean>(() =>
    typeof window !== "undefined" && sessionStorage.getItem(MUST_CHANGE_KEY) === "1"
  );
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    if (authed) return;
    supabase.rpc("admin_exists").then(({ data, error }) => {
      setAdminExists(error ? true : Boolean(data));
    });
  }, [authed]);

  // Impede que o botão "Voltar" do navegador reexiba o painel a partir do
  // bfcache depois do logout: se a página for restaurada do cache em vez de
  // recarregada, força um reload real, que vai reler a sessão (já vazia).
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const logout = () => {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(ACTOR_USER_KEY);
    sessionStorage.removeItem(ACTOR_PASS_KEY);
    sessionStorage.removeItem(ACTOR_NAME_KEY);
    sessionStorage.removeItem(ACTOR_ROLE_KEY);
    sessionStorage.removeItem(ACTOR_STORE_KEY);
    sessionStorage.removeItem(MUST_CHANGE_KEY);
    window.dispatchEvent(new Event("lupo-admin-auth-changed"));
    // Navegação real (não só troca de estado do React): garante uma entrada
    // de histórico "deslogada" de verdade, para o botão Voltar nunca
    // reexibir o painel autenticado.
    window.location.href = "/admin";
  };

  if (!authed) {
    if (adminExists === null) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      );
    }
    if (!adminExists) {
      return <AdminBootstrap onOk={() => { setAdminExists(true); setAuthed(true); }} />;
    }
    return (
      <AdminLogin
        onOk={(requiresPasswordChange) => {
          setMustChange(requiresPasswordChange);
          setAuthed(true);
        }}
      />
    );
  }

  if (mustChange) {
    return <ForceChangePassword onDone={() => { sessionStorage.removeItem(MUST_CHANGE_KEY); setMustChange(false); }} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 bg-brand px-4 py-4 text-brand-foreground">
        <Link to="/" className="rounded-lg p-2 hover:bg-white/10" aria-label="Voltar"><ArrowLeft size={22} /></Link>
        <div className="flex items-center rounded-lg bg-white px-2.5 py-1">
          <img src="/bpinfo-logo.jpg" alt="BP Demo" className="h-6 w-auto" />
        </div>
        <h1 className="text-xl font-bold">Administração</h1>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-auto flex items-center gap-2 rounded-lg border border-white/30 px-3 py-1.5 text-sm hover:bg-white/10">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${paletteFor(sessionStorage.getItem(ACTOR_NAME_KEY) || "?")}`}>
                {initialsFor(sessionStorage.getItem(ACTOR_NAME_KEY) || "?")}
              </span>
              <span className="hidden font-semibold sm:inline">
                {sessionStorage.getItem(ACTOR_NAME_KEY) || "Minha conta"}
              </span>
              <ChevronDown size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-semibold">{sessionStorage.getItem(ACTOR_NAME_KEY) || "—"}</p>
              <p className="text-xs font-normal text-muted-foreground">
                {ROLE_LABELS[sessionStorage.getItem(ACTOR_ROLE_KEY) ?? ""] ?? "—"}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowChangePassword(true)} className="gap-2">
              <KeyRound size={14} /> Alterar senha
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
              <LogOut size={14} /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

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

type AdminAuthRow = {
  status: string;
  id: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  store_id: string | null;
  must_change_password: boolean | null;
  two_factor_enabled: boolean | null;
  locked_seconds: number | null;
};

function AdminLogin({ onOk }: { onOk: (requiresPasswordChange: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const attempt = async (codeValue?: string) => {
    setBusy(true);
    setError("");
    const trimmedEmail = email.trim();
    const { data, error: err } = await supabase.rpc("admin_authenticate", {
      _email: trimmedEmail,
      _password: pass,
      _code: codeValue || (null as unknown as string),
    });
    setBusy(false);

    const row = (data as AdminAuthRow[] | null)?.[0];
    if (err || !row) {
      setError("Algo deu errado. Tente novamente.");
      return;
    }

    if (row.status === "locked") {
      const mins = Math.max(1, Math.ceil((row.locked_seconds ?? 0) / 60));
      setError(`Conta temporariamente bloqueada por tentativas incorretas. Tente novamente em ${mins} min.`);
      return;
    }
    if (row.status === "invalid") {
      setError(step === "2fa" ? "Código incorreto." : "E-mail ou senha incorretos.");
      return;
    }
    if (row.status === "needs_2fa") {
      setStep("2fa");
      return;
    }

    // status === "ok"
    sessionStorage.setItem(AUTH_KEY, "1");
    sessionStorage.setItem(ACTOR_USER_KEY, trimmedEmail);
    sessionStorage.setItem(ACTOR_PASS_KEY, pass);
    sessionStorage.setItem(ACTOR_NAME_KEY, row.name ?? "");
    sessionStorage.setItem(ACTOR_ROLE_KEY, row.role ?? "");
    sessionStorage.setItem(ACTOR_STORE_KEY, row.store_id ?? "");
    if (row.must_change_password) sessionStorage.setItem(MUST_CHANGE_KEY, "1");
    window.dispatchEvent(new Event("lupo-admin-auth-changed"));
    supabase.rpc("admin_record_login", { _email: trimmedEmail, _password: pass });
    onOk(Boolean(row.must_change_password));
  };

  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    attempt();
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    attempt(code);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-8 text-center">
          <img src="/bpinfo-logo.jpg" alt="BP Demo" className="mx-auto mb-4 h-12 w-auto sm:h-14" />
          <h1 className="text-lg font-bold text-foreground">Administração</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "credentials" ? "Acesso restrito" : "Verificação em duas etapas"}
          </p>
        </div>

        {step === "credentials" ? (
          <form onSubmit={submitCredentials}>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">E-mail</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    autoFocus
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    className="w-full rounded-xl border-2 border-border bg-background py-3 pl-11 pr-4 text-base transition focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold">Senha</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <input
                    type="password"
                    value={pass}
                    onChange={(e) => { setPass(e.target.value); setError(""); }}
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
              {busy ? "Entrando..." : "Entrar"}
            </button>

            <Link
              to="/admin/esqueci-senha"
              className="mt-4 block w-full text-center text-sm text-muted-foreground transition hover:text-foreground"
            >
              Esqueci minha senha
            </Link>

            <Link to="/" className="mt-2 block text-center text-sm text-muted-foreground transition hover:text-foreground">
              Voltar
            </Link>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <p className="mb-4 text-center text-sm text-muted-foreground">
              {useRecoveryCode
                ? "Digite um dos seus códigos de recuperação."
                : "Digite o código de 6 dígitos do seu aplicativo autenticador."}
            </p>

            {useRecoveryCode ? (
              <input
                autoFocus
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
                placeholder="XXXXXXXXXX"
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-center text-lg font-bold tracking-widest transition focus:border-brand focus:outline-none"
              />
            ) : (
              <div className="flex justify-center">
                <InputOTP
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(v) => { setCode(v); setError(""); }}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} className="h-12 w-10 text-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            )}

            {error && <p className="mt-3 text-center text-sm font-semibold text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-bold text-brand-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 size={18} className="animate-spin" />}
              {busy ? "Verificando..." : "Verificar"}
            </button>

            <button
              type="button"
              onClick={() => { setUseRecoveryCode((v) => !v); setCode(""); setError(""); }}
              className="mt-4 block w-full text-center text-sm text-muted-foreground transition hover:text-foreground"
            >
              {useRecoveryCode ? "Usar código do aplicativo autenticador" : "Usar um código de recuperação"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("credentials"); setCode(""); setError(""); }}
              className="mt-2 block w-full text-center text-sm text-muted-foreground transition hover:text-foreground"
            >
              Voltar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function AdminBootstrap({ onOk }: { onOk: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Informe seu nome."); return; }
    if (!email.trim()) { setError("Informe um e-mail."); return; }
    if (pass.length < 4) { setError("A senha precisa ter ao menos 4 caracteres."); return; }
    if (pass !== confirmPass) { setError("As senhas não coincidem."); return; }

    setBusy(true);
    const { error: err } = await supabase.rpc("admin_bootstrap", {
      _name: name.trim(),
      _email: email.trim(),
      _password: pass,
    });
    setBusy(false);

    if (err) {
      setError("Não foi possível criar o administrador. Tente novamente.");
      return;
    }

    sessionStorage.setItem(AUTH_KEY, "1");
    sessionStorage.setItem(ACTOR_USER_KEY, email.trim());
    sessionStorage.setItem(ACTOR_PASS_KEY, pass);
    sessionStorage.setItem(ACTOR_NAME_KEY, name.trim());
    sessionStorage.setItem(ACTOR_ROLE_KEY, "super_admin");
    sessionStorage.setItem(ACTOR_STORE_KEY, "");
    window.dispatchEvent(new Event("lupo-admin-auth-changed"));
    onOk();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-8 text-center">
          <img src="/bpinfo-logo.jpg" alt="BP Demo" className="mx-auto mb-4 h-12 w-auto sm:h-14" />
          <h1 className="text-xl font-extrabold text-foreground">Bem-vindo ao BPInfo ERP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vamos criar o primeiro administrador do sistema.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Nome</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                className="w-full rounded-xl border-2 border-border bg-background py-3 pl-11 pr-4 text-base transition focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold">E-mail</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                className="w-full rounded-xl border-2 border-border bg-background py-3 pl-11 pr-4 text-base transition focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold">Senha</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                type="password"
                value={pass}
                onChange={(e) => { setPass(e.target.value); setError(""); }}
                className="w-full rounded-xl border-2 border-border bg-background py-3 pl-11 pr-4 text-base transition focus:border-brand focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold">Confirmar senha</label>
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
          {busy ? "Criando..." : "Criar administrador"}
        </button>
      </form>
    </div>
  );
}

function ForceChangePassword({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const actor = getAdminActor();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (pass.length < 4) { setError("A senha precisa ter ao menos 4 caracteres."); return; }
    if (pass !== confirmPass) { setError("As senhas não coincidem."); return; }
    if (!actor) return;

    setBusy(true);
    const { error: err } = await supabase.rpc("admin_change_own_password", {
      _email: actor.user,
      _current_password: actor.pass,
      _new_password: pass,
    });
    setBusy(false);

    if (err) {
      setError("Não foi possível trocar a senha. Tente novamente.");
      return;
    }

    // A senha guardada na sessão precisa acompanhar a troca — as próximas
    // chamadas do painel reautenticam com ela a cada ação.
    sessionStorage.setItem(ACTOR_PASS_KEY, pass);
    onDone();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-8 text-center">
          <img src="/bpinfo-logo.jpg" alt="BP Demo" className="mx-auto mb-4 h-12 w-auto sm:h-14" />
          <h1 className="text-xl font-extrabold text-foreground">Defina sua nova senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Por segurança, você precisa trocar sua senha temporária antes de continuar.
          </p>
        </div>

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
          {busy ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPass, setCurrentPass] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const actor = getAdminActor();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentPass) { setError("Informe sua senha atual."); return; }
    if (pass.length < 4) { setError("A nova senha precisa ter ao menos 4 caracteres."); return; }
    if (pass !== confirmPass) { setError("As senhas não coincidem."); return; }
    if (!actor) return;

    setBusy(true);
    const { error: err } = await supabase.rpc("admin_change_own_password", {
      _email: actor.user,
      _current_password: currentPass,
      _new_password: pass,
    });
    setBusy(false);

    if (err) {
      setError("Senha atual incorreta ou algo deu errado. Tente novamente.");
      return;
    }

    sessionStorage.setItem(ACTOR_PASS_KEY, pass);
    toast.success("Senha alterada com sucesso");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl"
      >
        <h3 className="mb-4 text-lg font-bold">Alterar senha</h3>

        <label className="mb-1 block text-sm font-semibold">Senha atual</label>
        <input
          autoFocus
          type="password"
          value={currentPass}
          onChange={(e) => { setCurrentPass(e.target.value); setError(""); }}
          className="mb-4 w-full rounded-xl border-2 border-border bg-background px-4 py-2.5"
        />

        <label className="mb-1 block text-sm font-semibold">Nova senha</label>
        <input
          type="password"
          value={pass}
          onChange={(e) => { setPass(e.target.value); setError(""); }}
          className="mb-4 w-full rounded-xl border-2 border-border bg-background px-4 py-2.5"
        />

        <label className="mb-1 block text-sm font-semibold">Confirmar nova senha</label>
        <input
          type="password"
          value={confirmPass}
          onChange={(e) => { setConfirmPass(e.target.value); setError(""); }}
          className="mb-4 w-full rounded-xl border-2 border-border bg-background px-4 py-2.5"
        />

        {error && <p className="mb-3 text-sm font-semibold text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
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

// Período de comparação: mesma duração do período selecionado, imediatamente anterior a ele.
// Ex.: "Hoje" compara com "Ontem"; "Últimos 7 dias" compara com os 7 dias anteriores a esses.
function previousRangeFor(start: Date, end: Date): { start: Date; end: Date } {
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { start: prevStart, end: prevEnd };
}

type KpiDelta = { direction: "up" | "down" | "flat"; label: string };

function deltaPct(current: number, previous: number): KpiDelta {
  if (previous === 0) {
    if (current === 0) return { direction: "flat", label: "sem mudança vs. período anterior" };
    return { direction: "up", label: "novo vs. período anterior (era 0)" };
  }
  const pct = ((current - previous) / previous) * 100;
  const direction = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  return { direction, label: `${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs. período anterior` };
}

function deltaPontosPercentuais(current: number, previous: number): KpiDelta {
  const diff = current - previous;
  const direction = diff > 0.5 ? "up" : diff < -0.5 ? "down" : "flat";
  return { direction, label: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp vs. período anterior` };
}

type Attendance = {
  id: string;
  created_at: string;
  closed_at: string | null;
  sales_rep_id: string;
  store_id: string | null;
  type: "sale" | "no_sale";
  reason_id: string | null;
  reason_other_text: string | null;
  notes: string | null;
  amount: number | null;
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
      .select("id,created_at,closed_at,sales_rep_id,store_id,type,reason_id,reason_other_text,notes,amount")
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

const LIVE_POLL_MS = 30_000;

// "Agora mesmo": atendimentos em aberto e vendedoras em pausa, atualizado por
// polling (não há Supabase Realtime em uso hoje em nenhum lugar do app — 30s
// segue a mesma cadência já usada no kiosk da loja para o cronômetro de pausa).
function useLiveStatus(storeId: string) {
  const [emAtendimento, setEmAtendimento] = useState(0);
  const [emPausa, setEmPausa] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let attQuery = supabase.from("attendances").select("id", { count: "exact", head: true }).eq("status", "open");
      if (storeId !== ALL_STORES) attQuery = attQuery.eq("store_id", storeId);
      let breakQuery = supabase.from("rep_breaks").select("id,reason,store_id").is("ended_at", null);
      if (storeId !== ALL_STORES) breakQuery = breakQuery.eq("store_id", storeId);

      const [{ count: attCount }, { data: breakRows }] = await Promise.all([attQuery, breakQuery]);
      if (!alive) return;
      setEmAtendimento(attCount ?? 0);
      setEmPausa(((breakRows ?? []) as { reason: string | null }[]).filter((b) => b.reason !== "Fora horário de trabalho").length);
      setUpdatedAt(Date.now());
    };
    load();
    const interval = setInterval(load, LIVE_POLL_MS);
    return () => { alive = false; clearInterval(interval); };
  }, [storeId]);

  return { emAtendimento, emPausa, updatedAt };
}

function LiveStrip({ storeId }: { storeId: string }) {
  const { emAtendimento, emPausa, updatedAt } = useLiveStatus(storeId);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsAgo = updatedAt !== null ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000)) : null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ao vivo</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Users size={16} className="text-brand" />
        <span className="text-lg font-bold">{emAtendimento}</span>
        <span className="text-muted-foreground">em atendimento agora</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Coffee size={16} className="text-amber-600" />
        <span className="text-lg font-bold">{emPausa}</span>
        <span className="text-muted-foreground">em pausa agora</span>
      </div>
      {secondsAgo !== null && (
        <span className="ml-auto text-xs text-muted-foreground">Atualizado há {secondsAgo}s</span>
      )}
    </div>
  );
}

// ------------ Alertas ------------
// Independentes do filtro de período do Dashboard: um alerta é sobre "agora",
// não sobre o período que o gestor está navegando — por isso consultam
// sempre hoje (e ontem, para a regra de queda de conversão), atualizando
// por polling como o restante do "ao vivo".

type AlertSeverity = "info" | "warning" | "critical";
type DashboardAlert = { id: string; severity: AlertSeverity; message: string; storeId: string | null };
type AlertRow = { id: string; created_at: string; store_id: string | null; sales_rep_id: string; type: "sale" | "no_sale" | null; status: "open" | "closed" };
type AlertBreakRow = { id: string; sales_rep_id: string; store_id: string | null; reason: string | null; started_at: string; ended_at: string | null };

function severityRank(s: AlertSeverity): number {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}

function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

const ALERTS_POLL_MS = 60_000;

function useAlerts(stores: Store[], reps: RepOption[]) {
  const [todayRows, setTodayRows] = useState<AlertRow[]>([]);
  const [yesterdayRows, setYesterdayRows] = useState<AlertRow[]>([]);
  const [breakRows, setBreakRows] = useState<AlertBreakRow[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      const [{ data: today }, { data: yesterday }, { data: breaks }] = await Promise.all([
        supabase.from("attendances").select("id,created_at,store_id,sales_rep_id,type,status").gte("created_at", todayStart.toISOString()),
        supabase.from("attendances").select("id,created_at,store_id,sales_rep_id,type,status").gte("created_at", yesterdayStart.toISOString()).lt("created_at", todayStart.toISOString()),
        supabase.from("rep_breaks").select("id,sales_rep_id,store_id,reason,started_at,ended_at").gte("started_at", todayStart.toISOString()),
      ]);
      if (!alive) return;
      setTodayRows((today as AlertRow[]) ?? []);
      setYesterdayRows((yesterday as AlertRow[]) ?? []);
      setBreakRows((breaks as AlertBreakRow[]) ?? []);
    };
    load();
    const interval = setInterval(load, ALERTS_POLL_MS);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  return useMemo(() => {
    const alerts: DashboardAlert[] = [];
    const now = new Date();
    const nowWithinHours = isWithinOperatingHours(now);
    const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "Loja";
    const repName = (id: string) => reps.find((r) => r.id === id)?.name ?? "Vendedora";

    const storeIds = Array.from(
      new Set([...todayRows.map((r) => r.store_id), ...breakRows.map((b) => b.store_id)].filter((x): x is string => Boolean(x))),
    );

    const convByStore = new Map<string, { conv: number; n: number }>();

    for (const sid of storeIds) {
      const storeToday = todayRows.filter((r) => r.store_id === sid);
      const closedToday = storeToday.filter((r) => r.status === "closed");
      const salesToday = closedToday.filter((r) => r.type === "sale");
      const closedYesterday = yesterdayRows.filter((r) => r.store_id === sid && r.status === "closed");
      const salesYesterday = closedYesterday.filter((r) => r.type === "sale");

      if (closedToday.length > 0) convByStore.set(sid, { conv: (salesToday.length / closedToday.length) * 100, n: closedToday.length });

      // Regra: conversão caiu (mínimo de amostra pra não alertar por 1 ou 2 atendimentos)
      if (closedToday.length >= 5 && closedYesterday.length >= 5) {
        const convToday = (salesToday.length / closedToday.length) * 100;
        const convYesterday = (salesYesterday.length / closedYesterday.length) * 100;
        const drop = convYesterday - convToday;
        if (drop >= 10) {
          alerts.push({
            id: `conv-${sid}`,
            severity: "warning",
            message: `${storeName(sid)}: conversão caiu ${drop.toFixed(0)} pontos percentuais hoje em relação a ontem.`,
            storeId: sid,
          });
        }
      }

      // Regra: fila aumentando (atendimentos em aberto há mais de 15 min)
      const stuckInQueue = storeToday.filter((r) => r.status === "open" && minutesSince(r.created_at) >= 15);
      if (stuckInQueue.length > 5) {
        alerts.push({
          id: `fila-${sid}`,
          severity: "warning",
          message: `${storeName(sid)}: ${stuckInQueue.length} atendimentos em espera há mais de 15 minutos.`,
          storeId: sid,
        });
      }

      // Regra: nenhuma venda há muito tempo (só durante o horário operacional)
      if (nowWithinHours && storeToday.length > 0) {
        const lastSale = [...salesToday].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        const minsSinceSale = lastSale ? minutesSince(lastSale.created_at) : null;
        if (minsSinceSale === null || minsSinceSale >= 60) {
          alerts.push({
            id: `semvenda-${sid}`,
            severity: "critical",
            message: `${storeName(sid)}: nenhuma venda há mais de 1 hora.`,
            storeId: sid,
          });
        }
      }

      // Regra: loja sem movimento algum (só durante o horário operacional)
      if (nowWithinHours) {
        const lastActivity = [...storeToday].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        const minsSinceActivity = lastActivity ? minutesSince(lastActivity.created_at) : null;
        if (minsSinceActivity === null || minsSinceActivity >= 90) {
          alerts.push({
            id: `semmov-${sid}`,
            severity: "critical",
            message: `${storeName(sid)}: sem nenhum atendimento registrado há mais de 1h30.`,
            storeId: sid,
          });
        }
      }

      // Regra: pausas acima do normal (soma de minutos em pausa hoje, na loja toda)
      const storeBreaksToday = breakRows.filter((b) => b.store_id === sid && b.reason !== "Fora horário de trabalho");
      const totalPauseMin = storeBreaksToday.reduce((sum, b) => {
        const endMs = b.ended_at ? new Date(b.ended_at).getTime() : Date.now();
        return sum + (endMs - new Date(b.started_at).getTime()) / 60000;
      }, 0);
      if (totalPauseMin > 180) {
        alerts.push({
          id: `pausa-${sid}`,
          severity: "info",
          message: `${storeName(sid)}: ${Math.round(totalPauseMin)} minutos de pausa acumulados hoje.`,
          storeId: sid,
        });
      }
    }

    // Regra: loja destoante das demais (só faz sentido com 2+ lojas com amostra mínima)
    const comparable = Array.from(convByStore.entries()).filter(([, v]) => v.n >= 5);
    if (comparable.length >= 2) {
      for (const [sid, v] of comparable) {
        const others = comparable.filter(([osid]) => osid !== sid);
        const avgOthers = others.reduce((sum, [, o]) => sum + o.conv, 0) / others.length;
        if (avgOthers > 0 && v.conv < avgOthers / 2) {
          alerts.push({
            id: `destoante-${sid}`,
            severity: "info",
            message: `${storeName(sid)}: conversão bem abaixo da média das outras lojas hoje (${v.conv.toFixed(0)}% vs. ${avgOthers.toFixed(0)}%).`,
            storeId: sid,
          });
        }
      }
    }

    // Regra: vendedora zerada há muito tempo (em atendimento há 2h+ sem nenhuma venda)
    const repIdsToday = Array.from(new Set(todayRows.map((r) => r.sales_rep_id)));
    for (const rid of repIdsToday) {
      const rows = todayRows.filter((r) => r.sales_rep_id === rid && r.status === "closed");
      if (rows.length === 0) continue;
      const sales = rows.filter((r) => r.type === "sale");
      if (sales.length > 0) continue;
      const firstRow = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      const hoursSinceFirst = minutesSince(firstRow.created_at) / 60;
      if (hoursSinceFirst >= 2) {
        alerts.push({
          id: `zerada-${rid}`,
          severity: "info",
          message: `${repName(rid)} está há mais de 2h sem nenhuma venda hoje (${rows.length} atendimento${rows.length > 1 ? "s" : ""}).`,
          storeId: rows[0].store_id,
        });
      }
    }

    return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }, [todayRows, yesterdayRows, breakRows, stores, reps]);
}

function AlertBanner({ alert }: { alert: DashboardAlert }) {
  const styles =
    alert.severity === "critical"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : alert.severity === "warning"
        ? "border-amber-400/50 bg-amber-50 text-amber-800"
        : "border-border bg-muted text-foreground";
  const Icon = alert.severity === "critical" ? AlertCircle : alert.severity === "warning" ? AlertTriangle : Info;
  const label = alert.severity === "critical" ? "Crítico" : alert.severity === "warning" ? "Atenção" : "Informativo";
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <p><span className="font-bold">{label}:</span> {alert.message}</p>
    </div>
  );
}

type DashboardMetrics = {
  atendimentos: number;
  vendas: number;
  naoVendas: number;
  conversao: number;
  // Tempo médio entre abrir e fechar um atendimento (venda ou não-venda) — em
  // minutos. attendances.amount NÃO entra mais aqui: o kiosk nunca coleta um
  // valor monetário ao fechar uma venda (confirmado em
  // loja.$storeId.vendedora.$repId.index.tsx, registerSale), então
  // faturamento/ticket médio "de attendances" seria sempre R$ 0 na prática.
  // Faturamento real vem só de commission_rows — ver useCommissionSummary.
  tempoMedioAtendimentoMin: number;
};

function computeDashboardMetrics(data: Attendance[]): DashboardMetrics {
  const atendimentos = data.length;
  const vendasRows = data.filter((a) => a.type === "sale");
  const vendas = vendasRows.length;
  const naoVendas = atendimentos - vendas;
  const conversao = atendimentos > 0 ? (vendas / atendimentos) * 100 : 0;
  const closedRows = data.filter((a) => a.closed_at);
  const tempoMedioAtendimentoMin =
    closedRows.length > 0
      ? closedRows.reduce((sum, a) => sum + (new Date(a.closed_at!).getTime() - new Date(a.created_at).getTime()) / 60000, 0) /
        closedRows.length
      : 0;
  return { atendimentos, vendas, naoVendas, conversao, tempoMedioAtendimentoMin };
}

function useDashboardMetrics(data: Attendance[]): DashboardMetrics {
  return useMemo(() => computeDashboardMetrics(data), [data]);
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMinutes(mins: number): string {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatAvgMinutes(mins: number): string {
  if (mins >= 60) return formatMinutes(mins);
  return `${mins.toFixed(1)} min`;
}

// Minutos em pausa (excluindo o sentinela "Fora horário de trabalho", já
// ignorado em todo o resto do app) no período/escopo selecionado.
function useBreakMinutes(start: Date, end: Date, storeId: string, repId: string): number {
  const [minutes, setMinutes] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      let q = supabase
        .from("rep_breaks")
        .select("sales_rep_id,store_id,reason,started_at,ended_at")
        .gte("started_at", start.toISOString())
        .lte("started_at", end.toISOString());
      if (storeId !== ALL_STORES) q = q.eq("store_id", storeId);
      if (repId !== ALL_REPS) q = q.eq("sales_rep_id", repId);
      const { data } = await q;
      if (!alive) return;
      const total = ((data ?? []) as { reason: string | null; started_at: string; ended_at: string | null }[])
        .filter((b) => b.reason !== "Fora horário de trabalho")
        .reduce((sum, b) => {
          const endMs = b.ended_at ? new Date(b.ended_at).getTime() : Date.now();
          return sum + (endMs - new Date(b.started_at).getTime()) / 60000;
        }, 0);
      setMinutes(Math.round(total));
    })();
    return () => {
      alive = false;
    };
  }, [start.getTime(), end.getTime(), storeId, repId]);
  return minutes;
}

type TrendMetric = "faturamento" | "atendimentos" | "conversao";
const TREND_METRIC_LABELS: Record<TrendMetric, string> = {
  faturamento: "Faturamento",
  atendimentos: "Atendimentos",
  conversao: "Conversão",
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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

type RepOption = { id: string; name: string; store_id: string | null; active: boolean };

function RepFilter({ repId, setRepId, reps, storeId, stores }: {
  repId: string; setRepId: (r: string) => void;
  reps: RepOption[]; storeId: string; stores: Store[];
}) {
  const options = useMemo(() => {
    const filtered = reps.filter((r) => r.active && (storeId === ALL_STORES || r.store_id === storeId));
    return filtered.map((r) => {
      if (storeId !== ALL_STORES) return { id: r.id, label: r.name };
      const storeName = stores.find((s) => s.id === r.store_id)?.name;
      return { id: r.id, label: storeName ? `${r.name} (${storeName})` : r.name };
    });
  }, [reps, storeId, stores]);

  return (
    <div className="mb-4 flex items-center gap-2">
      <UserSearch size={18} className="text-brand" />
      <select
        value={repId}
        onChange={(e) => setRepId(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
      >
        <option value={ALL_REPS}>Todas as vendedoras</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
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
  const actor = getAdminActor();
  const [preset, setPreset] = useState<Preset>("hoje");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Gerentes abrem o Dashboard já filtrado na própria loja (decisão da Etapa 4.1);
  // outros papéis continuam vendo "Todas as lojas" por padrão.
  const [storeId, setStoreId] = useState<string>(() =>
    actor && actor.role === "gerente" && actor.storeId ? actor.storeId : ALL_STORES,
  );
  const [repId, setRepId] = useState<string>(ALL_REPS);
  const handleStoreChange = (s: string) => { setStoreId(s); setRepId(ALL_REPS); };
  const [compareEnabled, setCompareEnabled] = useState(false);
  const { stores } = useStores();
  const { start, end } = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);
  const { data, loading } = useAttendances(start, end, storeId);
  const previousRange = useMemo(() => previousRangeFor(start, end), [start, end]);
  const { data: previousData } = useAttendances(previousRange.start, previousRange.end, storeId);
  const [reps, setReps] = useState<RepOption[]>([]);
  const [reasons, setReasons] = useState<{ id: string; label: string; is_other: boolean }[]>([]);

  useEffect(() => {
    supabase.from("sales_reps").select("id,name,store_id,active").then(({ data }) => setReps((data as RepOption[]) ?? []));
    supabase.from("no_sale_reasons").select("id,label,is_other").then(({ data }) => setReasons((data as any) ?? []));
  }, []);

  const filteredData = useMemo(
    () => (repId === ALL_REPS ? data : data.filter((a) => a.sales_rep_id === repId)),
    [data, repId],
  );
  const filteredPreviousData = useMemo(
    () => (repId === ALL_REPS ? previousData : previousData.filter((a) => a.sales_rep_id === repId)),
    [previousData, repId],
  );

  const metrics = useDashboardMetrics(filteredData);
  const previousMetrics = useDashboardMetrics(filteredPreviousData);
  const breakMinutes = useBreakMinutes(start, end, storeId, repId);
  const previousBreakMinutes = useBreakMinutes(previousRange.start, previousRange.end, storeId, repId);

  const allAlerts = useAlerts(stores, reps);
  const visibleAlerts = useMemo(
    () => (storeId === ALL_STORES ? allAlerts : allAlerts.filter((a) => a.storeId === storeId || a.storeId === null)),
    [allAlerts, storeId],
  );

  const ranking = useMemo(() => {
    const map = new Map<string, { atendimentos: number; vendas: number }>();
    for (const a of filteredData) {
      const cur = map.get(a.sales_rep_id) ?? { atendimentos: 0, vendas: 0 };
      cur.atendimentos++;
      if (a.type === "sale") cur.vendas++;
      map.set(a.sales_rep_id, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      name: reps.find((r) => r.id === id)?.name ?? "—",
      atendimentos: v.atendimentos,
      vendas: v.vendas,
      conversao: v.atendimentos > 0 ? (v.vendas / v.atendimentos) * 100 : 0,
    })).sort((a, b) => b.vendas - a.vendas);
  }, [filteredData, reps]);

  const reasonChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of filteredData) {
      if (a.type !== "no_sale" || !a.reason_id) continue;
      map.set(a.reason_id, (map.get(a.reason_id) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([id, v]) => ({
      name: reasons.find((r) => r.id === id)?.label ?? "—",
      qtd: v,
    })).sort((a, b) => b.qtd - a.qtd);
  }, [filteredData, reasons]);

  const [trendMetric, setTrendMetric] = useState<TrendMetric>("faturamento");
  const isHourlyTrend = preset === "hoje" || preset === "ontem";

  const trendChart = useMemo(() => {
    type Bucket = { label: string; faturamento: number; atendimentos: number; vendas: number };
    const buckets: Bucket[] = [];
    const byKey = new Map<string, Bucket>();

    if (isHourlyTrend) {
      for (let h = 8; h <= 22; h++) {
        const b: Bucket = { label: `${h}h`, faturamento: 0, atendimentos: 0, vendas: 0 };
        buckets.push(b);
        byKey.set(String(h), b);
      }
      for (const a of filteredData) {
        const h = new Date(a.created_at).getHours();
        let b = byKey.get(String(h));
        if (!b) { b = { label: `${h}h`, faturamento: 0, atendimentos: 0, vendas: 0 }; byKey.set(String(h), b); buckets.push(b); }
        b.atendimentos++;
        if (a.type === "sale") { b.vendas++; b.faturamento += a.amount ?? 0; }
      }
      buckets.sort((x, y) => parseInt(x.label) - parseInt(y.label));
    } else {
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cursor <= endDay) {
        const key = dayKey(cursor);
        const b: Bucket = { label: dayLabel(cursor), faturamento: 0, atendimentos: 0, vendas: 0 };
        buckets.push(b);
        byKey.set(key, b);
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const a of filteredData) {
        const d = new Date(a.created_at);
        const key = dayKey(d);
        let b = byKey.get(key);
        if (!b) { b = { label: dayLabel(d), faturamento: 0, atendimentos: 0, vendas: 0 }; byKey.set(key, b); buckets.push(b); }
        b.atendimentos++;
        if (a.type === "sale") { b.vendas++; b.faturamento += a.amount ?? 0; }
      }
    }

    return buckets.map((b) => ({
      label: b.label,
      faturamento: Math.round(b.faturamento * 100) / 100,
      atendimentos: b.atendimentos,
      conversao: b.atendimentos > 0 ? Math.round((b.vendas / b.atendimentos) * 1000) / 10 : 0,
    }));
  }, [filteredData, isHourlyTrend, start, end]);

  // Comparativo entre lojas, na mesma métrica escolhida no gráfico de tendência.
  // Só faz sentido quando "Todas as lojas" está selecionado — comparar uma loja
  // com ela mesma não ajuda em nada.
  const storeRanking = useMemo(() => {
    if (storeId !== ALL_STORES) return [];
    const map = new Map<string, { faturamento: number; atendimentos: number; vendas: number }>();
    for (const a of filteredData) {
      const sid = a.store_id ?? "sem_loja";
      const cur = map.get(sid) ?? { faturamento: 0, atendimentos: 0, vendas: 0 };
      cur.atendimentos++;
      if (a.type === "sale") { cur.vendas++; cur.faturamento += a.amount ?? 0; }
      map.set(sid, cur);
    }
    return Array.from(map.entries())
      .map(([sid, v]) => ({
        name: stores.find((s) => s.id === sid)?.name ?? "—",
        faturamento: Math.round(v.faturamento * 100) / 100,
        atendimentos: v.atendimentos,
        vendas: v.vendas,
        conversao: v.atendimentos > 0 ? Math.round((v.vendas / v.atendimentos) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b[trendMetric] - a[trendMetric]);
  }, [filteredData, storeId, stores, trendMetric]);

  // Tabela de ranking (ordenada por vendas, como o ranking de vendedoras já sempre foi)
  // — diferente do gráfico acima, que ordena pela métrica escolhida na Tendência.
  const storeRankingTable = useMemo(
    () => [...storeRanking].sort((a, b) => b.vendas - a.vendas),
    [storeRanking],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <StoreFilter storeId={storeId} setStoreId={handleStoreChange} stores={stores} />
        <RepFilter repId={repId} setRepId={setRepId} reps={reps} storeId={storeId} stores={stores} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <DateRangeBar preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />
        <label className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <input type="checkbox" checked={compareEnabled} onChange={(e) => setCompareEnabled(e.target.checked)} />
          Comparar com período anterior
        </label>
      </div>

      {visibleAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {visibleAlerts.map((a) => (
            <AlertBanner key={a.id} alert={a} />
          ))}
        </div>
      )}

      {/* xl (não md): em tablet — retrato ou paisagem — os 4 KPIs ficam 2x2; só desktop de verdade vira uma fileira só. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          title="Atendimentos"
          value={metrics.atendimentos}
          delta={compareEnabled ? deltaPct(metrics.atendimentos, previousMetrics.atendimentos) : null}
        />
        <Kpi
          title="Conversão"
          value={`${metrics.conversao.toFixed(1)}% · ${metrics.vendas} vendas`}
          accent="success"
          delta={compareEnabled ? deltaPontosPercentuais(metrics.conversao, previousMetrics.conversao) : null}
        />
        <Kpi
          title="Tempo médio de atendimento"
          value={formatAvgMinutes(metrics.tempoMedioAtendimentoMin)}
          delta={compareEnabled ? deltaPct(metrics.tempoMedioAtendimentoMin, previousMetrics.tempoMedioAtendimentoMin) : null}
        />
        <Kpi
          title="Minutos em pausa"
          value={formatMinutes(breakMinutes)}
          delta={compareEnabled ? deltaPct(breakMinutes, previousBreakMinutes) : null}
        />
      </div>

      <div className="mt-6">
        <LiveStrip storeId={storeId} />
      </div>

      {loading && <p className="mt-6 text-center text-muted-foreground">Carregando…</p>}

      {/* xl: em tablet as duas tabelas ficam empilhadas (largura cheia cada uma) em vez de
          espremidas lado a lado — tabela com várias colunas precisa de espaço. */}
      <div className={`mt-8 grid grid-cols-1 gap-6 ${storeId === ALL_STORES ? "xl:grid-cols-2" : ""}`}>
        {storeId === ALL_STORES && (
          <RankingCard
            title="Ranking das lojas"
            nameLabel="Loja"
            rows={storeRankingTable}
            emptyLabel="Sem atendimentos no período."
          />
        )}
        <RankingCard
          title="Ranking das vendedoras"
          nameLabel="Vendedora"
          rows={ranking}
          emptyLabel="Sem atendimentos no período."
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-2xl bg-card p-5 shadow-sm xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold">Tendência</h3>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {(Object.keys(TREND_METRIC_LABELS) as TrendMetric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setTrendMetric(m)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    trendMetric === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {TREND_METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={trendMetric !== "atendimentos"} />
              <Tooltip
                formatter={(value: number) =>
                  trendMetric === "faturamento" ? formatBRL(Number(value)) : trendMetric === "conversao" ? `${Number(value).toFixed(1)}%` : value
                }
              />
              <Line type="monotone" dataKey={trendMetric} stroke="var(--color-brand)" strokeWidth={3} dot />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="rounded-2xl bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-bold">Top motivos de não venda</h3>
          {reasonChart.length === 0 ? (
            <p className="text-muted-foreground">Sem dados.</p>
          ) : (
            <ul className="space-y-3">
              {reasonChart.slice(0, 3).map((r) => {
                const max = reasonChart[0].qtd;
                const pct = max > 0 ? (r.qtd / max) * 100 : 0;
                return (
                  <li key={r.name}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{r.name}</span>
                      <span className="shrink-0 font-semibold text-muted-foreground">{r.qtd}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-destructive" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {storeId === ALL_STORES && (
        <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-bold">Ranking de lojas — {TREND_METRIC_LABELS[trendMetric]}</h3>
          {storeRanking.length === 0 ? (
            <p className="text-muted-foreground">Sem dados no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(140, storeRanking.length * 60)}>
              <BarChart data={storeRanking} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={trendMetric !== "atendimentos"} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) =>
                    trendMetric === "faturamento" ? formatBRL(Number(value)) : trendMetric === "conversao" ? `${Number(value).toFixed(1)}%` : value
                  }
                />
                <Bar dataKey={trendMetric} fill="var(--color-brand)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      )}

      <section className="mt-8 rounded-2xl bg-card p-5 shadow-sm">
        <h3 className="font-bold">Insights do BPInfo AI</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Em breve, observações automáticas sobre o desempenho do período — como quedas de conversão, lojas fora do
          padrão ou vendedoras em destaque.
        </p>
      </section>
    </div>
  );
}

function Kpi({ title, value, accent, delta }: { title: string; value: string | number; accent?: "success" | "destructive" | "brand"; delta?: KpiDelta | null }) {
  const color = accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : accent === "brand" ? "text-brand" : "text-foreground";
  const deltaColor = delta?.direction === "up" ? "text-success" : delta?.direction === "down" ? "text-destructive" : "text-muted-foreground";
  const DeltaIcon = delta?.direction === "up" ? ArrowUp : delta?.direction === "down" ? ArrowDown : null;
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</p>
      {delta && (
        <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${deltaColor}`}>
          {DeltaIcon && <DeltaIcon size={12} />} {delta.label}
        </p>
      )}
    </div>
  );
}

type RankingRow = { name: string; atendimentos: number; vendas: number; conversao: number };

function RankingCard({ title, nameLabel, rows, emptyLabel }: { title: string; nameLabel: string; rows: RankingRow[]; emptyLabel: string }) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">{nameLabel}</th>
                <th className="px-3 py-2 text-right">Atendimentos</th>
                <th className="px-3 py-2 text-right">Vendas</th>
                <th className="px-3 py-2 text-right">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name + i} className="border-t border-border">
                  <td className="px-3 py-3 font-semibold">{i + 1}º</td>
                  <td className="px-3 py-3">{r.name}</td>
                  <td className="px-3 py-3 text-right">{r.atendimentos}</td>
                  <td className="px-3 py-3 text-right font-semibold">{r.vendas}</td>
                  <td className="px-3 py-3 text-right">{r.conversao.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
    doc.setFontSize(16); doc.text("BP Demo — Atendimentos", 14, 15);
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

type AdminRole = "admin" | "gerente" | "super_admin";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  must_change_password: boolean;
  two_factor_enabled: boolean;
  last_login_at: string | null;
  password_changed_at: string | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};

type SortKey = "name" | "email" | "role" | "active" | "last_login_at" | "created_at";

const AVATAR_PALETTE = [
  "bg-brand/15 text-brand",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function paletteFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function friendlyAdminError(message?: string): string {
  const m = message ?? "";
  if (m.includes("email already registered")) return "Esse e-mail já está cadastrado.";
  if (m.includes("must keep at least one active super admin"))
    return "Não é possível desativar o último Super Administrador ativo.";
  if (m.includes("cannot deactivate yourself"))
    return "Você não pode se desativar — isso deixaria o sistema sem nenhum administrador.";
  if (m.includes("name required")) return "Informe o nome.";
  if (m.includes("email required")) return "Informe o e-mail.";
  if (m.includes("password too short")) return "A senha precisa ter ao menos 4 caracteres.";
  if (m.includes("unauthorized")) return "Sua sessão expirou. Faça login novamente.";
  if (m.includes("not found")) return "Usuário não encontrado.";
  return "Algo deu errado. Tente novamente.";
}

function AvatarBadge({ name }: { name: string }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${paletteFor(name || "?")}`}>
      {initialsFor(name || "?")}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" /> Ativa
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" /> Desativada
    </span>
  );
}

function formatLastAccess(iso: string | null): string {
  if (!iso) return "Nunca acessou";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SortHeader({
  label,
  sortKey,
  current,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
}) {
  const active = current.key === sortKey;
  const Icon = active ? (current.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className="px-4 py-3">
      <button
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label} <Icon size={13} />
      </button>
    </th>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPasswordMode, setNewPasswordMode] = useState<"temporaria" | "definitiva">("temporaria");
  const [newRole, setNewRole] = useState<AdminRole>("admin");
  const [newRequireChange, setNewRequireChange] = useState(true);

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPass, setEditPass] = useState("");
  const [editPasswordMode, setEditPasswordMode] = useState<"temporaria" | "definitiva">("temporaria");
  const [editRole, setEditRole] = useState<AdminRole>("admin");
  const [editRequireChange, setEditRequireChange] = useState(true);
  const [show2faSetup, setShow2faSetup] = useState(false);
  const [reconfigure2fa, setReconfigure2fa] = useState(false);

  const actor = getAdminActor();
  const requestIdRef = useRef(0);

  const load = async () => {
    if (!actor) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_list", {
        _actor: actor.user,
        _actor_password: actor.pass,
      });
      // Ignora a resposta se, enquanto ela estava em trânsito, outra chamada mais
      // recente a load() já foi disparada (ex.: efeito duplicado, troca rápida de aba).
      if (requestId !== requestIdRef.current) return;
      if (error) {
        toast.error(friendlyAdminError(error.message));
        return;
      }
      setUsers((data ?? []) as AdminUser[]);
    } catch {
      if (requestId === requestIdRef.current) toast.error("Erro ao carregar usuários");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const create = async () => {
    if (!actor) return;
    if (!newName.trim() || !newEmail.trim() || newPass.length < 4) {
      toast.error("Nome, e-mail e senha (mínimo 4 caracteres) obrigatórios");
      return;
    }
    const { error } = await supabase.rpc("admin_create", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _name: newName.trim(),
      _email: newEmail.trim(),
      _password: newPass,
      _role: newRole,
      _require_password_change: newRequireChange,
    });
    if (error) { toast.error(friendlyAdminError(error.message)); return; }
    toast.success("Usuário criado");
    setNewName(""); setNewEmail(""); setNewPass(""); setNewRole("admin");
    setNewPasswordMode("temporaria"); setNewRequireChange(true); setShowNew(false);
    load();
  };

  const save = async () => {
    if (!actor || !editing) return;
    const newNameValue = editName.trim();
    const newEmailValue = editEmail.trim();
    const newPwd = editPass;
    if (!newNameValue && !newEmailValue && !newPwd && editRole === editing.role) { setEditing(null); return; }
    if (newPwd && newPwd.length < 4) { toast.error("Senha muito curta"); return; }
    const { error } = await supabase.rpc("admin_update", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _id: editing.id,
      _new_name: newNameValue || (null as unknown as string),
      _new_email: newEmailValue || (null as unknown as string),
      _new_password: newPwd || (null as unknown as string),
      _new_role: editRole !== editing.role ? editRole : (null as unknown as AdminRole),
      _require_password_change: editRequireChange,
    });
    if (error) { toast.error(friendlyAdminError(error.message)); return; }
    toast.success("Usuário atualizado");
    setEditing(null); setEditName(""); setEditEmail(""); setEditPass("");
    setEditPasswordMode("temporaria"); setEditRequireChange(true);
    load();
  };

  const unlockUser = async (u: AdminUser) => {
    if (!actor) return;
    const { error } = await supabase.rpc("admin_unlock", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _target_id: u.id,
    });
    if (error) { toast.error(friendlyAdminError(error.message)); return; }
    toast.success("Usuário desbloqueado");
    setEditing((prev) => (prev && prev.id === u.id ? { ...prev, locked_until: null } : prev));
    load();
  };

  const openTwoFactorSetup = (isReconfigure: boolean) => {
    if (
      isReconfigure &&
      !confirm(
        "Isso gera uma nova chave e novos códigos de recuperação — o aplicativo autenticador atual vai parar de funcionar até você escanear o novo QR Code. Continuar?",
      )
    ) {
      return;
    }
    setReconfigure2fa(isReconfigure);
    setShow2faSetup(true);
  };

  const disableOwnTwoFactor = async () => {
    if (!actor) return;
    if (!confirm("Desativar a autenticação em duas etapas da sua conta?")) return;
    const { error } = await supabase.rpc("admin_2fa_disable", {
      _actor: actor.user,
      _actor_password: actor.pass,
    });
    if (error) { toast.error(friendlyAdminError(error.message)); return; }
    toast.success("Autenticação em duas etapas desativada");
    setEditing((prev) => (prev ? { ...prev, two_factor_enabled: false } : prev));
    load();
  };

  const forceDisableTwoFactor = async (u: AdminUser) => {
    if (!actor) return;
    if (!confirm(`Forçar a desativação da autenticação em duas etapas de "${u.name}"? Use isso apenas em caso de perda do dispositivo.`)) return;
    const { error } = await supabase.rpc("admin_force_disable_2fa", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _target_id: u.id,
    });
    if (error) { toast.error(friendlyAdminError(error.message)); return; }
    toast.success("Autenticação em duas etapas desativada");
    setEditing((prev) => (prev && prev.id === u.id ? { ...prev, two_factor_enabled: false } : prev));
    load();
  };

  const toggleActive = async (u: AdminUser) => {
    if (!actor) return;
    const nextActive = !u.active;
    const label = nextActive ? "reativar" : "desativar";
    if (!confirm(`Deseja ${label} o usuário "${u.name}"?`)) return;
    const { error } = await supabase.rpc("admin_set_active", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _id: u.id,
      _active: nextActive,
    });
    if (error) { toast.error(friendlyAdminError(error.message)); return; }
    toast.success(nextActive ? "Usuário reativado" : "Usuário desativado");
    load();
  };

  const onSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : users;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort.key === "active") cmp = Number(a.active) - Number(b.active);
      else if (sort.key === "last_login_at") cmp = (a.last_login_at ?? "").localeCompare(b.last_login_at ?? "");
      else cmp = String(a[sort.key]).localeCompare(String(b[sort.key]));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [users, query, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              <label className="mb-1 block text-sm font-semibold">Nome</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold">E-mail</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold">Cargo</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as AdminRole)}
                className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5">
                <option value="admin">Administrador</option>
                <option value="gerente">Gerente</option>
                <option value="super_admin">Super Administrador</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-semibold">Tipo da nova senha</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 transition ${
                    newPasswordMode === "definitiva" ? "border-brand bg-brand/5" : "border-border"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      checked={newPasswordMode === "definitiva"}
                      onChange={() => { setNewPasswordMode("definitiva"); setNewRequireChange(false); setNewPass(""); }}
                    />
                    Definitiva
                  </span>
                  <span className="text-xs text-muted-foreground">O usuário continuará utilizando esta senha.</span>
                </label>
                <label
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 transition ${
                    newPasswordMode === "temporaria" ? "border-brand bg-brand/5" : "border-border"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      checked={newPasswordMode === "temporaria"}
                      onChange={() => { setNewPasswordMode("temporaria"); setNewRequireChange(true); setNewPass(""); }}
                    />
                    Temporária
                  </span>
                  <span className="text-xs text-muted-foreground">O usuário será obrigado a criar uma nova senha no próximo acesso.</span>
                </label>
              </div>

              {newPasswordMode === "temporaria" && (
                <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                  <Lock size={12} /> A troca de senha no primeiro acesso será habilitada automaticamente.
                </p>
              )}

              <div className="mt-3">
                {newPasswordMode === "temporaria" ? (
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={newPass}
                      placeholder="clique em gerar"
                      className="w-full rounded-xl border-2 border-border bg-muted px-4 py-2.5 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setNewPass(generateTempPassword())}
                      className="shrink-0 rounded-xl border-2 border-border px-4 py-2.5 font-semibold hover:bg-muted"
                    >
                      Gerar
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="mínimo 4 caracteres"
                    className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5"
                  />
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={create} className="rounded-xl bg-brand px-4 py-2 font-semibold text-brand-foreground">Salvar</button>
            <button
              onClick={() => {
                setShowNew(false);
                setNewName(""); setNewEmail(""); setNewPass(""); setNewRole("admin");
                setNewPasswordMode("temporaria"); setNewRequireChange(true);
              }}
              className="rounded-xl border border-border px-4 py-2 font-semibold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className="w-full rounded-xl border-2 border-border bg-background py-2.5 pl-9 pr-3"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Carregando...</div>
        ) : filteredSorted.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            {query ? "Nenhum usuário encontrado para essa busca." : "Nenhum usuário cadastrado."}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-sm">
              <tr>
                <SortHeader label="Nome" sortKey="name" current={sort} onSort={onSort} />
                <SortHeader label="E-mail" sortKey="email" current={sort} onSort={onSort} />
                <SortHeader label="Cargo" sortKey="role" current={sort} onSort={onSort} />
                <SortHeader label="Status" sortKey="active" current={sort} onSort={onSort} />
                <SortHeader label="Último acesso" sortKey="last_login_at" current={sort} onSort={onSort} />
                <SortHeader label="Criado" sortKey="created_at" current={sort} onSort={onSort} />
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((u) => (
                <tr key={u.id} className={`border-t border-border ${u.active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <AvatarBadge name={u.name} />
                      <div>
                        <div className="flex items-center gap-2 font-semibold">
                          {u.name}
                          {actor && u.email === actor.user && (
                            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">você</span>
                          )}
                        </div>
                        {u.must_change_password && (
                          <span className="text-xs text-amber-700">Aguardando troca de senha</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3 text-sm">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="px-4 py-3"><StatusBadge active={u.active} /></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatLastAccess(u.last_login_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditing(u);
                          setEditName(u.name);
                          setEditEmail(u.email);
                          setEditPass("");
                          setEditPasswordMode("temporaria");
                          setEditRole(u.role);
                          setEditRequireChange(true);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      {u.active ? (
                        <button
                          onClick={() => toggleActive(u)}
                          className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                        >
                          <UserX size={14} /> Desativar
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleActive(u)}
                          className="flex items-center gap-1 rounded-lg border border-success/40 px-3 py-1.5 text-sm text-success hover:bg-success/10"
                        >
                          <UserCheck size={14} /> Reativar
                        </button>
                      )}
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
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <AvatarBadge name={editing.name} />
              <div>
                <h3 className="text-lg font-bold">{editing.name}</h3>
                <p className="text-sm text-muted-foreground">{editing.email}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold">Nome</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">E-mail</label>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">Cargo</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value as AdminRole)}
                  className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5">
                  <option value="admin">Administrador</option>
                  <option value="gerente">Gerente</option>
                  <option value="super_admin">Super Administrador</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Último acesso</p>
                  <p className="font-medium">{formatLastAccess(editing.last_login_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data de criação</p>
                  <p className="font-medium">{new Date(editing.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Senha alterada em</p>
                  <p className="font-medium">
                    {editing.password_changed_at ? new Date(editing.password_changed_at).toLocaleDateString("pt-BR") : "Nunca alterada"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Segurança</h4>

              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-background p-4">
                  <label className="mb-2 block text-sm font-semibold">Tipo da nova senha</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label
                      className={`flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 transition ${
                        editPasswordMode === "definitiva" ? "border-brand bg-brand/5" : "border-border"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="radio"
                          checked={editPasswordMode === "definitiva"}
                          onChange={() => { setEditPasswordMode("definitiva"); setEditRequireChange(false); setEditPass(""); }}
                        />
                        Definitiva
                      </span>
                      <span className="text-xs text-muted-foreground">O usuário continuará utilizando esta senha.</span>
                    </label>
                    <label
                      className={`flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 transition ${
                        editPasswordMode === "temporaria" ? "border-brand bg-brand/5" : "border-border"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="radio"
                          checked={editPasswordMode === "temporaria"}
                          onChange={() => { setEditPasswordMode("temporaria"); setEditRequireChange(true); setEditPass(""); }}
                        />
                        Temporária
                      </span>
                      <span className="text-xs text-muted-foreground">O usuário será obrigado a criar uma nova senha no próximo acesso.</span>
                    </label>
                  </div>

                  {editPasswordMode === "temporaria" && (
                    <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
                      <Lock size={12} /> A troca de senha no próximo acesso será habilitada automaticamente.
                    </p>
                  )}

                  <div className="mt-3">
                    {editPasswordMode === "temporaria" ? (
                      <div className="flex gap-2">
                        <input
                          readOnly
                          value={editPass}
                          placeholder="deixe em branco para manter a atual"
                          className="w-full rounded-xl border-2 border-border bg-muted px-4 py-2.5 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setEditPass(generateTempPassword())}
                          className="shrink-0 rounded-xl border-2 border-border px-4 py-2.5 font-semibold hover:bg-muted"
                        >
                          Gerar
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={editPass}
                        onChange={(e) => setEditPass(e.target.value)}
                        placeholder="deixe em branco para manter a atual"
                        className="w-full rounded-xl border-2 border-border bg-background px-4 py-2.5"
                      />
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        editing.two_factor_enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {editing.two_factor_enabled ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h5 className="text-sm font-semibold">Autenticação em duas etapas</h5>
                      {!editing.two_factor_enabled && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Proteja a conta utilizando um aplicativo autenticador (Google Authenticator, Microsoft
                          Authenticator, Authy e compatíveis).
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5 text-sm">
                        <span className={`h-2 w-2 rounded-full ${editing.two_factor_enabled ? "bg-success" : "bg-muted-foreground/50"}`} />
                        <span className={`font-semibold ${editing.two_factor_enabled ? "text-success" : "text-muted-foreground"}`}>
                          {editing.two_factor_enabled ? "Protegida" : "Desabilitada"}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {actor && editing.email === actor.user ? (
                          editing.two_factor_enabled ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openTwoFactorSetup(true)}
                                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                              >
                                Gerenciar
                              </button>
                              <button
                                type="button"
                                onClick={disableOwnTwoFactor}
                                className="rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                              >
                                Desativar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openTwoFactorSetup(false)}
                              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground hover:opacity-90"
                            >
                              Configurar agora
                            </button>
                          )
                        ) : editing.two_factor_enabled ? (
                          <button
                            type="button"
                            onClick={() => forceDisableTwoFactor(editing)}
                            className="rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                          >
                            Forçar desativação
                          </button>
                        ) : (
                          <p className="text-xs text-muted-foreground">Configurada pelo próprio usuário ao entrar no painel.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <h5 className="text-sm font-semibold">Sessões</h5>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Este recurso será disponibilizado em uma próxima atualização.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Status da conta</span>
                    <StatusBadge active={editing.active} />
                  </div>
                  {editing.locked_until && new Date(editing.locked_until) > new Date() && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                        <Lock size={12} /> Bloqueada temporariamente — libera às{" "}
                        {new Date(editing.locked_until).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => unlockUser(editing)}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                      >
                        <Unlock size={12} /> Desbloquear
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)}
                className="rounded-xl border border-border px-4 py-2 font-semibold">Cancelar</button>
              <button onClick={save}
                className="rounded-xl bg-brand px-4 py-2 font-semibold text-brand-foreground">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {show2faSetup && editing && (
        <TwoFactorSetupModal
          isReconfigure={reconfigure2fa}
          onClose={() => setShow2faSetup(false)}
          onEnabled={() => {
            setShow2faSetup(false);
            setEditing((prev) => (prev ? { ...prev, two_factor_enabled: true } : prev));
            load();
          }}
        />
      )}
    </div>
  );
}

function TwoFactorSetupModal({
  isReconfigure,
  onClose,
  onEnabled,
}: {
  isReconfigure?: boolean;
  onClose: () => void;
  onEnabled: () => void;
}) {
  const actor = getAdminActor();
  const [step, setStep] = useState<"loading" | "scan" | "codes" | "error">("loading");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    (async () => {
      if (!actor) { setStep("error"); return; }
      const { data, error: err } = await supabase.rpc("admin_2fa_setup_init", {
        _actor: actor.user,
        _actor_password: actor.pass,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (err || !row) { setStep("error"); return; }
      setSecret(row.secret);
      setOtpauthUrl(row.otpauth_url);
      try {
        setQrDataUrl(await QRCode.toDataURL(row.otpauth_url));
      } catch {
        // sem QR: usuário ainda pode inserir a chave manualmente
      }
      setStep("scan");
    })();
    // eslint-disable-next-line
  }, []);

  const confirm = async () => {
    if (!actor || code.length !== 6) return;
    setVerifying(true);
    setError("");
    const { data, error: err } = await supabase.rpc("admin_2fa_setup_verify", {
      _actor: actor.user,
      _actor_password: actor.pass,
      _code: code,
    });
    setVerifying(false);
    if (err || !data) {
      setError("Código inválido. Confira o app e tente novamente.");
      return;
    }
    setRecoveryCodes(data as string[]);
    setStep("codes");
  };

  const copyAllCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={step === "codes" ? undefined : onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-bold">
          {isReconfigure ? "Reconfigurar autenticação em duas etapas" : "Configurar autenticação em duas etapas"}
        </h3>

        {step === "loading" && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 size={18} className="animate-spin" /> Gerando chave secreta...
          </div>
        )}

        {step === "error" && (
          <div>
            <p className="text-sm text-destructive">Não foi possível iniciar a configuração. Tente novamente.</p>
            <button onClick={onClose} className="mt-4 w-full rounded-xl border border-border px-4 py-2 font-semibold">Fechar</button>
          </div>
        )}

        {step === "scan" && (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              {isReconfigure && (
                <span className="mb-1 block font-semibold text-amber-700">
                  A chave e os códigos de recuperação anteriores deixarão de funcionar assim que a nova configuração for confirmada.
                </span>
              )}
              Escaneie o QR Code com o Google Authenticator, Microsoft Authenticator, Authy, Bitwarden ou 1Password.
            </p>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR Code" className="mx-auto mb-3 h-44 w-44 rounded-xl border border-border" />
            )}
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Ou digite a chave manualmente:</p>
            <code className="mb-4 block break-all rounded-lg bg-muted px-2 py-1.5 text-xs">{secret}</code>

            <label className="mb-1 block text-sm font-semibold">Código de 6 dígitos</label>
            <InputOTP maxLength={6} value={code} onChange={setCode} containerClassName="justify-center">
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>

            {error && <p className="mt-3 text-center text-sm font-semibold text-destructive">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 font-semibold">Cancelar</button>
              <button
                onClick={confirm}
                disabled={code.length !== 6 || verifying}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-60"
              >
                {verifying && <Loader2 size={16} className="animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        )}

        {step === "codes" && (
          <div>
            <div className="mb-3 flex items-center gap-2 text-success">
              <ShieldCheck size={18} /> <span className="text-sm font-semibold">Ativada com sucesso!</span>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Guarde estes códigos de recuperação em um lugar seguro. Cada um pode ser usado uma única vez para entrar caso você perca acesso ao seu app autenticador.
            </p>
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <button
              onClick={copyAllCodes}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-border px-4 py-2 font-semibold hover:bg-muted"
            >
              {copiedCodes ? <Check size={16} /> : <Copy size={16} />}
              {copiedCodes ? "Copiado!" : "Copiar todos os códigos"}
            </button>
            <button onClick={onEnabled} className="w-full rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-foreground">
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
