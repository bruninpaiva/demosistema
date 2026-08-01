import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getPublicSupabase } from "../supabase";

export default defineTool({
  name: "attendance_summary",
  title: "Resumo de atendimentos",
  description:
    "Retorna totais de atendimentos e conversão em um período (start_date/end_date, formato YYYY-MM-DD). Filtros opcionais por store_id e sales_rep_id.",
  inputSchema: {
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data inicial YYYY-MM-DD."),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data final YYYY-MM-DD."),
    store_id: z.string().uuid().optional(),
    sales_rep_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date, store_id, sales_rep_id }) => {
    const supabase = getPublicSupabase();
    let query = supabase
      .from("attendances")
      .select("id, store_id, sales_rep_id, type, amount, created_at")
      .eq("status", "closed")
      .gte("created_at", `${start_date}T00:00:00.000Z`)
      .lte("created_at", `${end_date}T23:59:59.999Z`);
    if (store_id) query = query.eq("store_id", store_id);
    if (sales_rep_id) query = query.eq("sales_rep_id", sales_rep_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const total = rows.length;
    const sold = rows.filter((r) => r.type === "sale").length;
    const totalAmount = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const conversion = total > 0 ? sold / total : 0;
    const summary = {
      start_date,
      end_date,
      total_attendances: total,
      sold,
      not_sold: total - sold,
      conversion_rate: Number(conversion.toFixed(4)),
      total_amount: Number(totalAmount.toFixed(2)),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
