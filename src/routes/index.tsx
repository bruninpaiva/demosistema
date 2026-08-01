import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, Store as StoreIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BPInfo ERP · Selecione a loja" },
      { name: "description", content: "Selecione a loja para começar" },
    ],
  }),
  component: StorePicker,
});

type Store = { id: string; name: string };

function StorePicker() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("stores")
      .select("id,name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setStores((data ?? []) as Store[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between bg-brand px-6 py-4 text-brand-foreground shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg bg-white px-3 py-1.5">
            <img src="/bpinfo-logo.jpg" alt="BPInfo ERP" className="h-7 w-auto" />
          </div>
          <span className="text-sm opacity-80">Conversão</span>
        </div>
        <Link
          to="/admin"
          className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
        >
          <BarChart3 size={18} /> Admin
        </Link>
      </header>

      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-1 text-center text-3xl md:text-4xl font-extrabold text-brand">
            Selecione sua loja
          </h1>
          <p className="mb-8 text-center text-muted-foreground">
            Toque no nome da loja para começar
          </p>

          {loading ? (
            <p className="text-center text-muted-foreground">Carregando…</p>
          ) : stores.length === 0 ? (
            <p className="mx-auto max-w-md rounded-xl bg-muted p-6 text-center text-muted-foreground">
              Nenhuma loja cadastrada. Vá em <span className="font-semibold">Admin</span> para cadastrar.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {stores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate({ to: "/loja/$storeId", params: { storeId: s.id } })}
                  className="flex items-center gap-4 rounded-2xl bg-card p-6 text-left shadow-md transition active:scale-[0.98] hover:shadow-lg border-2 border-transparent hover:border-brand min-h-[110px]"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <StoreIcon size={30} />
                  </div>
                  <span className="text-xl md:text-2xl font-extrabold text-foreground leading-tight">
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
