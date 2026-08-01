import { defineMcp } from "@lovable.dev/mcp-js";
import listStores from "./tools/list-stores";
import listSalesReps from "./tools/list-sales-reps";
import attendanceSummary from "./tools/attendance-summary";
import listNoSaleReasons from "./tools/list-no-sale-reasons";

export default defineMcp({
  name: "lupo-vendas-mcp",
  title: "Lupo · Controle de Conversão",
  version: "0.1.0",
  instructions:
    "Ferramentas somente leitura sobre as lojas Lupo, vendedoras e atendimentos. Use list_stores/list_sales_reps para descoberta e attendance_summary para métricas de conversão em um período.",
  tools: [listStores, listSalesReps, attendanceSummary, listNoSaleReasons],
});
