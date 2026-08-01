/**
 * Registro de ferramentas (Tool Calling) que a IA poderá utilizar no futuro.
 * Cada ferramenta expõe uma função tipada; a IA NUNCA consulta tabelas
 * diretamente — apenas via este registro.
 *
 * As implementações reais serão adicionadas quando o provedor de IA for ativado.
 * Por enquanto retornam estruturas vazias/mock, mantendo assinaturas estáveis.
 */

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };

const notImplemented = <T>(): ToolResult<T> => ({
  ok: false,
  error: "tool_not_implemented_yet",
});

export const aiTools = {
  getStores: async (): Promise<ToolResult<unknown[]>> => notImplemented(),
  getEmployees: async (): Promise<ToolResult<unknown[]>> => notImplemented(),
  getEmployeeRanking: async (): Promise<ToolResult<unknown[]>> => notImplemented(),
  getStoreRanking: async (): Promise<ToolResult<unknown[]>> => notImplemented(),
  getSalesSummary: async (): Promise<ToolResult<unknown>> => notImplemented(),
  getDailySales: async (): Promise<ToolResult<unknown>> => notImplemented(),
  getMonthlySales: async (): Promise<ToolResult<unknown>> => notImplemented(),
  getAttendance: async (): Promise<ToolResult<unknown>> => notImplemented(),
  getConversionRate: async (): Promise<ToolResult<unknown>> => notImplemented(),
  getTargets: async (): Promise<ToolResult<unknown>> => notImplemented(),
  getCommissions: async (): Promise<ToolResult<unknown>> => notImplemented(),
  getNonSaleReasons: async (): Promise<ToolResult<unknown[]>> => notImplemented(),
  getTopProducts: async (): Promise<ToolResult<unknown[]>> => notImplemented(),
  getStorePerformance: async (): Promise<ToolResult<unknown>> => notImplemented(),
} as const;

export type AIToolName = keyof typeof aiTools;
