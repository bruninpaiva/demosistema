# Projeto do Dashboard — Etapa 4.1

> Documento de planejamento. **Nenhum código foi alterado para produzir isto** — é a base para aprovação antes da implementação. Escrito em 2026-08-02, com base em leitura direta do schema (`supabase/migrations/`), do código atual (`src/routes/admin.tsx`, `src/components/*Tab.tsx`, `src/lib/ai/chat.functions.ts`) e do skill de dataviz do projeto.

---

## 0. Diagnóstico — o que já existe hoje

Antes de propor qualquer coisa nova, vale registrar o que já existe, porque o plano abaixo **reaproveita** boa parte disso em vez de reinventar:

- **Já existe uma aba "Dashboard"** (`admin.tsx:887-1152`). Ela filtra por loja + período (Hoje/Ontem/Últimos 7 dias/Este mês/Personalizado — o mesmo padrão usado em "Por vendedora", "Pausas" e "Exportar") e mostra: 4 KPIs (Atendimentos, Vendas, Não vendas, Conversão), ranking de vendedoras, gráfico de motivos de não-venda, gráfico de atendimentos por hora, detalhamento de não-vendas por vendedora e uma tabela crua com as últimas 200 não-vendas.
- **O que falta nela, e é o motivo desta etapa existir**: não mostra **faturamento** (nem em R$, nem ticket médio), não compara **loja com loja**, não mostra **nada de pausas/comissão/metas**, e não tem **nenhuma informação "agora"** (fila atual, quem está atendendo, quem está em pausa). Ou seja: hoje ela documenta o passado imediato de vendas/não-vendas — não dá a "temperatura" completa do negócio.
- **Faturamento já é calculável** (soma de `attendances.amount` onde `type='sale'`) — só não está exposto em nenhuma tela hoje; só existe dentro da ferramenta de IA (`chat.functions.ts`, função `attendance_summary`), que já faz esse cálculo.
- **"Fila agora" e "quem está atendendo" já são deriváveis** das tabelas atuais (`sales_reps.status`, `attendances` com `status='open'`) — o app da loja (kiosk) já escreve esse estado a cada ação da vendedora. Só não existe nenhuma tela de admin que leia isso ao vivo — nem polling, nem Supabase Realtime existem hoje em nenhum lugar do app.
- **"Metas" hoje é só a Meta/Super Meta/Hiper Meta mensal por loja**, cadastrada manualmente na aba Comissão (`commission_imports.meta_amount` + `commission_config` jsonb). Não existe meta diária, meta por vendedora, nem meta derivada automaticamente do histórico de vendas.
- **Não existe "grupo de lojas"** no schema — `stores` não tem coluna de região/grupo. Isso afeta o filtro pedido na seção 3.
- **Não existe distinção de papel na UI hoje** — um `gerente` vê exatamente a mesma coisa que um `super_admin` (a única segmentação por papel é no backend, nas RPCs de comissão). Isso é relevante para decidir se o Dashboard deve, no futuro, abrir já filtrado na loja do gerente.

**Decisão proposta**: o novo Dashboard **substitui** a aba "Dashboard" atual (mesmo lugar no menu), não cria uma aba nova. As abas "Por vendedora", "Pausas" e "Comissão" continuam existindo para quem quer se aprofundar — o Dashboard vira o resumo executivo que aponta pra elas, não uma quarta cópia dos mesmos gráficos.

---

## 1. Estrutura completa da tela

```
Cabeçalho
  ↓
Barra de filtros
  ↓
Alertas                    ← só ocupa espaço quando existe algo a dizer
  ↓
KPIs
  ↓
Ao vivo (tempo real)
  ↓
Gráficos
  ↓
Rankings
  ↓
Área de IA
  ↓
Rodapé
```

**Por que essa ordem, e não "KPIs primeiro"?**

A regra de ouro do pedido é "entender a situação em 5 segundos". Isso significa que a tela precisa responder, nessa ordem de prioridade: *(1) tem algo errado agora? (2) como estamos indo no período? (3) por quê?*. Um alerta ("loja sem nenhuma venda há 2h") é mais urgente que um KPI normal — por isso ele fica acima dos KPIs, mas **sem reservar espaço fixo**: se não há alerta, o bloco simplesmente não existe, e o olho vai direto pro KPI. Isso evita a armadilha clássica de dashboard "bonito" que enche a tela de caixas vazias.

### Cabeçalho
Título ("Dashboard"), o **período ativo por extenso** ("Hoje, 02/08/2026") e um indicador discreto de frescor dos dados ("atualizado há 12s"). Um gestor que abre o painel no meio da correria precisa saber, sem clicar em nada, o que ele está vendo e se é atual. Botão de exportar (reaproveitando o padrão xlsx/PDF que já existe na aba Exportar) fica aqui, não perdido no rodapé.

### Barra de filtros
Compacta, uma linha só (ver seção 3). Fica sempre visível — filtro que exige scroll pra achar é filtro que ninguém usa.

### Alertas
Ver seção 6. Um banner por alerta ativo, cor reservada por severidade (nunca cor só — sempre ícone + texto, seguindo a convenção de acessibilidade do skill de dataviz do projeto).

### KPIs
4 números, um resumo do período filtrado. Ver seção 2 — é a seção mais importante deste documento, porque é onde mais é tentador errar por excesso.

### Ao vivo
Uma faixa separada e visualmente distinta dos KPIs — porque KPIs são "do período selecionado" e isto é "agora mesmo", independente do filtro de período. Misturar as duas coisas na mesma fileira confunde (um gestor pode filtrar "este mês" e ver "3 atendimentos em andamento agora" ao lado de "R$ 45.000 faturados este mês" — são duas naturezas de dado diferentes e precisam estar visualmente separadas).

### Gráficos
Só dois. Ver seção 4.

### Rankings
Lojas e vendedoras, lado a lado (ou em abas, no tablet). Aqui mora a ação: "quem eu elogio, quem eu preciso ligar hoje".

### Área de IA
Reservada, vazia por enquanto. Ver seção 7.

### Rodapé
Links para "Por vendedora", "Pausas" e "Comissão" — "quer ver mais detalhe? vá pra lá." O Dashboard não tenta ser todas as telas ao mesmo tempo.

---

## 2. KPIs

**Ponto de partida: o que NÃO entra, e por quê.**

- **"Vendas" (contagem) não vira um card próprio** — ela já está implícita em Atendimentos × Conversão, e mostrar as três juntas é redundância pura (é o erro mais comum de dashboard: números que dizem a mesma coisa duas vezes). O número de vendas aparece, sim, mas como texto de apoio dentro do card de Conversão ("32% · 48 de 150 atendimentos").
- **"Não vendas" também não vira card** — é o complemento de vendas, mesma lógica.
- **Metas/atingimento não entra aqui** — hoje é só mensal e cadastrado manualmente (seção 0), então misturar com KPIs diários/do-período seria comparar coisas de naturezas diferentes. Atingimento de meta mensal continua sendo assunto da aba Comissão.

**Os 4 KPIs escolhidos** — cada um responde uma pergunta diferente, sem sobreposição:

| KPI | Pergunta que responde | Fonte |
|---|---|---|
| **Faturamento** | Quanto entrou? | soma de `attendances.amount` onde `type='sale'` |
| **Atendimentos** | Qual foi o movimento? | contagem de `attendances` fechados |
| **Conversão** | Desse movimento, quanto viramos venda? | vendas / atendimentos |
| **Ticket médio** | Cada venda vale quanto, em média? | faturamento / vendas |

Cada card mostra também um **delta vs. período anterior equivalente** (▲/▼ + %, ou pontos percentuais no caso da Conversão), só quando o gestor ativa o comparador de período (seção 3) — por padrão fica oculto, pra não forçar uma segunda consulta em toda visita à tela.

Ordem visual: Faturamento primeiro e com destaque maior (é a pergunta que qualquer dono de negócio faz primeiro), os outros três em tamanho igual ao lado.

---

## 3. Filtros

| Filtro | Como funciona | Observação |
|---|---|---|
| **Período** | Reaproveita exatamente o componente que já existe (`DateRangeBar`): Hoje / Ontem / Últimos 7 dias / Este mês / Personalizado. | Já testado, já é o padrão em 4 abas — não reinventar. |
| **Loja** | Reaproveita `StoreFilter`: "Todas as lojas" ou uma loja específica. | Já existe. |
| **Vendedor** | Novo: dropdown de vendedoras, dependente da loja escolhida (some se "Todas as lojas" e há muitas vendedoras — nesse caso, filtrar por vendedor deveria antes escolher a loja). | Serve pra um gestor "zoomar" numa pessoa sem sair do Dashboard e ir pra "Por vendedora". |
| **Comparação entre períodos** | Não é bem um filtro — é um interruptor ("Comparar com período anterior") que liga os deltas nos KPIs e uma linha tracejada de referência no gráfico de tendência. Desligado por padrão. | Evita que a tela fique com números demais por padrão; quem quer comparação, ativa. |
| **Grupo de lojas** | **Não existe ainda.** `stores` não tem coluna de região/grupo hoje. | Deixo o espaço reservado na barra de filtros (desabilitado, com texto "em breve"), igual ao padrão já usado antes para "Sessões" na tela de usuários — mas isso exige uma migration nova (`ALTER TABLE stores ADD COLUMN group_name`), que não faz parte desta etapa. Proponho isso como item de uma etapa futura, não aqui. |

---

## 4. Gráficos

Só dois gráficos principais — e um mini-ranking textual que não conta como "gráfico" de verdade.

### 4.1 Tendência (linha)
Um único gráfico com um **seletor de métrica** (Faturamento | Atendimentos | Conversão — uma de cada vez), nunca duas escalas diferentes no mesmo eixo. Isso segue a regra mais importante de visualização de dados usada no projeto: **nunca combinar duas métricas de escalas diferentes (R$ e contagem, por exemplo) no mesmo gráfico com dois eixos Y** — é o erro nº1 de gráfico e o dashboard atual já tangencia isso ao colocar vendas/não-vendas juntas (funciona ali porque as duas são "contagem", mesma unidade — mas Faturamento e Atendimentos não são).

- Se o período é **Hoje/Ontem** → granularidade por hora (reaproveita o bucket 8h-22h que já existe).
- Se o período é **semana/mês/personalizado** → granularidade por dia.

Por que um seletor em vez de três gráficos fixos? Porque três gráficos de tendência empilhados é exatamente o "encher a tela de números" que foi pedido pra evitar — a maioria das visitas ao dashboard só precisa de uma métrica por vez, e quem quer ver as três troca o seletor em um clique.

### 4.2 Ranking de lojas (barra horizontal)
Barra horizontal, ordenada, uma loja por linha, usando a **mesma métrica selecionada no gráfico de tendência** (Faturamento, Atendimentos ou Conversão) — assim os dois gráficos sempre contam a mesma história, só que um no tempo e outro por loja. Esse gráfico **não existe hoje** e é a peça que mais falta: hoje, com "todas as lojas" selecionado, o dashboard atual só agrega tudo junto e esconde completamente que a Loja A pode estar arrasando enquanto a Loja B não vende nada.

Esse gráfico só aparece quando o filtro de loja está em "Todas as lojas" — se uma loja específica já está selecionada, comparar "ela com ela mesma" não faz sentido, e o espaço vira o mini-ranking de vendedoras daquela loja (mesmo componente, dado diferente — ver `RankingCard` na seção 9).

### O que fica de fora dos gráficos "grandes"
- **Motivos de não-venda**: continua existindo, mas como uma lista compacta de texto (top 3, com contagem) ao lado dos rankings — não como um gráfico de barra ocupando um card inteiro como é hoje. Motivo: é informação de segundo nível (explica a Conversão, não é a Conversão) — quem quer o detalhe completo já tem a aba "Motivos".
- **Não-vendas por vendedora / histórico bruto de não-vendas**: saem do Dashboard. Isso é material de auditoria/detalhe, não de "entenda em 5 segundos" — continua acessível pela aba "Por vendedora".

---

## 5. Informações em tempo real

| Informação | Atualiza como | Fonte |
|---|---|---|
| Atendimentos em andamento agora (por loja) | Poll a cada 30s | `attendances` com `status='open'` |
| Vendedoras em pausa agora (almoço/saída) | Poll a cada 30s | `rep_breaks` com `ended_at IS NULL` |
| "Atualizado há Xs" no cabeçalho | Reflete o poll mais recente | — |
| KPIs e gráficos do período | Poll a cada 60–120s (não precisa ser tão frequente quanto o "agora") | mesmas queries já usadas hoje |

**Por que 30s e não Supabase Realtime?** Hoje **nada no projeto usa Realtime** — o padrão existente em todo o app é "buscar de novo depois de uma ação" (o próprio kiosk da loja funciona assim). Um intervalo de 30s reaproveita exatamente a mesma cadência que o kiosk já usa pra atualizar o cronômetro de pausa em andamento, então não é uma técnica nova sendo introduzida — é o mesmo padrão, aplicado a uma tela nova. Realtime (`postgres_changes`) é uma melhoria genuína e razoável para uma etapa futura, mas seria infraestrutura nova; não estou propondo isso para a primeira versão.

Importante: **os gráficos não devem "pular" a cada atualização** — só os números da faixa "Ao vivo" atualizam rápido. Gráfico que remonta a cada 30 segundos é distração, não informação.

---

## 6. Alertas

Regras propostas, todas computáveis com os dados que já existem hoje (nenhuma precisa de coluna nova):

| Alerta | Condição | Severidade | Fonte |
|---|---|---|---|
| **Conversão caiu** | Conversão do período atual ≥10 pontos percentuais abaixo do período anterior equivalente | Atenção | `attendances` (mesmo cálculo do KPI, comparado) |
| **Fila aumentando** | Mais de 5 atendimentos `status='open'` simultâneos numa loja, por mais de 15 minutos seguidos | Atenção | `attendances` |
| **Nenhuma venda há muito tempo** | Loja ativa sem nenhum `type='sale'` fechado há mais de 60 minutos, dentro do horário em que a loja normalmente opera | Crítico | `attendances` |
| **Pausas acima do normal** | Soma de minutos em pausa (excluindo o sentinela "Fora horário de trabalho", já ignorado em todo o resto do app) por loja/vendedora acima de um limiar do dia | Atenção | `rep_breaks` |
| **Loja sem movimento** | Zero atendimentos abertos ou fechados por 90 minutos, dentro do horário de operação | Crítico | `attendances` |
| **Vendedora zerada há muito tempo** | Vendedora ativa, em atendimento, sem nenhuma venda fechada nas últimas N horas do turno | Informativo | `attendances` + `sales_reps` |
| **Loja destoante das demais** | Conversão de uma loja abaixo da média das outras lojas no mesmo período por uma margem grande (ex.: metade da média geral) | Informativo | `attendances`, comparado entre lojas |

Cada alerta carrega: ícone + rótulo de severidade (nunca só cor, seguindo a regra de acessibilidade do skill de dataviz — cor sozinha nunca é a única pista) + texto humano ("Loja Centro sem nenhuma venda há 1h32") + link direto pra loja/vendedora envolvida.

Ponto em aberto que não dá pra resolver só com os dados de hoje: "horário em que a loja normalmente opera" não existe como conceito no schema (não há `stores.horario_abertura`/`horario_fechamento`). Duas saídas possíveis: (a) usar um horário comercial fixo configurável globalmente (ex.: 9h–20h) como aproximação razoável pra v1, ou (b) adicionar essas colunas em `stores` numa migration futura. Recomendo (a) pra não bloquear esta etapa.

---

## 7. Área de IA

Um card reservado, no mesmo espírito do que já foi feito recentemente na tela de Usuários para "Sessões" — um aviso discreto, sem jargão técnico, sem prometer uma data:

> **Insights do BPInfo AI**
> Em breve, aqui vão aparecer observações automáticas sobre o desempenho do período — como quedas de conversão, lojas fora do padrão ou vendedoras em destaque.

Nenhuma lógica de IA nesta etapa. O motivo de reservar o espaço agora, e não só adicionar depois: o assistente de IA do projeto (`chat.functions.ts`) já sabe calcular praticamente tudo que apareceria aqui (`attendance_summary`, `rep_detail`, `commission_overview`) — quando essa etapa for implementada, é reaproveitar essas mesmas funções para gerar 2–3 frases automáticas, não construir do zero.

---

## 8. Responsividade

### Desktop (padrão atual do admin, ≥1024px)
Layout como descrito na seção 1: KPIs em uma fileira de 4, os dois gráficos lado a lado, os dois rankings lado a lado.

### Tablet (foco explícito — é como muitos gestores usam o painel andando pela loja)
- **KPIs**: grade 2×2 em vez de fileira de 4 — continuam todos visíveis sem rolar.
- **Gráficos**: empilhados, um embaixo do outro em largura total — dois gráficos espremidos lado a lado num tablet ficam ilegíveis (eixos e rótulos amontoados).
- **Rankings**: viram abas ("Lojas" / "Vendedoras") em vez de lado a lado, pra cada tabela ter largura total e não precisar de scroll horizontal.
- **Filtros**: os presets de período continuam em pills (já funcionam bem em telas menores, é o padrão que o app já usa); loja e vendedor viram uma segunda linha se não couberem na primeira.
- **Números da faixa "Ao vivo"**: fonte maior — um gestor olhando de relance andando pela loja precisa ler sem parar e aproximar o tablet.
- **Tabelas** (rankings, quando não cabem): `overflow-x-auto`, o mesmo padrão que a aba de Usuários já usa hoje pra tabelas em telas estreitas — não precisa inventar solução nova.

Celular não é foco desta etapa (o pedido é Desktop + Tablet) — o layout de tablet, sendo de coluna única, já degrada razoavelmente numa tela ainda menor, mas não estou desenhando esse caso especificamente agora.

---

## 9. Componentização

| Componente | Já existe? | O que é |
|---|---|---|
| `KpiCard` | Evolui o `Kpi` atual (`admin.tsx:1144`) | título, valor, ícone, e agora também delta vs. período anterior (opcional) |
| `FilterBar` | Une `DateRangeBar` + `StoreFilter` (já existem) + os dois novos (vendedor, comparação) | uma barra única em vez de dois blocos soltos |
| `ChartCard` | Novo invólucro em cima do padrão de gráfico que já existe | título + seletor de métrica (quando aplicável) + gráfico + link "ver como tabela" (acessibilidade) |
| `RankingCard` | Generaliza a tabela de ranking de vendedoras que já existe | funciona tanto para lojas quanto para vendedoras, ordenado pela métrica escolhida |
| `AlertBanner` | Novo | severidade, ícone, mensagem, link de ação |
| `LiveStrip` | Novo | fila agora / em pausa agora / atendendo agora, com o "atualizado há Xs" |
| `InsightCard` | Novo (placeholder por enquanto) | a área de IA da seção 7 |
| `EmptyState` | Já existe como padrão de texto (ex.: "Nenhum usuário cadastrado") | reaproveitar a mesma voz em qualquer card sem dado no período |

---

## 10. Plano de implementação (commits pequenos, cada um validável sozinho)

1. **Extrair infraestrutura compartilhada** — `Kpi`, `DateRangeBar`, `StoreFilter` viram componentes/hooks mais genéricos, sem mudar nada visualmente. Validação: a tela atual continua idêntica.
2. **Hook central de métricas do período** (faturamento, ticket médio, conversão, atendimentos). Validação: comparar os números com o que `attendance_summary` (IA) já calcula pro mesmo período — devem bater.
3. **Nova fileira de KPIs (4 cards)** substituindo a atual. Validação visual + conferência manual dos números.
4. **Filtro de vendedor + interruptor de comparação de período**, com os deltas nos KPIs. Validação: ligar/desligar o interruptor, comparar números com cálculo manual de um período conhecido.
5. **Gráfico de tendência com seletor de métrica**, substituindo o gráfico de linha por hora atual. Validação: virar entre as 3 métricas, checar granularidade hora/dia conforme o período.
6. **Gráfico de ranking de lojas** (novo). Validação: comparar com a soma manual por loja.
7. **Faixa "Ao vivo"** com polling de 30s. Validação: abrir o kiosk de uma loja em outra aba, mudar status de uma vendedora, confirmar que aparece no Dashboard dentro de 30s.
8. **Rankings reutilizáveis** (lojas e vendedoras no mesmo componente). Validação: números batem com o ranking atual.
9. **Motivos de não-venda como lista compacta** (não mais gráfico full-size). Validação visual.
10. **Sistema de alertas** — uma regra por commit, começando pelas mais simples de verificar (loja sem movimento, nenhuma venda há X min) e indo até as que precisam de comparação entre períodos (conversão caiu). Validação: forçar manualmente a condição (ex.: pausar todos os atendimentos de uma loja de teste) e confirmar que o alerta aparece.
11. **Área de IA (placeholder)**. Validação visual, sem lógica.
12. **Responsividade tablet** — ajustes de grid por cima do que já foi construído nos commits anteriores.
13. **Remoção do conteúdo antigo que virou redundante** (tabela crua de histórico de não-vendas, detalhamento de não-vendas por vendedora) — só depois que os itens acima já cobrem esse valor de outra forma, e só se, na revisão, ficar confirmado que ninguém vai sentir falta na aba principal (o conteúdo continua acessível via "Por vendedora"/"Motivos").

---

## Pontos em aberto para sua decisão antes de eu implementar

1. **"Gerente" deveria abrir o Dashboard já filtrado na própria loja por padrão?** Hoje nenhuma tela faz isso automaticamente — seria a primeira vez. Recomendo que sim, mas é uma decisão de produto, não técnica.
2. **Limiares dos alertas** (5 atendimentos simultâneos, 60/90 minutos sem venda/movimento, 10 pontos de queda de conversão) são meus palpites iniciais — provavelmente precisam ser calibrados com dado real de uma ou duas lojas depois de implementados, não adivinhados agora.
3. **Horário comercial fixo para os alertas de "sem movimento"** — proponho um horário global configurável (ex. 9h–20h) em vez de esperar uma migration nova em `stores`. Confirma que serve por agora?
4. **"Grupo de lojas"** fica fora desta etapa por falta de coluna no schema — ok deixar como item de uma etapa futura?
