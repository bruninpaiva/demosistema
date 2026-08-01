import { defineTool } from "@lovable.dev/mcp-js";
import { getPublicSupabase } from "../supabase";

export default defineTool({
  name: "list_no_sale_reasons",
  title: "Listar motivos de não venda",
  description: "Retorna os motivos de não venda cadastrados.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase.from("no_sale_reasons").select("*").order("label");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { reasons: data ?? [] },
    };
  },
});
