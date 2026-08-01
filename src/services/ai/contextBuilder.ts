/**
 * Monta contexto adicional (data atual, escopo de loja, etc.) a ser injetado
 * como mensagem de sistema junto ao prompt principal.
 */
export type AIContext = {
  now: string;
  scope?: {
    storeId?: string;
    storeName?: string;
  };
};

export function buildContext(scope?: AIContext["scope"]): AIContext {
  return {
    now: new Date().toISOString(),
    scope,
  };
}

export function contextToSystemMessage(ctx: AIContext): string {
  const parts = [`Data/hora atual: ${ctx.now}.`];
  if (ctx.scope?.storeName) parts.push(`Loja em foco: ${ctx.scope.storeName}.`);
  return parts.join(" ");
}
