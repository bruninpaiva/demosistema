import { defineTool } from "@lovable.dev/mcp-js";
import { getPublicSupabase } from "../supabase";

export default defineTool({
  name: "list_stores",
  title: "Listar lojas",
  description: "Retorna todas as lojas cadastradas (id, nome, cidade).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase.from("stores").select("*").order("name");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { stores: data ?? [] },
    };
  },
});
