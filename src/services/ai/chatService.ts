import type { AIChatMessage } from "./aiService";
import { buildSystemPrompt } from "./promptBuilder";
import { buildContext, contextToSystemMessage } from "./contextBuilder";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export const INITIAL_ASSISTANT_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Olá! Sou o Assistente IA da Lupo.\n\nPosso responder perguntas sobre vendas, lojas, metas, funcionários, atendimentos, motivos de não venda, comissões e indicadores do sistema.",
  createdAt: Date.now(),
};

export const QUICK_SUGGESTIONS = [
  "Como tá hoje?",
  "Quem vendeu mais?",
  "Melhor loja",
  "Conversão de hoje",
  "Zeradas",
  "Motivos de recusa",
  "E o mês?",
  "Ranking do mês",
] as const;

export function toWireMessages(history: ChatMessage[]): AIChatMessage[] {
  const system: AIChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "system", content: contextToSystemMessage(buildContext()) },
  ];
  const rest: AIChatMessage[] = history
    .filter((m) => m.id !== "welcome")
    .map((m) => ({ role: m.role, content: m.content }));
  return [...system, ...rest];
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
