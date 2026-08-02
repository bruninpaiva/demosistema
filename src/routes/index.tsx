import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Store as StoreIcon, Search, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BP Demo" },
      { name: "description", content: "Selecione a loja para começar" },
    ],
  }),
  component: StorePicker,
});

type Store = { id: string; name: string };
type Status = "loading" | "error" | "empty" | "ready" | "redirecting";

const DEVICE_STORE_KEY = "bpinfo_device_store_id";
const SEARCH_THRESHOLD = 8;

function StorePicker() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [stores, setStores] = useState<Store[]>([]);
  const [query, setQuery] = useState("");
  const [pendingStore, setPendingStore] = useState<Store | null>(null);
  const [redirectName, setRedirectName] = useState("");
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const goToStore = (store: Store) => {
    setRedirectName(store.name);
    setStatus("redirecting");
    setTimeout(() => {
      navigate({ to: "/loja/$storeId", params: { storeId: store.id } });
    }, 350);
  };

  const load = async () => {
    setStatus("loading");
    setPendingStore(null);
    try {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name")
        .eq("active", true)
        .order("name");

      if (error) {
        setStatus("error");
        return;
      }
      const list = (data ?? []) as Store[];
      setStores(list);

      const pairedId =
        typeof window !== "undefined" ? localStorage.getItem(DEVICE_STORE_KEY) : null;
      const paired = pairedId ? list.find((s) => s.id === pairedId) : undefined;

      if (list.length === 0) {
        if (pairedId && typeof window !== "undefined") localStorage.removeItem(DEVICE_STORE_KEY);
        setStatus("empty");
      } else if (paired) {
        goToStore(paired);
      } else if (list.length === 1) {
        if (typeof window !== "undefined") localStorage.setItem(DEVICE_STORE_KEY, list[0].id);
        goToStore(list[0]);
      } else {
        if (pairedId && typeof window !== "undefined") localStorage.removeItem(DEVICE_STORE_KEY);
        setStatus("ready");
      }
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmPairing = (remember: boolean) => {
    if (!pendingStore) return;
    if (remember && typeof window !== "undefined") {
      localStorage.setItem(DEVICE_STORE_KEY, pendingStore.id);
    }
    goToStore(pendingStore);
  };

  const filteredStores = query.trim()
    ? stores.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    : stores;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {status !== "redirecting" && (
        <header className="flex items-center justify-between px-6 py-5 md:px-10">
          <div className="flex items-center gap-2.5">
            <img
              src="/bpinfo-logo.jpg"
              alt="BP Demo"
              className="h-8 w-8 rounded-lg object-cover"
            />
            <span className="text-sm font-semibold tracking-tight text-foreground">BP Demo</span>
            <span
              className={`ml-1 h-1.5 w-1.5 rounded-full ${isOnline ? "bg-success" : "bg-muted-foreground/40"}`}
              title={isOnline ? "Conectado" : "Sem conexão"}
            />
          </div>
          <Link
            to="/admin"
            className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Painel de gestão
          </Link>
        </header>
      )}

      <main className="flex flex-1 items-center justify-center p-6">
        {status === "loading" && (
          <div className="w-full max-w-3xl animate-in fade-in duration-200">
            <div className="mb-8 flex flex-col items-center gap-2">
              <div className="h-7 w-56 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          </div>
        )}

        {status === "redirecting" && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in duration-200">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Abrindo {redirectName}…</p>
          </div>
        )}

        {status === "error" && (
          <div className="mx-auto max-w-md text-center animate-in fade-in duration-300">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <WifiOff size={26} />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">
              {isOnline ? "Não conseguimos carregar as lojas" : "Sem conexão com a internet"}
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              {isOnline
                ? "Algo deu errado ao buscar suas lojas. Tente novamente."
                : "Verifique sua conexão e tente novamente."}
            </p>
            <button
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition hover:opacity-90 active:scale-[0.98]"
            >
              <RefreshCw size={16} /> Tentar novamente
            </button>
          </div>
        )}

        {status === "empty" && (
          <div className="mx-auto max-w-md text-center animate-in fade-in duration-300">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <StoreIcon size={28} />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">
              Vamos configurar sua primeira loja
            </h1>
            <p className="mb-6 text-sm text-muted-foreground">
              O BP Demo ainda não tem nenhuma loja cadastrada. Um administrador pode configurar
              isso em poucos minutos pelo painel de gestão.
            </p>
            <Link
              to="/admin"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition hover:opacity-90 active:scale-[0.98]"
            >
              Ir para o painel de gestão
            </Link>
            <p className="mt-4 text-xs text-muted-foreground">
              Não é administrador? Peça para quem configurou o sistema cadastrar a primeira loja.
            </p>
          </div>
        )}

        {status === "ready" && pendingStore && (
          <div className="mx-auto max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <StoreIcon size={24} />
            </div>
            <p className="mb-1 text-lg font-semibold text-foreground">{pendingStore.name}</p>
            <p className="mb-6 text-sm text-muted-foreground">
              Este tablet vai ficar fixo nesta loja? Você não vai precisar selecionar de novo.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmPairing(true)}
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground transition hover:opacity-90 active:scale-[0.98]"
              >
                Sim, sempre abrir aqui
              </button>
              <button
                onClick={() => confirmPairing(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted active:scale-[0.98]"
              >
                Só desta vez
              </button>
            </div>
          </div>
        )}

        {status === "ready" && !pendingStore && (
          <div className="w-full max-w-3xl animate-in fade-in duration-300">
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Selecione sua loja
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">Toque para começar o expediente</p>
            </div>

            {stores.length > SEARCH_THRESHOLD && (
              <div className="relative mx-auto mb-6 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar loja"
                  className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground outline-none ring-brand/30 focus:ring-2"
                />
              </div>
            )}

            {filteredStores.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Nenhuma loja encontrada para "{query}".
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {filteredStores.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setPendingStore(s)}
                    className="group flex items-center gap-4 rounded-2xl border border-transparent bg-card p-5 text-left shadow-sm transition hover:border-brand/30 hover:shadow-md active:scale-[0.98]"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-brand-foreground">
                      <StoreIcon size={22} />
                    </div>
                    <span className="text-lg font-semibold text-foreground">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
