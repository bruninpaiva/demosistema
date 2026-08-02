# PROJECT_MAP — Mapa Técnico do Projeto

> Documento gerado por análise estática do código-fonte em 2026-08-01. Não substitui a leitura do código, mas serve como ponto de partida para qualquer desenvolvedor entender o projeto rapidamente.

## 0. Contexto importante antes de tudo

O código atual **não é o BPInfo ERP multiempresa/multiloja** descrito em [`docs/ERP_VISION.md`](ERP_VISION.md). É o sistema real e já em produção de um único cliente — uma rede de lojas chamada **"Lupo"** (ver `public/manifest.webmanifest`, título em `src/routes/__root.tsx`) — um app de **controle de conversão de vendas em loja física**: fila de vendedoras, atendimento, motivo de não-venda, comissionamento e ferramentas administrativas.

Ou seja: este repositório é o **ponto de partida real** para o BPInfo ERP, não uma base zerada. A "loja" aqui já é multiloja (tabela `stores`), mas **não é multiempresa** (não existe conceito de "empresa"/tenant acima de `stores`) nem multiusuário no sentido de contas de usuário reais (ver seção 3 — não há Supabase Auth de fato, apenas PIN/senha customizados).

O projeto é gerenciado via **Lovable** (`AGENTS.md` avisa para não reescrever histórico git publicado, pois sincroniza de volta para o editor Lovable) e o build usa um plugin MCP específico da Lovable (`@lovable.dev/mcp-js`).

---

## 1. Estrutura de pastas

```
.
├── docs/                          # Documentação do projeto (ERP_VISION.md, este arquivo)
├── public/                        # Assets estáticos (favicon, logo, manifest PWA)
├── supabase/
│   ├── config.toml                # Apenas project_id
│   └── migrations/                # 0001_initial_schema.sql (baseline nova) + 21 migrations antigas (ver §15)
├── src/
│   ├── assets/                    # Imagens versionadas com metadado .asset.json (convenção Lovable)
│   ├── components/
│   │   ├── ui/                    # ~46 primitivos shadcn/ui (Radix + cva) — boilerplate, sem lógica de negócio
│   │   ├── ai/                    # UI do assistente de IA (drawer, botão flutuante, mensagens)
│   │   ├── BarcodeConverterTab.tsx
│   │   ├── CommissionTab.tsx
│   │   └── PromotionsTab.tsx
│   ├── hooks/                     # Hooks genéricos reutilizáveis (hoje só use-mobile.tsx)
│   ├── integrations/supabase/     # Clientes Supabase (browser, server, admin) + tipos gerados
│   ├── lib/
│   │   ├── ai/                    # Server function do chat de IA + gateway de modelo
│   │   ├── mcp/                   # Implementação do servidor MCP exposto pelo app
│   │   ├── error-capture.ts, error-page.ts, lovable-error-reporting.ts  # infra de erro
│   │   └── utils.ts                # helper `cn()` (clsx + tailwind-merge)
│   ├── routes/                    # Roteamento por arquivo do TanStack Router (ver §4)
│   ├── services/ai/               # Camada de serviço do chat (contexto React, prompts, tools) — ver §9 e §15
│   ├── router.tsx, routeTree.gen.ts  # Config do TanStack Router (gen. automático, não editar)
│   ├── server.ts, start.ts        # Entry point do servidor (TanStack Start / Nitro) + middlewares globais
│   └── styles.css                 # Tailwind v4 + tema shadcn ("new-york", cssVariables)
├── AGENTS.md                       # Aviso do Lovable sobre git history
├── components.json                 # Config shadcn/ui
├── vite.config.ts, tsconfig.json, eslint.config.js
└── package.json
```

---

## 2. Tecnologias utilizadas

**Core:** React 19, TypeScript 5.8 (strict), TanStack Start 1.168 (SSR) + TanStack Router 1.170 (roteamento por arquivo) + TanStack Query 5.101, Vite 8, Nitro (build/server target).

**Backend/dados:** Supabase (`@supabase/supabase-js` 2.110) — Postgres + Auth + RLS; nenhum ORM.

**UI:** Tailwind CSS 4.2 (`@tailwindcss/vite`), shadcn/ui ("new-york" style) sobre Radix UI, `lucide-react` (ícones), `sonner` (toasts), `recharts` (gráficos), `@dnd-kit/core` (drag-and-drop da fila de vendedoras), `cmdk`, `vaul`, `embla-carousel-react`, `react-day-picker`, `react-resizable-panels`.

**Formulários/validação:** `react-hook-form` + `@hookform/resolvers` + `zod`.

**Exportação/arquivos:** `xlsx`, `jspdf` + `jspdf-autotable`, `pdfjs-dist` (leitura de PDF no navegador).

**IA:** Vercel `ai` SDK (`generateText`, `tool`, `stepCountIs`) + `@ai-sdk/openai-compatible` apontando para o **Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1`), modelo `google/gemini-3.5-flash`, chave `LOVABLE_API_KEY`. `react-markdown` + `remark-gfm` para renderizar as respostas.

**MCP:** `@lovable.dev/mcp-js` — o próprio app se expõe como servidor MCP (ver §10 e §15).

**Qualidade:** ESLint 9 (`typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-prettier`), Prettier 3.

**Infra/deploy:** Vercel (conforme `docs/ERP_VISION.md`), GitHub, Supabase Cloud/Lovable Cloud.

**Gerenciador de pacotes:** projeto tem tanto `bun.lock`/`bunfig.toml` quanto `package-lock.json` — dois lockfiles de gerenciadores diferentes coexistindo (ver §15).

---

## 3. Fluxo de autenticação

**Não há Supabase Auth real em uso.** Nenhuma chamada a `signInWithPassword`, `signUp` ou `onAuthStateChange` existe no código. Toda a infraestrutura de sessão Supabase (`persistSession: true` no client browser, middleware `attachSupabaseAuth` anexando Bearer token, middleware server `requireSupabaseAuth` validando JWT) está implementada e corretamente conectada em `src/start.ts`, mas é **efetivamente um caminho morto**: como nunca há login Supabase, nunca existe sessão/token para anexar.

O que existe de fato são **dois fluxos de autorização customizados, via RPC + `sessionStorage`**:

**a) Login administrativo (`/admin`, `src/routes/admin.tsx`):**
1. Formulário usuário/senha chama `supabase.rpc("verify_admin", { _username, _password })` (a função valida com `crypt()` contra `admin_users.password_hash`).
2. Em sucesso, grava em `sessionStorage`: `lupo_admin_ok="1"`, `lupo_admin_user`, e **`lupo_admin_pass` — a senha em texto puro**.
3. Essas chaves são relidas por `getAdminActor()` e reenviadas como parâmetros de texto puro em **toda** RPC sensível subsequente (`verify_admin_user`, `admin_list/create/update/delete`, `list_commission_imports`, `get_commission_full`, `save/close/reopen/delete_commission_import`) — ou seja, o banco reautentica a senha a cada ação, ao invés de confiar em um token de sessão.
4. "Logado" ao recarregar a página = apenas `sessionStorage.getItem("lupo_admin_ok") === "1"`; não há reverificação servidor no reload.
5. Logout limpa as três chaves e dispara um evento customizado `lupo-admin-auth-changed` (usado por `components/ai/index.tsx` para saber se deve mostrar o assistente de IA).

**b) PIN da loja (`/loja/$storeId`, `src/routes/loja.$storeId.index.tsx`):**
1. PIN numérico chama `supabase.rpc("verify_store_pin", { _store_id, _pin })`.
2. Em sucesso, grava `sessionStorage["lupo_store_pin_ok_<storeId>"] = "1"`.
3. Reload = mesma checagem client-only, sem novo round-trip ao servidor.
4. Sem rate-limit/bloqueio de tentativas visível.

**Papéis (admin vs. gerente):** só é verificado dentro de `CommissionTab.tsx` — `verify_admin_user` retorna `{ role, store_id }`; `gerente` fica restrito à própria loja e sem acesso a algumas ações financeiras. **Em todas as outras abas do admin não há checagem de papel** — qualquer linha válida em `admin_users` (admin ou gerente) vê e usa todas as abas, inclusive criar/apagar outros usuários admin.

**Riscos observados (informativo, nada foi alterado):** senha em texto puro em `sessionStorage` e retransmitida por RPC; "logado" é uma flag client-side sem verificação de sessão (qualquer um pode setar a chave via devtools, ficando a cargo das RPCs/RLS barrar dados); PINs de loja gerados com `Math.random()` (não criptográfico) e exibidos uma vez via `alert()`; sem expiração de sessão além do fechamento da aba.

---

## 4. Fluxo de navegação

Roteamento **por arquivo** via TanStack Router (`src/routeTree.gen.ts` é gerado, nunca editar à mão — ver `src/routes/README.md`). O único layout raiz é `src/routes/__root.tsx`, que envolve tudo em `QueryClientProvider` + `AIAssistant` (provider do chat) + `Toaster` (sonner), e define `notFoundComponent`/`errorComponent` globais.

Navegação real do usuário:

```
/                                            → escolhe uma loja ativa
  └─ /loja/$storeId                          → PIN da loja → fila de vendedoras (arrastar para "em atendimento")
       └─ /loja/$storeId/vendedora/$repId    → tela de atendimento (venda / não vendeu), suporta
            │                                   múltiplos atendimentos abertos simultâneos por vendedora
            └─ /loja/$storeId/vendedora/$repId/nao-vendeu   → captura de motivo (com "Outro" em texto livre)

/admin                                       → login admin → abas: Dashboard, Por vendedora, Pausas,
                                                Lojas, Vendedoras, Motivos, Usuários, Comissão,
                                                Ferramentas (Promoções, Conversor de código de barras), Exportar
```

Rotas de protocolo (não navegáveis por humanos, geradas automaticamente pelo `@lovable.dev/mcp-js`): `/mcp`, `/.mcp/list-tools`, `/.mcp/invoke-tool/$tool`, `/.well-known/oauth-protected-resource` (ver §10).

Não há navegação por menu/sidebar tradicional entre `/` e `/admin` fora de um link no cabeçalho da home — são dois "apps" praticamente independentes dentro do mesmo projeto (kiosk de loja vs. painel administrativo).

---

## 5. Todas as páginas existentes

| Rota | Arquivo | Propósito |
|---|---|---|
| `/` | `src/routes/index.tsx` | Lista lojas ativas (`stores`), link para cada `/loja/$storeId` e para `/admin` |
| `/admin` | `src/routes/admin.tsx` (1582 linhas) | Painel administrativo completo — 10 seções internas (ver abaixo) |
| `/loja/$storeId` | `src/routes/loja.$storeId.index.tsx` (777 linhas) | Kiosk da loja: PIN gate + fila de vendedoras (disponível/em atendimento/almoço/saída) com drag-and-drop |
| `/loja/$storeId/vendedora/$repId` | `src/routes/loja.$storeId.vendedora.$repId.index.tsx` (181 linhas) | Tela de atendimento da vendedora — registrar venda ou ir para "não vendeu" |
| `/loja/$storeId/vendedora/$repId/nao-vendeu` | `src/routes/loja.$storeId.vendedora.$repId.nao-vendeu.tsx` (143 linhas) | Captura do motivo de não-venda |
| `/mcp` | `src/routes/mcp.ts` | Endpoint de protocolo MCP (JSON-RPC) — gerado automaticamente |
| `/.mcp/list-tools` | `src/routes/[.mcp]/list-tools.ts` | Endpoint REST auxiliar do MCP |
| `/.mcp/invoke-tool/$tool` | `src/routes/[.mcp]/invoke-tool/$tool.ts` | Endpoint REST auxiliar do MCP |
| `/.well-known/oauth-protected-resource` | `src/routes/[.well-known]/oauth-protected-resource.ts` | Metadados OAuth (não configurado — ver §15) |

**As 10 seções internas de `/admin`** (não são rotas próprias, são abas do mesmo componente `AdminPage`):
1. **Dashboard** — KPIs, ranking de vendedoras, motivos de não-venda (gráfico), gráfico horário, histórico
2. **Por vendedora** — mesmos filtros, drill-down por vendedora individual
3. **Pausas** — relatório de pausas (almoço/saída) por vendedora e motivo
4. **Lojas** — CRUD de `stores` (nome, PIN, ativo)
5. **Vendedoras** — CRUD de `sales_reps` (nome, loja, fila, ativo)
6. **Motivos** — CRUD de `no_sale_reasons`
7. **Usuários** — CRUD de `admin_users` (via RPCs `admin_*`)
8. **Comissão** — delega para `CommissionTab`
9. **Ferramentas** — dropdown para `PromotionsTab` e `BarcodeConverterTab`
10. **Exportar** — exportação de atendimentos em Excel/PDF

---

## 6. Todos os componentes

### Não-UI (lógica de negócio)
| Componente | Linhas | Resumo |
|---|---|---|
| `BarcodeConverterTab.tsx` | 147 | Extrai códigos de barra de PDFs (client-side, `pdfjs-dist`) e gera CSV. Sem acesso a Supabase. |
| `CommissionTab.tsx` | 1546 | Módulo completo de comissionamento: import de planilha, metas (Meta/Super/Hiper), cálculo de premiação, ranking, exportação, recibos imprimíveis. Usa `getAdminActor()` de `admin.tsx`. |
| `PromotionsTab.tsx` | 1268 | Gerador de CSV de promoções: import de planilha de estoque, filtros multi-facetados, exclusão manual de códigos, histórico em `promo_exports`. |

### `src/components/ai/*` (UI do assistente de IA)
| Componente | Linhas | Resumo |
|---|---|---|
| `index.tsx` | 47 | `AIAssistant` — monta `AIProvider` e só renderiza o botão/drawer em `/admin` com sessão admin ativa (`useAdminAuthed`, checagem por evento + storage + poll de 1s) |
| `AIChatDrawer.tsx` | 124 | Painel lateral do chat — consome `useAI()`, sem acesso direto ao Supabase |
| `ChatMessage.tsx` | 59 | Bolha de mensagem; renderiza markdown (`react-markdown`+`remark-gfm`) para respostas da IA |
| `FloatingAIButton.tsx` | 28 | Botão flutuante que abre/fecha o drawer |
| `SuggestionChips.tsx` | 25 | Chips de sugestão de pergunta rápida |
| `TypingIndicator.tsx` | 12 | Indicador "pensando..." |

### `src/components/ui/*` (46 arquivos)
Primitivos padrão **shadcn/ui** (accordion, alert(-dialog), avatar, badge, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input(-otp), label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle(-group), tooltip) sobre Radix UI + `class-variance-authority`. Boilerplate gerado, sem lógica de negócio própria do projeto.

---

## 7. Todos os hooks

| Hook | Local | Propósito |
|---|---|---|
| `useIsMobile()` | `src/hooks/use-mobile.tsx` | Detecta viewport < 768px via `matchMedia`; usado por `components/ui/sidebar.tsx` |
| `useAI()` | `src/services/ai/AIProvider.tsx:101` | Consome o contexto do assistente de IA (ver §8) |
| `useStores()` | `src/routes/admin.tsx:263` (interno, não exportado) | Carrega lista de lojas para os filtros do dashboard |
| `useAttendances(start, end, storeId)` | `src/routes/admin.tsx:271` (interno) | Carrega atendimentos fechados no período/loja para os relatórios |
| `useAdminAuthed()` | `src/components/ai/index.tsx:9` (interno) | Deriva se o assistente de IA deve aparecer (sessão admin ativa) |
| `useChart()`, `useCarousel()`, `useSidebar()` | `src/components/ui/{chart,carousel,sidebar}.tsx` | Hooks internos dos primitivos shadcn/ui (não são hooks de negócio do app) |

Não existe uma pasta central de "hooks de domínio" — `useStores`/`useAttendances` vivem soltos dentro de `admin.tsx` em vez de `src/hooks/`.

---

## 8. Todos os contextos

Apenas **um** contexto de negócio real:

- **`AIProvider` / `useAI()`** — `src/services/ai/AIProvider.tsx`. Expõe `{ open, setOpen, toggle, messages, isThinking, send, newConversation, clearConversation }` para toda a árvore abaixo de `__root.tsx` (via `AIAssistant`). É o único React Context "de produto" no app.

Os demais `createContext` encontrados (`toggle-group.tsx`, `sidebar.tsx`, `form.tsx`, `carousel.tsx`, `chart.tsx`) são internos aos primitivos shadcn/ui, não contextos de domínio da aplicação.

---

## 9. Todos os serviços

Pasta `src/services/ai/` — camada de serviço do chat de IA (lado cliente):

| Arquivo | Papel |
|---|---|
| `AIProvider.tsx` | Contexto React + estado da conversa (ver §8) |
| `chatService.ts` | Converte mensagens para o formato "wire" enviado ao servidor; define `QUICK_SUGGESTIONS` |
| `aiService.ts` | Wrapper fino que chama a server function `aiChat` |
| `contextBuilder.ts` | Monta contexto adicional (rota atual, etc.) — **atualmente descartado no servidor, ver §15** |
| `promptBuilder.ts` | Monta um system prompt do lado cliente — **também descartado no servidor, ver §15** |
| `tools/index.ts` | Registro `aiTools` — **stub, todas as entradas retornam `notImplemented()`, não conectado a nada, ver §15** |

O trabalho real de servidor (prompt de verdade + tools reais + chamada ao modelo) está em `src/lib/ai/chat.functions.ts`, não em `services/ai/` — ver §15 para a duplicação entre as duas camadas.

---

## 10. Todas as integrações com Supabase

| Arquivo | Papel |
|---|---|
| `src/integrations/supabase/client.ts` | Cliente browser (`anon`/`publishable` key), `persistSession: true`, storage = `localStorage` (mas nunca há login real — ver §3) |
| `src/integrations/supabase/client.server.ts` | Cliente **service role** (bypassa RLS) — só deve ser importado dentro de módulos `*.server.ts`, nunca em rotas/arquivos que vão para o bundle do cliente (comentário explícito no código) |
| `src/integrations/supabase/auth-middleware.ts` | Middleware server (`requireSupabaseAuth`) que validaria um Bearer JWT via `getClaims` — implementado mas sem uso prático hoje (nenhum login gera sessão) |
| `src/integrations/supabase/auth-attacher.ts` | Middleware client (`attachSupabaseAuth`) que anexaria o token de sessão às chamadas de server function — registrado em `src/start.ts`, mas sempre envia headers vazios na prática |
| `src/integrations/supabase/types.ts` | Tipos gerados (`Database`) — 11 tabelas, 16 funções RPC, 2 enums (ver §11/§12); **em sincronia** com `supabase/migrations/0001_initial_schema.sql` |
| `src/lib/mcp/supabase.ts` | Cliente Supabase **exclusivamente com a chave anon**, com comentário explícito no código: "Never reference SUPABASE_SERVICE_ROLE_KEY here — this endpoint is unauthenticated" — usado pelas tools do servidor MCP |
| `src/lib/ai/chat.functions.ts` | Usa `supabaseAdmin` (service role) para as 10 tools do chat de IA — acesso amplo, sem RLS |

---

## 11. Todas as tabelas utilizadas

As 11 tabelas do schema `public` (todas presentes em `supabase/migrations/0001_initial_schema.sql` e em `types.ts`, sem divergência):

| Tabela | Usada por (exemplos) |
|---|---|
| `profiles` | Só existe via trigger `handle_new_user` (Supabase Auth) — **não usada em nenhuma query do app**, pois não há login Auth real |
| `user_roles` | Idem — não referenciada fora da função `has_role` (também não usada pelo app) |
| `stores` | `index.tsx`, `admin.tsx` (StoresTab), `loja.$storeId.index.tsx`, `CommissionTab.tsx`, `chat.functions.ts`, MCP `list-stores.ts` |
| `sales_reps` | `admin.tsx` (SalesRepsTab, dashboards), `loja.$storeId.index.tsx` (fila), rotas de atendimento da vendedora, `chat.functions.ts`, MCP `list-sales-reps.ts` |
| `no_sale_reasons` | `admin.tsx` (ReasonsTab, dashboards), `nao-vendeu.tsx`, `chat.functions.ts`, MCP `list-no-sale-reasons.ts` |
| `attendances` | `admin.tsx` (dashboards/export), `loja.$storeId.index.tsx`, `vendedora/$repId/index.tsx`, `nao-vendeu.tsx`, `chat.functions.ts`, MCP `attendance-summary.ts` |
| `rep_breaks` | `admin.tsx` (BreaksTab), `loja.$storeId.index.tsx` (pausas da fila), `chat.functions.ts` |
| `admin_users` | Só via RPCs `admin_*`/`verify_admin*` (nunca acessada diretamente por `.from()`) |
| `promo_exports` | `PromotionsTab.tsx` (histórico de exportações), `chat.functions.ts` (`promo_history`) |
| `commission_imports` | Só via RPCs de comissão + `chat.functions.ts` |
| `commission_rows` | Só via RPCs de comissão + `chat.functions.ts` |

Observação: `profiles` e `user_roles` existem no schema (herança do template padrão de auth do Supabase/Lovable) mas **não têm nenhum consumidor real no código atual** — candidatas a remoção ou a serem o ponto de partida do "Usuários" multiempresa do ERP futuro.

---

## 12. Todas as funções RPC utilizadas

Todas as 16 funções do schema são chamadas pelo frontend (nenhuma órfã no lado do banco):

| Função RPC | Chamada em |
|---|---|
| `verify_admin` | `admin.tsx` (login) |
| `verify_admin_user` | `admin.tsx`, `CommissionTab.tsx` |
| `verify_store_pin` | `loja.$storeId.index.tsx` (PIN gate) |
| `send_to_end_of_queue` | `loja.$storeId.index.tsx`, `vendedora/$repId/index.tsx`, `nao-vendeu.tsx` |
| `admin_list` / `admin_create` / `admin_update` / `admin_delete` | `admin.tsx` (UsersTab) |
| `list_commission_imports` / `get_commission_full` / `save_commission_import` / `close_commission_import` / `reopen_commission_import` / `delete_commission_import` | `CommissionTab.tsx` |
| `has_role` | Definida no schema, **sem chamador no frontend** (só privilégio `service_role`) |
| `get_commission_summary` | Definida no schema, **sem chamador encontrado no frontend** — possível resquício de refatoração (substituída por `get_commission_full`?) |

---

## 13. Dependências importantes

Já listadas em detalhe no §2 (Tecnologias). Destaques por criticidade:

- **`@supabase/supabase-js`** — única via de acesso a dados, sem ORM intermediário.
- **`@tanstack/react-start` + `@tanstack/react-router`** — definem toda a arquitetura de rotas/SSR; upgrades precisam de cuidado (API ainda em versão `1.x` pré-1.0 estável de fato em alguns pacotes).
- **`ai` + `@ai-sdk/openai-compatible`** — acoplam o assistente ao Lovable AI Gateway; trocar de provedor de IA exigiria mexer em `gateway.server.ts`.
- **`@lovable.dev/mcp-js`** — gera as rotas MCP automaticamente; tem um bug conhecido de separador de path no Windows nativo (contornado em `vite.config.ts`, plugin desabilitado nesse SO).
- **`zod` + `react-hook-form` + `@hookform/resolvers`** — presentes no `package.json` mas não vistos em uso extensivo nas telas analisadas (formulários usam `useState` cru na maior parte do admin) — possível dependência subutilizada.
- **Dois lockfiles** (`bun.lock` e `package-lock.json`) — sinal de ambiguidade sobre qual gerenciador de pacotes é o "oficial" (ver §15).

---

## 14. Pontos fortes da arquitetura

- **Separação clara de clientes Supabase**: browser (anon), server admin (service role, com comentário explícito de uso restrito) e middleware de auth — bem documentados no próprio código, mesmo não estando em uso pleno hoje.
- **RLS habilitado em todas as tabelas**, com política de "negar por padrão" em tabelas sensíveis (`admin_users`, `commission_imports`, `commission_rows`) — acesso só via funções `SECURITY DEFINER`, uma defesa em profundidade mesmo com a autenticação de aplicação sendo fraca (§3).
- **MCP com consciência de segurança**: `src/lib/mcp/supabase.ts` usa deliberadamente a chave anon (nunca a service role) e documenta isso em comentário — desenho correto para um endpoint hoje sem autenticação própria.
- **Tratamento de erro em camadas** bem pensado: `error-capture.ts` + `error-page.ts` + `lovable-error-reporting.ts` cobrem SSR, erros "engolidos" pelo h3, e o error boundary do React — solução não trivial para um problema real do stack (Nitro/h3).
- **Schema de banco consistente**: a baseline `0001_initial_schema.sql` está em sincronia total com `types.ts` (mesmas 11 tabelas, 16 funções, 2 enums) — nenhuma divergência estrutural encontrada.
- **Fluxo de atendimento bem modelado**: suporte a múltiplos atendimentos abertos simultâneos por vendedora, fila com drag-and-drop, badges de conversão em tempo real — a rota `vendedora/$repId/index.tsx` em particular é um dos arquivos mais limpos do projeto (tratamento de erro consistente, estados de carregamento claros).
- **Reuso correto do `cn()` (clsx+tailwind-merge)** e do padrão shadcn/ui em toda a UI — consistência visual.

---

## 15. Débitos técnicos encontrados

### Críticos

1. **`supabase/migrations/` tem duas fontes de verdade coexistindo.** A baseline nova (`0001_initial_schema.sql`, criada nesta sessão) convive com as **21 migrations incrementais originais** (`20260718...` a `20260727...`). Como o runner do Supabase ordena por nome de arquivo, `0001_...` roda **antes** de `2026...` — ou seja, aplicar as migrations do zero hoje executaria a baseline completa e depois tentaria recriar as mesmas tabelas/colunas via migrations antigas, provavelmente falhando ("already exists"). **Ação recomendada:** arquivar/remover as migrations antigas agora que a baseline as substitui, ou renomeá-las para depois de `0001` só se forem genuinamente idempotentes (a maioria não é).
2. **Nenhuma autenticação real de aplicação** (§3) — senha de admin em texto puro em `sessionStorage`, sem verificação de sessão no servidor, sem expiração. Funcional para um cliente único de confiança, mas não é uma base segura para multiempresa/multiusuário do ERP futuro.
3. **Endpoints MCP (`/mcp`, `/.mcp/*`) sem autenticação** — `defineMcp()` não configura `auth`, e o endpoint `/.well-known/oauth-protected-resource` retorna 404 por falta de configuração. Qualquer cliente que alcance a URL pública pode chamar as 4 tools de leitura sem token, ficando a segurança inteiramente a cargo de RLS para o papel `anon`.
4. **Função server `aiChat` sem checagem de autorização própria** — o gate de admin (`sessionStorage` + polling) é só client-side; a server function em si aceita qualquer POST.

### Relevantes

5. **Duas camadas de IA duplicadas e dessincronizadas.** `services/ai/promptBuilder.ts` e `contextBuilder.ts` montam um system prompt que o servidor **descarta ativamente** (`chat.functions.ts` filtra `role !== "system"`) — o prompt real é outro, construído inline em `chat.functions.ts`. `services/ai/tools/index.ts` é um registro-stub (`notImplemented()` em tudo), não conectado às tools reais.
6. **Código morto:** `directAnswerForQuestion()` em `chat.functions.ts` (~60 linhas) é uma implementação completa, porém nunca chamada.
7. **Lógica de negócio duplicada em múltiplos lugares:**
   - `attendance_summary`/listagem de lojas e vendedoras existe tanto em `chat.functions.ts` (client-role admin) quanto nas tools MCP (`src/lib/mcp/tools/*`, client anon) com formas de agregação diferentes.
   - Normalização/parsing de cabeçalho de planilha (`norm()`, `parseFile()`) está reimplementada quase identicamente em `CommissionTab.tsx` e `PromotionsTab.tsx`.
   - A abertura/fechamento de `rep_breaks` é feita tanto em `setStatus()` quanto em `BreakRow` (auto-"backfill" silencioso) em `loja.$storeId.index.tsx` — duas fontes da mesma regra de negócio.
8. **Uso extensivo de `as any`/`as never`** para contornar os tipos gerados do Supabase, principalmente em `CommissionTab.tsx` (RPCs de comissão) e `PromotionsTab.tsx` (`(supabase as any).from("promo_exports")`) — hoje `types.ts` já tipa corretamente todas essas tabelas/funções, então os casts parecem resíduo de um momento em que os tipos ainda não tinham sido gerados, e podem ser removidos com segurança.
9. **Componentes gigantes de arquivo único:** `admin.tsx` (1582 linhas, ~10 seções lógicas), `CommissionTab.tsx` (1546 linhas), `PromotionsTab.tsx` (1268 linhas) — fortes candidatos a divisão em subpastas por seção/aba.
10. **Uso pesado de `prompt()`/`confirm()`/`alert()` nativos do navegador** em `admin.tsx` para ações sensíveis (trocar PIN, mover vendedora de loja, excluir loja/vendedora/motivo) — inconsistente com o resto da UI (shadcn/ui) e sem possibilidade de desfazer.
11. **Sem paginação real nas consultas Supabase** — a maioria das telas de relatório carrega o período inteiro e corta no cliente (`.slice(0, 200)`), o que não escala para lojas com histórico grande.
12. **Tabelas `profiles`/`user_roles` sem nenhum consumidor no app atual** — herdadas do template padrão de auth, mas mortas até que o app adote Supabase Auth de verdade (candidatas naturais ao módulo "Usuários" do ERP).
13. **Função RPC `get_commission_summary`** existe no schema mas não tem chamador identificado no frontend (possível resquício de refatoração para `get_commission_full`).
14. **Dois lockfiles de pacote** (`bun.lock` + `package-lock.json`) — não fica claro qual gerenciador é o oficial do projeto.
15. **Modelo de IA hardcoded** (`"google/gemini-3.5-flash"`) inline no código-fonte em vez de configurável por variável de ambiente.

---

*Nenhum arquivo de código foi alterado durante esta análise. Nenhum commit foi realizado.*
