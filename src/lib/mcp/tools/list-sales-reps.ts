import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { getPublicSupabase } from "../supabase";

export default defineTool({
  name: "list_sales_reps",
  title: "Listar vendedoras",
  description: "Retorna as vendedoras cadastradas. Opcionalmente filtra por store_id.",
  inputSchema: {
    store_id: z.string().uuid().optional().describe("Filtrar por loja (UUID)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ store_id }) => {
    const supabase = getPublicSupabase();
    let query = supabase.from("sales_reps").select("*").order("name");
    if (store_id) query = query.eq("store_id", store_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { sales_reps: data ?? [] },
    };
  },
});
