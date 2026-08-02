import { createServerFn } from "@tanstack/react-start";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";

export type AIChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AIChatRequest = {
  messages: AIChatMessage[];
};

export type AIChatResponse = {
  reply: string;
  mock: boolean;
  provider: string;
};

function buildSystemPrompt(): string {
  const nowIso = new Date().toISOString();
  const todayBr = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return `Você é o **Assistente do BP Demo** — copiloto das lojas do BP Demo. Tom amigável, profissional e visual. Quem usa digita pouco: entregue a resposta pronta, bonita e escaneável.

Hoje é ${todayBr}. ISO: ${nowIso}. Fuso: America/Sao_Paulo.

## PRINCÍPIO
Você TEM ferramentas para consultar QUALQUER informação do sistema. NUNCA diga "não tenho essa informação" antes de tentar. NUNCA peça datas — ASSUMA "hoje" se ambíguo. Combine várias ferramentas quando fizer sentido.

## Ferramentas (encadeie livremente)
list_stores · list_sales_reps · attendance_summary · rep_detail · top_no_sale_reasons · breaks_report · rep_status_now · promo_history · commission_overview · commission_rep_detail

## Interpretação
- Pergunta curta → assuma "hoje" e chame a ferramenta certa.
- Nome de vendedora ("Aline?", "como tá a Aline?") → rep_detail.
- "almoço", "pausa", "fora", "banheiro" → breaks_report ou rep_status_now.
- "promoção", "promo gerada" → promo_history.
- "comissão da Aline em outubro" → commission_rep_detail.

## Estilo de escrita (MUITO IMPORTANTE — sempre Markdown)
A resposta deve parecer um mini-relatório executivo:

1. **Cabeçalho curto** com emoji temático em uma linha (ex.: \`### 🥇 Ranking de hoje\`).
2. **Resumo em 1 linha** com o dado principal em **negrito**.
3. **Lista** (\`- \` ou \`1.\`) para rankings. Use 🥇🥈🥉 nos 3 primeiros.
4. Para comparações densas, use **tabela Markdown** (máx 5 linhas, 3-4 colunas).
5. Destaque números em **negrito**. Loja entre parênteses discretos.
6. Termine com **linha de sugestão** iniciada por \`💡\`.
7. Separe blocos com linha em branco. Evite parágrafos longos.

## Emojis de referência
🥇🥈🥉 pódio · 📊 conversão · 🎯 meta · 💰 comissão · 🍽️ almoço · ☕ café · 🚻 banheiro · 🚶 externa · ⏱️ tempo · ⚠️ zerada · 🏬 loja · 👤 vendedora · 🔥 destaque · 📅 período

## Regras de dados
- Datas em pt-BR, BRL (R$ 1.234,56), % com 1 casa (63,4%).
- Total = 0 → 1 linha honesta + sugestão com 💡.
- NUNCA invente números.
- NUNCA repita a pergunta.
- Máx. ~10 linhas visíveis. Denso, não prolixo.`;
}

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? now.getUTCFullYear());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? now.getUTCMonth() + 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? now.getUTCDate());
  const fromDate = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00-03:00`);
  const toDate = new Date(fromDate);
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  const from = fromDate.toISOString();
  const to = toDate.toISOString();
  return { from, to };
}

function yesterdayRange(): { from: string; to: string } {
  const today = todayRange();
  const to = new Date(today.from);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function monthRange(year?: number, month?: number): { from: string; to: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = year ?? Number(parts.find((p) => p.type === "year")?.value ?? now.getUTCFullYear());
  const m = month ?? Number(parts.find((p) => p.type === "month")?.value ?? now.getUTCMonth() + 1);
  const fromDate = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`);
  const toDate = new Date(fromDate);
  toDate.setUTCMonth(toDate.getUTCMonth() + 1);
  const from = fromDate.toISOString();
  const to = toDate.toISOString();
  return { from, to };
}

function resolveRange(input: {
  period?: "today" | "yesterday" | "month" | "custom";
  year?: number;
  month?: number;
  from?: string;
  to?: string;
}): { from: string; to: string } {
  if (input.period === "custom" && input.from && input.to) {
    return { from: input.from, to: input.to };
  }
  if (input.period === "yesterday") return yesterdayRange();
  if (input.period === "month" || input.year || input.month) {
    return monthRange(input.year, input.month);
  }
  return todayRange();
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function brNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

function detectPeriod(text: string): { period: "today" | "yesterday" | "month"; label: string; from: string; to: string } {
  const n = normalizeText(text);
  if (n.includes("ontem")) {
    return { period: "yesterday", label: "ontem", ...yesterdayRange() };
  }
  if (n.includes("mes") || n.includes("mensal")) {
    return { period: "month", label: "no mês", ...monthRange() };
  }
  return { period: "today", label: "hoje", ...todayRange() };
}

type AttendanceSummary = {
  atendimentos: number;
  vendas: number;
  naoVendas: number;
  conversao: number;
  rankingReps: Array<{ name: string; store: string; vendas: number; atendimentos: number; conversao: number }>;
  rankingStores: Array<{ name: string; vendas: number; atendimentos: number; conversao: number }>;
  semVendas: Array<{ name: string; store: string; atendimentos: number }>;
};

async function loadAttendanceSummary(
  supabaseAdmin: any,
  range: { from: string; to: string },
): Promise<AttendanceSummary | null> {
  const { data: rows, error } = await supabaseAdmin
    .from("attendances")
    .select("id,type,store_id,sales_rep_id,created_at")
    .eq("status", "closed")
    .gte("created_at", range.from)
    .lt("created_at", range.to);
  if (error) return null;

  const [{ data: reps }, { data: stores }] = await Promise.all([
    supabaseAdmin.from("sales_reps").select("id,name,store_id,active"),
    supabaseAdmin.from("stores").select("id,name"),
  ]);
  const repMap = new Map((reps ?? []).map((r: any) => [r.id, r]));
  const storeMap = new Map((stores ?? []).map((s: any) => [s.id, s.name]));
  const byRep = new Map<string, { name: string; store: string; vendas: number; atendimentos: number }>();
  const byStore = new Map<string, { name: string; vendas: number; atendimentos: number }>();

  for (const r of rows ?? []) {
    const rep = repMap.get(r.sales_rep_id) as any;
    const storeName = String(storeMap.get(r.store_id) ?? "—");
    const repKey = r.sales_rep_id ?? "sem_rep";
    const repBucket = byRep.get(repKey) ?? {
      name: String(rep?.name ?? "Sem vendedora"),
      store: storeName,
      vendas: 0,
      atendimentos: 0,
    };
    repBucket.atendimentos += 1;
    if (r.type === "sale") repBucket.vendas += 1;
    byRep.set(repKey, repBucket);

    const storeKey = r.store_id ?? "sem_loja";
    const storeBucket = byStore.get(storeKey) ?? { name: storeName, vendas: 0, atendimentos: 0 };
    storeBucket.atendimentos += 1;
    if (r.type === "sale") storeBucket.vendas += 1;
    byStore.set(storeKey, storeBucket);
  }

  const rankingReps = [...byRep.values()]
    .map((r) => ({ ...r, conversao: r.atendimentos ? (r.vendas / r.atendimentos) * 100 : 0 }))
    .sort((a, b) => b.vendas - a.vendas || b.conversao - a.conversao || b.atendimentos - a.atendimentos || a.name.localeCompare(b.name));
  const rankingStores = [...byStore.values()]
    .map((s) => ({ ...s, conversao: s.atendimentos ? (s.vendas / s.atendimentos) * 100 : 0 }))
    .sort((a, b) => b.vendas - a.vendas || b.conversao - a.conversao || b.atendimentos - a.atendimentos || a.name.localeCompare(b.name));
  const repIdsWithSales = new Set((rows ?? []).filter((r: any) => r.type === "sale").map((r: any) => r.sales_rep_id));
  const repAttendanceCount = new Map<string, number>();
  for (const r of rows ?? []) repAttendanceCount.set(r.sales_rep_id, (repAttendanceCount.get(r.sales_rep_id) ?? 0) + 1);

  return {
    atendimentos: rows?.length ?? 0,
    vendas: (rows ?? []).filter((r: any) => r.type === "sale").length,
    naoVendas: (rows ?? []).filter((r: any) => r.type === "no_sale").length,
    conversao: rows?.length ? (((rows ?? []).filter((r: any) => r.type === "sale").length / rows.length) * 100) : 0,
    rankingReps: rankingReps.slice(0, 20),
    rankingStores,
    semVendas: (reps ?? [])
      .filter((r: any) => r.active !== false && !repIdsWithSales.has(r.id))
      .map((r: any) => ({ name: r.name, store: storeMap.get(r.store_id) ?? "—", atendimentos: repAttendanceCount.get(r.id) ?? 0 }))
      .sort((a: any, b: any) => b.atendimentos - a.atendimentos || a.name.localeCompare(b.name))
      .slice(0, 20),
  };
}

async function directAnswerForQuestion(supabaseAdmin: any, messages: AIChatMessage[]): Promise<string | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const q = normalizeText(lastUser);
  if (!q) return null;

  const wantsAttendance = ["hoje", "ontem", "vendeu", "vendas", "vendedora", "venderora", "loja", "ranking", "top", "melhor", "conversao", "zeradas", "como ta", "atendimento", "recusa", "motivo", "nao vendeu"].some((term) => q.includes(term));
  if (!wantsAttendance) return null;

  const period = detectPeriod(lastUser);

  if (q.includes("motivo") || q.includes("recusa") || q.includes("nao vendeu")) {
    const { data, error } = await supabaseAdmin
      .from("attendances")
      .select("reason_id,reason_other_text,type,created_at")
      .eq("type", "no_sale")
      .gte("created_at", period.from)
      .lt("created_at", period.to);
    if (error) return "Não consegui buscar os motivos agora.";
    const { data: reasons } = await supabaseAdmin.from("no_sale_reasons").select("id,label,is_other");
    const map = new Map((reasons ?? []).map((r: any) => [r.id, r]));
    const counts = new Map<string, number>();
    const outros: string[] = [];
    for (const row of data ?? []) {
      const reason = map.get(row.reason_id) as any;
      const label = reason?.label ?? "Não informado";
      counts.set(label, (counts.get(label) ?? 0) + 1);
      if ((reason?.is_other || normalizeText(label).includes("outro")) && row.reason_other_text) outros.push(row.reason_other_text);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!top.length) return `Ainda sem não vendas ${period.label}.`;
    return [`**Motivos ${period.label}:**`, ...top.map(([label, count], i) => `${i + 1}. ${label} — ${count}`), outros.length ? `**Outro:** ${outros.slice(0, 3).join("; ")}` : ""].filter(Boolean).join("\n");
  }

  const summary = await loadAttendanceSummary(supabaseAdmin, period);
  if (!summary) return "Não consegui buscar os dados agora.";
  if (summary.atendimentos === 0) return `Ainda sem atendimentos ${period.label}.`;

  if (q.includes("zerada") || q.includes("sem vender")) {
    if (!summary.semVendas.length) return `Ninguém está zerada ${period.label}.`;
    return [`**Sem vendas ${period.label}:**`, ...summary.semVendas.slice(0, 8).map((r) => `⚠️ ${r.name} (${r.store}) — ${r.atendimentos} atend.`)].join("\n");
  }

  const asksStoreAndRep = q.includes("loja") && (q.includes("vendedora") || q.includes("venderora") || q.includes("funcionaria"));
  if (asksStoreAndRep) {
    const store = summary.rankingStores[0];
    const rep = summary.rankingReps[0];
    return [`**${period.label}: ${store?.name ?? "—"}** foi a loja com mais vendas — ${store?.vendas ?? 0} vendas.`, `🥇 Vendedora: **${rep?.name ?? "—"}** (${rep?.store ?? "—"}) — ${rep?.vendas ?? 0} vendas.`, `📊 Conversão geral: **${brNumber(summary.conversao)}%** (${summary.vendas}/${summary.atendimentos}).`].join("\n");
  }

  if (q.includes("loja")) {
    const top = summary.rankingStores.slice(0, 5);
    return [`**Melhor loja ${period.label}: ${top[0]?.name ?? "—"}** — ${top[0]?.vendas ?? 0} vendas.`, ...top.slice(1).map((s, i) => `${i + 2}. ${s.name} — ${s.vendas} vendas · ${brNumber(s.conversao)}% conv.`)].join("\n");
  }

  if (q.includes("quem") || q.includes("top") || q.includes("ranking") || q.includes("melhor") || q.includes("vendedora") || q.includes("venderora")) {
    const top = summary.rankingReps.slice(0, 5);
    return [`**${top[0]?.name ?? "—"}** lidera ${period.label}: ${top[0]?.vendas ?? 0} vendas (${top[0]?.store ?? "—"}).`, ...top.slice(1).map((r, i) => `${i === 0 ? "🥈" : i === 1 ? "🥉" : `${i + 2}.`} ${r.name} — ${r.vendas} vendas · ${brNumber(r.conversao)}% conv.`)].join("\n");
  }

  return [`**${summary.vendas} vendas ${period.label}** em ${summary.atendimentos} atendimentos.`, `📊 Conversão: **${brNumber(summary.conversao)}%**`, `🥇 Top vendedora: **${summary.rankingReps[0]?.name ?? "—"}** — ${summary.rankingReps[0]?.vendas ?? 0} vendas`, `🏬 Top loja: **${summary.rankingStores[0]?.name ?? "—"}** — ${summary.rankingStores[0]?.vendas ?? 0} vendas`].join("\n");
}

export const aiChat = createServerFn({ method: "POST" })
  .inputValidator((input: AIChatRequest) => {
    if (!input || !Array.isArray(input.messages)) throw new Error("messages required");
    return input;
  })
  .handler(async ({ data }): Promise<AIChatResponse> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        reply:
          "IA não configurada (LOVABLE_API_KEY ausente). Peça ao administrador para ativar o gateway de IA.",
        mock: true,
        provider: "none",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createLovableAiGateway } = await import("./gateway.server");


    const tools = {
      list_stores: tool({
        description: "Lista todas as lojas cadastradas.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data, error } = await supabaseAdmin
            .from("stores")
            .select("id,name,active")
            .order("name");
          if (error) return { error: error.message };
          return { stores: data ?? [] };
        },
      }),

      list_sales_reps: tool({
        description: "Lista vendedoras com status atual (available/lunch/off/busy), posição na fila e loja. Filtra por loja opcionalmente.",
        inputSchema: z.object({
          store_name: z.string().nullable().describe("Nome da loja para filtrar, ou null"),
        }),
        execute: async ({ store_name }) => {
          let storeId: string | null = null;
          if (store_name) {
            const { data: s } = await supabaseAdmin
              .from("stores").select("id").ilike("name", `%${store_name}%`).maybeSingle();
            storeId = s?.id ?? null;
          }
          let q = supabaseAdmin
            .from("sales_reps")
            .select("id,name,active,queue_position,store_id,status")
            .order("queue_position");
          if (storeId) q = q.eq("store_id", storeId);
          const { data, error } = await q;
          if (error) return { error: error.message };
          const { data: stores } = await supabaseAdmin.from("stores").select("id,name");
          const storeMap = new Map((stores ?? []).map((s: any) => [s.id, s.name]));
          return { reps: (data ?? []).map((r: any) => ({ ...r, loja: storeMap.get(r.store_id) ?? "—" })) };
        },
      }),

      attendance_summary: tool({
        description:
          "Resumo de atendimentos e vendas em um período. Retorna totais, conversão, ranking de vendedoras e ranking de lojas. Use para perguntas de 'quem vendeu mais', 'ranking', 'conversão', 'faturamento', 'atendimentos'.",
        inputSchema: z.object({
          period: z.enum(["today", "yesterday", "month", "custom"]).describe("today, yesterday, month ou custom"),
          year: z.number().int().nullable(),
          month: z.number().int().nullable(),
          from: z.string().nullable().describe("ISO datetime (custom)"),
          to: z.string().nullable().describe("ISO datetime (custom)"),
        }),
        execute: async (args) => {
          const { from, to } = resolveRange({
            period: args.period,
            year: args.year ?? undefined,
            month: args.month ?? undefined,
            from: args.from ?? undefined,
            to: args.to ?? undefined,
          });
          const { data: rows, error } = await supabaseAdmin
            .from("attendances")
            .select("id,type,amount,store_id,sales_rep_id,created_at")
            .eq("status", "closed")
            .gte("created_at", from)
            .lt("created_at", to);
          if (error) return { error: error.message };
          const all = rows ?? [];
          const vendas = all.filter((r: any) => r.type === "sale");
          const total = all.length;
          const totalVendas = vendas.length;
          const faturamento = vendas.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
          const conversao = total ? totalVendas / total : 0;

          const [{ data: reps }, { data: stores }] = await Promise.all([
            supabaseAdmin.from("sales_reps").select("id,name,store_id"),
            supabaseAdmin.from("stores").select("id,name"),
          ]);
          const repMap = new Map((reps ?? []).map((r: any) => [r.id, r]));
          const storeMap = new Map((stores ?? []).map((s: any) => [s.id, s.name]));

          const byRep = new Map<string, { name: string; store: string; vendas: number; faturamento: number; atendimentos: number }>();
          const byStore = new Map<string, { name: string; vendas: number; faturamento: number; atendimentos: number }>();
          for (const r of all) {
            const rep = repMap.get(r.sales_rep_id) as any;
            const repKey = r.sales_rep_id ?? "sem_rep";
            const repName = rep?.name ?? "—";
            const storeName = storeMap.get(r.store_id) ?? "—";
            const rb = byRep.get(repKey) ?? { name: repName, store: storeName, vendas: 0, faturamento: 0, atendimentos: 0 };
            rb.atendimentos += 1;
            if (r.type === "sale") {
              rb.vendas += 1;
              rb.faturamento += Number(r.amount ?? 0);
            }
            byRep.set(repKey, rb);

            const storeKey = r.store_id ?? "sem_loja";
            const sb = byStore.get(storeKey) ?? { name: storeName, vendas: 0, faturamento: 0, atendimentos: 0 };
            sb.atendimentos += 1;
            if (r.type === "sale") {
              sb.vendas += 1;
              sb.faturamento += Number(r.amount ?? 0);
            }
            byStore.set(storeKey, sb);
          }
          const rankingReps = [...byRep.values()].sort((a, b) => b.vendas - a.vendas || b.atendimentos - a.atendimentos || b.faturamento - a.faturamento).slice(0, 20);
          const rankingLojas = [...byStore.values()].sort((a, b) => b.vendas - a.vendas || b.atendimentos - a.atendimentos || b.faturamento - a.faturamento);
          const semVendas = [...byRep.values()].filter((r) => r.vendas === 0).map((r) => ({ name: r.name, store: r.store }));

          return {
            periodo: { from, to },
            totais: {
              atendimentos: total,
              vendas: totalVendas,
              faturamento,
              conversao_pct: Math.round(conversao * 1000) / 10,
            },
            ranking_vendedoras: rankingReps,
            ranking_lojas: rankingLojas,
            vendedoras_sem_vendas: semVendas,
          };
        },
      }),

      top_no_sale_reasons: tool({
        description: "Top motivos de não venda (attendances com type != 'venda') em um período.",
        inputSchema: z.object({
          period: z.enum(["today", "yesterday", "month", "custom"]),
          year: z.number().int().nullable(),
          month: z.number().int().nullable(),
          from: z.string().nullable(),
          to: z.string().nullable(),
        }),
        execute: async (args) => {
          const { from, to } = resolveRange({
            period: args.period,
            year: args.year ?? undefined,
            month: args.month ?? undefined,
            from: args.from ?? undefined,
            to: args.to ?? undefined,
          });
          const { data, error } = await supabaseAdmin
            .from("attendances")
            .select("reason_id,type,created_at")
            .eq("type", "no_sale")
            .gte("created_at", from)
            .lt("created_at", to);
          if (error) return { error: error.message };
          const { data: reasons } = await supabaseAdmin
            .from("no_sale_reasons")
            .select("id,label");
          const map = new Map((reasons ?? []).map((r: any) => [r.id, r.label]));
          const counts = new Map<string, number>();
          for (const r of data ?? []) {
            const label = map.get(r.reason_id) ?? "Não informado";
            counts.set(label, (counts.get(label) ?? 0) + 1);
          }
          return {
            periodo: { from, to },
            motivos: [...counts.entries()]
              .map(([label, count]) => ({ label, count }))
              .sort((a, b) => b.count - a.count),
          };
        },
      }),

      commission_overview: tool({
        description: "Visão geral de importações de comissão (meta, faturamento, vendedoras) por mês/ano/loja.",
        inputSchema: z.object({
          year: z.number().int().nullable(),
          month: z.number().int().nullable(),
          store_name: z.string().nullable(),
        }),
        execute: async ({ year, month, store_name }) => {
          let q = supabaseAdmin
            .from("commission_imports")
            .select("id,store_id,month,year,meta_amount,updated_at,closed_at");
          if (year) q = q.eq("year", year);
          if (month) q = q.eq("month", month);
          const { data: imports, error } = await q;
          if (error) return { error: error.message };
          const { data: stores } = await supabaseAdmin.from("stores").select("id,name");
          const storeMap = new Map((stores ?? []).map((s: any) => [s.id, s.name]));
          let filtered = imports ?? [];
          if (store_name) {
            const nameLc = store_name.toLowerCase();
            filtered = filtered.filter((i: any) =>
              (storeMap.get(i.store_id) ?? "").toLowerCase().includes(nameLc),
            );
          }
          const enriched = await Promise.all(
            filtered.map(async (i: any) => {
              const { data: rows } = await supabaseAdmin
                .from("commission_rows")
                .select("nome,liquido,vendas,uni,consentimentos")
                .eq("import_id", i.id);
              const totalLiquido = (rows ?? []).reduce((s, r: any) => s + Number(r.liquido ?? 0), 0);
              return {
                loja: storeMap.get(i.store_id) ?? "—",
                mes: i.month,
                ano: i.year,
                meta: Number(i.meta_amount ?? 0),
                faturamento_liquido: totalLiquido,
                atingimento_pct: i.meta_amount
                  ? Math.round((totalLiquido / Number(i.meta_amount)) * 1000) / 10
                  : null,
                funcionarias: (rows ?? []).length,
                fechado: !!i.closed_at,
                top: [...(rows ?? [])]
                  .sort((a: any, b: any) => Number(b.liquido) - Number(a.liquido))
                  .slice(0, 5)
                  .map((r: any) => ({ nome: r.nome, liquido: Number(r.liquido) })),
              };
            }),
          );
          return { importacoes: enriched };
        },
      }),

      rep_detail: tool({
        description: "Detalhe de UMA vendedora em um período: atendimentos, vendas, conversão, motivos de não venda (com texto do 'Outro'), pausas. Use quando o usuário mencionar o nome de uma vendedora.",
        inputSchema: z.object({
          rep_name: z.string().describe("Nome (ou parte) da vendedora"),
          period: z.enum(["today", "yesterday", "month", "custom"]).describe("today/yesterday/month/custom"),
          year: z.number().int().nullable(),
          month: z.number().int().nullable(),
          from: z.string().nullable(),
          to: z.string().nullable(),
        }),
        execute: async (args) => {
          const { from, to } = resolveRange({ period: args.period, year: args.year ?? undefined, month: args.month ?? undefined, from: args.from ?? undefined, to: args.to ?? undefined });
          const { data: reps } = await supabaseAdmin.from("sales_reps").select("id,name,store_id,status,active").ilike("name", `%${args.rep_name}%`);
          const rep = (reps ?? [])[0];
          if (!rep) return { error: `Vendedora não encontrada: ${args.rep_name}` };
          const { data: storeRow } = rep.store_id ? await supabaseAdmin.from("stores").select("name").eq("id", rep.store_id).maybeSingle() : { data: null as any };
          const { data: atts } = await supabaseAdmin.from("attendances").select("id,type,reason_id,reason_other_text,created_at").eq("sales_rep_id", rep.id).eq("status", "closed").gte("created_at", from).lt("created_at", to);
          const { data: reasons } = await supabaseAdmin.from("no_sale_reasons").select("id,label,is_other");
          const rmap = new Map((reasons ?? []).map((r: any) => [r.id, r]));
          const total = atts?.length ?? 0;
          const vendas = (atts ?? []).filter((a: any) => a.type === "sale").length;
          const motivos = new Map<string, number>();
          const outros: string[] = [];
          for (const a of atts ?? []) {
            if (a.type !== "no_sale") continue;
            const r = rmap.get(a.reason_id) as any;
            const lbl = r?.label ?? "Não informado";
            motivos.set(lbl, (motivos.get(lbl) ?? 0) + 1);
            if ((r?.is_other || normalizeText(lbl).includes("outro")) && a.reason_other_text) outros.push(a.reason_other_text);
          }
          const { data: breaks } = await supabaseAdmin.from("rep_breaks").select("reason,started_at,ended_at").eq("sales_rep_id", rep.id).gte("started_at", from).lt("started_at", to);
          const pausas = new Map<string, { count: number; minutos: number }>();
          for (const b of breaks ?? []) {
            const rk = String(b.reason ?? "sem motivo");
            if (normalizeText(rk).includes("fora horario")) continue;
            const end = b.ended_at ? new Date(b.ended_at) : new Date();
            const mins = Math.max(0, Math.round((end.getTime() - new Date(b.started_at).getTime()) / 60000));
            const cur = pausas.get(rk) ?? { count: 0, minutos: 0 };
            cur.count += 1; cur.minutos += mins;
            pausas.set(rk, cur);
          }
          return {
            vendedora: { nome: rep.name, loja: storeRow?.name ?? "—", status: rep.status, ativa: rep.active },
            periodo: { from, to },
            totais: { atendimentos: total, vendas, nao_vendas: total - vendas, conversao_pct: total ? Math.round((vendas / total) * 1000) / 10 : 0 },
            motivos_nao_venda: [...motivos.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
            outros_descricao: outros,
            pausas: [...pausas.entries()].map(([reason, v]) => ({ motivo: reason, ocorrencias: v.count, minutos_total: v.minutos })),
          };
        },
      }),

      rep_status_now: tool({
        description: "Status ao vivo das vendedoras: quem está disponível, em atendimento, no almoço, café, banheiro, tarefa externa ou fora do horário. Inclui minutos de pausa em curso.",
        inputSchema: z.object({ store_name: z.string().nullable() }),
        execute: async ({ store_name }) => {
          let storeId: string | null = null;
          if (store_name) {
            const { data: s } = await supabaseAdmin.from("stores").select("id").ilike("name", `%${store_name}%`).maybeSingle();
            storeId = s?.id ?? null;
          }
          let q = supabaseAdmin.from("sales_reps").select("id,name,status,store_id,active").eq("active", true);
          if (storeId) q = q.eq("store_id", storeId);
          const { data: reps } = await q;
          const { data: stores } = await supabaseAdmin.from("stores").select("id,name");
          const smap = new Map((stores ?? []).map((s: any) => [s.id, s.name]));
          const { data: openBreaks } = await supabaseAdmin.from("rep_breaks").select("sales_rep_id,reason,started_at").is("ended_at", null);
          const openMap = new Map((openBreaks ?? []).map((b: any) => [b.sales_rep_id, b]));
          const now = Date.now();
          return {
            vendedoras: (reps ?? []).map((r: any) => {
              const b = openMap.get(r.id) as any;
              return {
                nome: r.name, loja: smap.get(r.store_id) ?? "—", status: r.status,
                pausa_atual: b ? { motivo: b.reason, minutos_em_curso: Math.max(0, Math.round((now - new Date(b.started_at).getTime()) / 60000)) } : null,
              };
            }),
          };
        },
      }),

      breaks_report: tool({
        description: "Relatório de pausas (almoço, café, banheiro, tarefa externa) por vendedora e motivo em um período. Ignora 'Fora horário de trabalho'.",
        inputSchema: z.object({
          period: z.enum(["today", "yesterday", "month", "custom"]),
          year: z.number().int().nullable(),
          month: z.number().int().nullable(),
          from: z.string().nullable(),
          to: z.string().nullable(),
          rep_name: z.string().nullable(),
        }),
        execute: async (args) => {
          const { from, to } = resolveRange({ period: args.period, year: args.year ?? undefined, month: args.month ?? undefined, from: args.from ?? undefined, to: args.to ?? undefined });
          let q = supabaseAdmin.from("rep_breaks").select("sales_rep_id,reason,started_at,ended_at").gte("started_at", from).lt("started_at", to);
          const { data: breaks } = await q;
          const { data: reps } = await supabaseAdmin.from("sales_reps").select("id,name");
          const rmap = new Map((reps ?? []).map((r: any) => [r.id, r.name]));
          const filterName = args.rep_name ? normalizeText(args.rep_name) : null;
          const porRep = new Map<string, Map<string, { count: number; minutos: number }>>();
          const porMotivo = new Map<string, { count: number; minutos: number }>();
          for (const b of breaks ?? []) {
            const rk = String(b.reason ?? "sem motivo");
            if (normalizeText(rk).includes("fora horario")) continue;
            const name = String(rmap.get(b.sales_rep_id) ?? "—");
            if (filterName && !normalizeText(name).includes(filterName)) continue;
            const end = b.ended_at ? new Date(b.ended_at) : new Date();
            const mins = Math.max(0, Math.round((end.getTime() - new Date(b.started_at).getTime()) / 60000));
            const rmapBreak = porRep.get(name) ?? new Map();
            const cur = rmapBreak.get(rk) ?? { count: 0, minutos: 0 };
            cur.count += 1; cur.minutos += mins;
            rmapBreak.set(rk, cur);
            porRep.set(name, rmapBreak);
            const gm = porMotivo.get(rk) ?? { count: 0, minutos: 0 };
            gm.count += 1; gm.minutos += mins;
            porMotivo.set(rk, gm);
          }
          return {
            periodo: { from, to },
            por_motivo: [...porMotivo.entries()].map(([m, v]) => ({ motivo: m, ocorrencias: v.count, minutos_total: v.minutos })).sort((a, b) => b.minutos_total - a.minutos_total),
            por_vendedora: [...porRep.entries()].map(([nome, m]) => ({ nome, pausas: [...m.entries()].map(([motivo, v]) => ({ motivo, ocorrencias: v.count, minutos: v.minutos })), minutos_total: [...m.values()].reduce((s, v) => s + v.minutos, 0) })).sort((a, b) => b.minutos_total - a.minutos_total),
          };
        },
      }),

      promo_history: tool({
        description: "Histórico de promoções geradas (data, nome, quantidade de produtos, percentual, filtros aplicados).",
        inputSchema: z.object({ limit: z.number().int().nullable() }),
        execute: async ({ limit }) => {
          const { data, error } = await supabaseAdmin
            .from("promo_exports")
            .select("id,name,created_at,product_count,discount_pct,filters")
            .order("created_at", { ascending: false })
            .limit(limit ?? 20);
          if (error) return { error: error.message };
          return { promocoes: data ?? [] };
        },
      }),

      commission_rep_detail: tool({
        description: "Comissão detalhada de uma vendedora em uma competência (mês/ano/loja). Retorna bruto, líquido, unidades, TM, PA, PM, consentimentos.",
        inputSchema: z.object({
          rep_name: z.string(),
          year: z.number().int().nullable(),
          month: z.number().int().nullable(),
          store_name: z.string().nullable(),
        }),
        execute: async ({ rep_name, year, month, store_name }) => {
          let q = supabaseAdmin.from("commission_imports").select("id,store_id,month,year,meta_amount,closed_at");
          if (year) q = q.eq("year", year);
          if (month) q = q.eq("month", month);
          const { data: imports } = await q;
          const { data: stores } = await supabaseAdmin.from("stores").select("id,name");
          const smap = new Map((stores ?? []).map((s: any) => [s.id, s.name]));
          let filtered = imports ?? [];
          if (store_name) filtered = filtered.filter((i: any) => String(smap.get(i.store_id) ?? "").toLowerCase().includes(store_name.toLowerCase()));
          const results: any[] = [];
          for (const imp of filtered) {
            const { data: rows } = await supabaseAdmin
              .from("commission_rows")
              .select("nome,bruto,liquido,desc_pct,desconto,vendas,vendas_com,vendas_sem,consentimentos,uni,tm,pa,pm")
              .eq("import_id", imp.id)
              .ilike("nome", `%${rep_name}%`);
            for (const r of rows ?? []) {
              results.push({ loja: smap.get(imp.store_id) ?? "—", mes: imp.month, ano: imp.year, meta: imp.meta_amount, fechado: !!imp.closed_at, ...r });
            }
          }
          return { encontrados: results };
        },
      }),
    };

    const gateway = createLovableAiGateway(key);
    const model = gateway("google/gemini-3.5-flash");

    try {
      const result = await generateText({
        model,
        system: buildSystemPrompt(),
        messages: data.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })) as any,
        tools,
        stopWhen: stepCountIs(50),
      });
      return {
        reply: result.text || "Não consegui gerar uma resposta.",
        mock: false,
        provider: "lovable/gemini-3.5-flash",
      };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      return {
        reply: `Erro ao consultar a IA: ${msg}`,
        mock: true,
        provider: "error",
      };
    }
  });
