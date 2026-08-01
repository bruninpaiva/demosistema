import { aiChat, type AIChatMessage } from "@/lib/ai/chat.functions";

/**
 * Camada única de acesso à IA no frontend.
 * Todo o restante do app (hooks, componentes) chama SOMENTE este módulo.
 */
export type { AIChatMessage };

export async function sendChat(messages: AIChatMessage[]): Promise<string> {
  const res = await aiChat({ data: { messages } });
  return res.reply;
}
