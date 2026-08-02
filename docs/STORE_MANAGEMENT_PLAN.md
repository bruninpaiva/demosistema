# Plano — Etapa 4.2: Centro de Gestão da Loja

> Escrito em 2026-08-02. Documento de planejamento apenas — **nenhum código foi alterado**. Aguardando aprovação antes de qualquer implementação.

---

## 0. Como cheguei nisso

Antes de desenhar a tela, revisei o que já existe no sistema para não reinventar nem duplicar:

- **`stores`**: `id, name, pin, active, created_at, updated_at` — só isso. Nenhum campo de endereço, telefone, horário ou gerente responsável.
- **`admin_users`**: tem `store_id` — é assim que um `gerente` já fica vinculado a uma loja hoje (dado que já existe, só não é mostrado no contexto da loja).
- **`sales_reps`**: `store_id`, `status` (`available/in_service/lunch/off`), `queue_position`, `active`.
- **`rep_breaks`**, **`attendances`**, **`commission_imports/commission_rows`**: todos já `store_id`-aware.
- **`no_sale_reasons`**: **não** tem `store_id` — é uma lista global do sistema, não da loja.
- A aba **Lojas** atual (`StoresTab`) é hoje uma lista plana: nome, "PIN oculto por segurança", e botões Renomear/Editar PIN/Gerar PIN/Ativar-Desativar/Excluir. Sem contexto nenhum sobre o que está acontecendo na loja.
- O Dashboard (Etapa 4.1) já construiu várias peças que servem quase prontas para esta tela: `useLiveStatus(storeId)` + `LiveStrip`, `useAlerts(stores, reps)` (cada alerta já carrega `storeId`), `useCommissionSummary`, `Kpi`, e a lógica de KPIs condicionais (operacional vs. faturamento conforme o período).
- A aba **Comissão** já tem uma visão de histórico agrupada por loja → ano → mês (cards clicáveis) que também dá pra reaproveitar em formato compacto.
- O kiosk da loja (`loja.$storeId.index.tsx`) é quem gera o estado operacional em tempo real (fila, em atendimento, pausas) — o Centro de Gestão vai **ler** esse estado, nunca operá-lo (isso continua sendo trabalho do kiosk).

Essa base já resolve boa parte do "não quero CRUD tradicional": a maior parte dos dados interessantes de uma loja já existem espalhados pelo sistema — o trabalho aqui é **compor**, não criar.

---

## 1. Estrutura da tela (hierarquia visual)

**Aba "Lojas" deixa de ser uma lista → vira uma galeria de cards.**

```
Lojas (aba)
└── Grade de StoreCard (1 por loja)
     nome · badge ativa/inativa · "3 em atendimento agora" · "8 vendedoras ativas" · badge de alerta se houver
     [clique] ──────────────────────────────────────────────►  Centro de Gestão da Loja
```

> Ajuste aprovado: o `StoreCard` também mostra a quantidade de vendedoras ativas da loja, ao lado do status e dos atendimentos em andamento.

**Dentro do Centro de Gestão (ordem = o que mais muda primeiro, o que quase nunca muda por último):**

```
← Voltar para Lojas          [Nome da loja]            [Ativa ⏻]
─────────────────────────────────────────────────────────────────
🔔 Alertas ativos desta loja (se houver — mesmas 7 regras do Dashboard, filtradas)
─────────────────────────────────────────────────────────────────
🟢 Status operacional agora        (Ao vivo: em atendimento / fila / pausas)
─────────────────────────────────────────────────────────────────
📊 Indicadores                     [seletor de período: Hoje/Ontem/Semana/Mês/Personalizado]
     4 KPIs condicionais (mesma regra do Dashboard)
─────────────────────────────────────────────────────────────────
👥 Equipe                          (roster com status ao vivo + desempenho no período)
─────────────────────────────────────────────────────────────────
🗂 Histórico                        (competências de comissão desta loja)
─────────────────────────────────────────────────────────────────
⚙️ Configurações da loja            (nome, PIN, ativa/inativa)
```

Alertas e status operacional ficam no topo porque respondem "o que está acontecendo agora" — a pergunta que um gestor abrindo a loja tem primeiro. Configurações fica no fim porque é a seção que ele visita com menos frequência.

---

## 2. Informações da loja — o que realmente precisa existir

Resposta curta: **quase tudo que é preciso já existe.** Não vejo justificativa para novos campos agora:

| Dado | Já existe? | Onde |
|---|---|---|
| Nome | ✅ | `stores.name` |
| Status ativa/inativa | ✅ | `stores.active` |
| PIN de acesso do kiosk | ✅ | `stores.pin` (protegido) |
| Gerente(s) responsável(is) | ✅ (implícito) | `admin_users.store_id` — só precisa ser **exibido** aqui, nada novo no banco |
| Data de cadastro | ✅ | `stores.created_at` |

**Não estou propondo**: endereço, telefone, CNPJ, ou qualquer campo cadastral novo — nada no sistema hoje consome esse tipo de dado (não há integração de localização, não há comunicação externa por loja), e adicionar isso agora seria campo por "parecer profissional", não por necessidade real.

**Candidato descartado por ora**: horário de funcionamento por loja. O Dashboard já preparou o terreno (`OPERATING_HOURS` é uma constante isolada exatamente para essa futura parametrização), mas hoje é uma constante global de sistema, e transformá-la em campo por loja exige migration nova — fora do que foi pedido nesta etapa. Deixo como ponto em aberto no fim deste documento.

---

## 3. Configurações — o que é da loja x o que é do sistema

| Configuração | Pertence a | Onde vive hoje |
|---|---|---|
| Nome da loja | **Loja** | editável aqui, no Centro de Gestão |
| PIN de acesso | **Loja** | editável aqui (ver/regenerar — nunca reexibir o PIN salvo) |
| Ativa/Inativa | **Loja** | editável aqui |
| Gerente(s) vinculado(s) | **Loja**, mas a *edição* é de usuário | mostrado aqui (read-only), com link para a aba **Usuários** para vincular/desvincular |
| Motivos de não-venda | **Sistema** | continua exclusivamente na aba **Motivos** — não duplico aqui |
| Horário operacional | **Sistema** (por ora) | constante centralizada no Dashboard; não vira config editável nesta etapa |
| Taxa de comissão / metas | **Por competência**, não da loja nem do sistema | continua exclusivamente na aba **Comissão** (é definida a cada mês, não é um atributo fixo da loja) |

A régua que uso: **se o dado muda a cada mês/competência, não é "da loja"; se o dado é compartilhado por todas as lojas, não é "da loja" — só edito aqui o que é intrínseco e estável daquela unidade específica.**

---

## 4. Indicadores

Reaproveito **exatamente** a regra condicional que aprovamos no Dashboard (Etapa 4.1), agora escopada a uma única loja:

- **Sempre presentes**: Atendimentos, Conversão.
- **Se o período é Mês/Personalizado-em-um-mês-só e existe comissão importada para esta loja**: Faturamento, Ticket médio (via `commission_rows`).
- **Caso contrário** (Hoje/Ontem/Semana, ou mês sem comissão ainda importada): Tempo médio de atendimento, Minutos em pausa.

Isso significa reaproveitar `useCommissionSummary`, `useDashboardMetrics`/`computeDashboardMetrics`, `useBreakMinutes` e o componente `Kpi` já existentes — só trocando o filtro de "todas as lojas" para "esta loja", que é exatamente o caso que esses hooks já suportam (o Dashboard já tem seletor de loja).

Não estou propondo indicadores novos aqui: os 4 já cobrem "o que ajuda o gestor a entender a loja" sem inventar números.

---

## 5. Equipe

Objetivo: mostrar a equipe como **pessoas com estado agora**, não uma tabela de cadastro.

- Grade de cards, um por vendedora ativa da loja:
  - Nome.
  - Badge de status ao vivo (Disponível / Em atendimento / Almoço / Fora) — mesma semântica de cor já usada no kiosk (`loja.$storeId.index.tsx`).
  - Se em pausa: há quanto tempo (reaproveita a lógica de `BreaksTab`/`rep_breaks`).
  - Desempenho no período selecionado (o mesmo seletor da seção de Indicadores): atendimentos e conversão — reaproveita a lógica de agregação por vendedora que já existe no Dashboard (`storeRankingTable`) e no kiosk (`convByRep`).
  - Clique → link para a aba **Por vendedora** já existente, pré-filtrado nessa pessoa (não duplico aquela tela, só aponto pra ela).
- Vendedoras inativas não aparecem aqui (ficam na aba **Vendedoras** para quem precisa reativar/mover de loja — ações de cadastro continuam lá, não trago CRUD para dentro do Centro de Gestão).
- Botão "Gerenciar equipe" no canto da seção → leva à aba **Vendedoras** já filtrada por esta loja (reaproveita `StoreFilter`), para quem precisa cadastrar/mover/desativar.

---

## 6. Status operacional — o que o gestor precisa perceber imediatamente

- **Ao vivo agora**: quantas em atendimento, quantas na fila, quantas em pausa — reaproveitando `useLiveStatus(storeId)` / `LiveStrip` do Dashboard (polling de 30s), sem nenhuma mudança de lógica, só de contexto (já aceita `storeId`).
- **Fila atual em ordem**: uma mini-lista somente leitura de quem está disponível e em que posição — responde "se um cliente entrar agora, quem atende?". Dado já existe em `sales_reps.queue_position`; é read-only aqui (reordenar continua sendo tarefa do kiosk, não do admin).
- **Alertas ativos desta loja**: reaproveito `useAlerts(stores, reps)` do Dashboard — cada alerta já carrega `storeId`, então aqui é só um filtro (`alert.storeId === storeId`), sem tocar na lógica das 7 regras. Aparecem no topo da tela, antes de qualquer indicador.

---

## 7. Histórico

O que realmente existe para mostrar como histórico, sem precisar de tabela nova:

- **Competências de comissão desta loja**: lista compacta (últimos 6–12 meses) reaproveitando o mesmo agrupamento por ano/mês que a aba Comissão já tem, só que pré-filtrado nesta loja e sem os controles de importação/edição. Cada item leva para a aba **Comissão** (módulo completo) se o gestor quiser abrir/editar/exportar.

**O que decidi não incluir agora, e por quê:**
- *Histórico de alertas passados* ("a loja ficou sem movimento 3x essa semana") — seria realmente útil, mas os alertas são calculados ao vivo, não persistidos; teria que criar uma tabela nova de eventos, o que está fora do que foi pedido (sem alterações no banco nesta etapa). Fica como ideia futura.
- *Log de alterações cadastrais* (quem mudou o PIN, quando) — não existe auditoria hoje em nenhuma tela do sistema; não vou introduzir isso isoladamente só para esta tela.

---

## 8. Componentes reutilizáveis

**Reaproveitados sem modificar a lógica interna** (só variando os parâmetros que já aceitam):
- `Kpi` — cartão de indicador com delta.
- `useLiveStatus` / `LiveStrip` — já recebe `storeId`.
- `useAlerts` — já devolve `storeId` por alerta; aqui só filtro o array.
- `useCommissionSummary`, `useDashboardMetrics`, `useBreakMinutes` — já operam por loja quando um `storeId` específico é passado.
- Padrão de agrupamento por ano/mês da aba Comissão (`SelectorView` do `CommissionTab.tsx`) — extraio a grade de cards de competência para um componente compartilhado, usado tanto na aba Comissão quanto aqui (compacto).

**Novos, específicos desta tela:**
- `StoreCard` — item da nova grade da aba Lojas.
- `StoreDetailHeader` — nome, status, voltar.
- `RepStatusChip` — badge de status ao vivo de uma vendedora (hoje esse visual só existe dentro do kiosk; viro componente para reaproveitar aqui e lá).
- `TeamRosterGrid` — grade de vendedoras com status + desempenho.
- `StoreConfigPanel` — nome/PIN/ativo, substituindo os botões soltos do `StoresTab` atual.

Nada disso duplica o que já existe — ou reaproveita direto, ou extrai um componente hoje "preso" dentro de outra aba para servir aos dois lugares.

---

## 9. Responsividade

Mesmo alvo já validado no Dashboard: **desktop (≥1280px) e tablet (768–1024px)**, sem otimização para celular (consistente com o restante do admin).

- **Grade de lojas**: 3–4 colunas no desktop, 2 no tablet.
- **Centro de Gestão**: seções sempre em coluna única (uma abaixo da outra, na ordem da Seção 1) — não faz sentido dividir em 2 colunas lado a lado porque a ordem de prioridade (alertas → status → indicadores → equipe → histórico → config) é sequencial, não paralela.
- **Indicadores**: grade 4 colunas no desktop, 2×2 no tablet — mesmo breakpoint (`xl:`) já usado no Dashboard.
- **Equipe**: grade 3 colunas no desktop, 2 no tablet.

---

## 10. Plano de implementação (commits pequenos)

Cada commit: validar manualmente → `npm run build` → só então seguir para o próximo. Sem push até aprovação final — mesma disciplina da Etapa 4.1.

1. **Grade de lojas**: transformar `StoresTab` de lista plana em grade de `StoreCard` (nome, status, contagem ao vivo básica, clique navega para o detalhe). Sem lógica nova de dados ainda.
2. **Shell do Centro de Gestão**: header (nome/status/voltar) + esqueleto das seções vazias, navegação para dentro/fora funcionando.
3. **Status operacional**: `LiveStrip` reaproveitado + fila atual (mini-lista read-only).
4. **Alertas**: filtrar `useAlerts` por `storeId`, renderizar banners no topo.
5. **Indicadores**: KPI row condicional (reaproveitando os hooks do Dashboard) + seletor de período.
6. **Equipe**: `TeamRosterGrid` com `RepStatusChip` + desempenho no período + link para "Por vendedora".
7. **Histórico**: lista compacta de competências desta loja + link para a aba Comissão.
8. **Configurações**: `StoreConfigPanel` (nome/PIN/ativo), aposentando os botões soltos do `StoresTab` antigo.
9. **Polish**: responsividade tablet, estados vazios/carregando, revisão visual e de copy geral da tela.

---

## Pontos em aberto para sua decisão

1. **Horário operacional por loja** — vira configuração editável nesta etapa (exigiria 1 migration: nova coluna em `stores`), ou continua fora de escopo por enquanto?
   *Minha recomendação: fora de escopo agora — nenhuma tela ainda consome isso além do Dashboard, e o "não fazer alterações no banco" foi explícito para esta rodada.*
2. **Navegação do detalhe da loja** — mantenho como estado interno da aba (mesmo padrão do `CommissionTab`: lista → detalhe → voltar, sem URL própria), ou vira uma rota real (`/admin/lojas/$storeId`)?
   *Minha recomendação: estado interno, por consistência com o resto do admin e para evitar a complexidade de aninhamento de rotas do TanStack Router.*
3. **Criar loja nova** — mantenho o formulário simples de hoje (nome + PIN) no topo da grade, ou isso muda em algo?
   *Minha recomendação: manter como está — não é o foco desta etapa.*

Se estiver de acordo (com ou sem ajustes nesses 3 pontos), inicio a implementação seguindo o plano de commits acima.
