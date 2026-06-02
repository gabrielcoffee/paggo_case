# Expresso Collections

Cockpit de cobrança B2B para um(a) analista triar e agir sobre faturas em atraso.
A partir de ~8.000 faturas cruas (sem rótulo de prioridade), o app deriva prioridade por regras,
deixa o analista atualizar status / notas / acordos / follow-ups com audit log, gera relatórios em
PDF, executa **automações agendadas**, e inclui um **agente de IA** que responde sobre a carteira e
executa ações sob confirmação humana.

- **App publicado:** https://paggo-case-iota.vercel.app
- **Repositório:** https://github.com/gabrielcoffee/paggo_case

## O que tem

- **Triagem por risco** — score 0–100 por fatura (5 regras aditivas), tiers e fila ordenada.
- **CRUD + audit** — status, notas, follow-ups e acordos; todo write emite evento de auditoria.
- **Agente de IA** — lê a carteira, propõe e executa ações sob confirmação (human-in-the-loop).
- **Relatórios PDF** — "Gerar relatório" na tela de Faturas: tipo, quantidade e colunas → baixar/imprimir.
- **Automações** — regras que conferem a carteira no horário marcado e agem sozinhas (nota, follow-up,
  mudança de status ou envio de relatório por email).

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind v4 + shadcn/ui (base-ui) · PostgreSQL
(Supabase) · Prisma 6 · Anthropic Claude (tool use) · @react-pdf/renderer · Recharts · Vitest.

## Setup

Pré-requisitos: Node 20+, um banco Postgres (Supabase) e uma chave Anthropic.

```bash
npm install
```

Crie `.env` com:

```bash
DATABASE_URL=                          # Postgres runtime — transaction pooler (pgbouncer=true)
DIRECT_URL=                            # Postgres migrations/CLI — session pooler (porta 5432)
ANTHROPIC_API_KEY=                     # chave da API Claude (o agente)
APP_TODAY=2026-04-01                   # data de referência fixa para o aging (ver decisões)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
CRON_SECRET=                           # opcional — protege GET /api/cron/automations (Vercel Cron)
```

Banco + dados:

```bash
npm run db:generate     # gera o Prisma Client
npm run db:migrate      # aplica o schema
npm run db:seed         # importa o CSV + pré-computa o risco (~8000 faturas)
```

> `db:seed` é um **reset completo para a baseline do CSV**: recria clientes + faturas (status/risco
> re-derivados do CSV) e limpa todas as tabelas de uso (notas, follow-ups, acordos, auditoria,
> agent plans, automações, chats). É idempotente.

Auth (Supabase dashboard): habilite o provider **Email/Password**; em dev, desligue "Confirm email"
para o signup já criar sessão. Google OAuth é opcional.

Rodar:

```bash
npm run dev             # http://localhost:3000
npm run test:unit       # lógica pura (~1.5s, sem DB)
npm test                # inclui integração contra o DB
```

## Regras de priorização

Os dados vêm sem rótulo de prioridade. Cada fatura recebe um **risk score 0–100**, soma de 5 regras
aditivas. Pontuação alta = "aja primeiro". A escolha por score (não flags binárias) é proposital:
ordena uma fila de triagem em vez de só marcar sim/não. Todas calibradas contra a distribuição real
do dataset (percentis de saldo, atraso, reincidência).

| Regra | Pontos | Por quê |
|---|---|---|
| `balance_at_risk` | 0–30 | Saldo recuperável (linear até R$25k). Dinheiro recuperável é o objetivo direto da cobrança — pesa mais que tudo. |
| `aging` | 0–20 | Dias de atraso (linear até 60). Quanto mais velho, menor a chance de recuperar. |
| `chronicity` | 0–20 | Atrasos anteriores do cliente (linear até 5). Reincidente sinaliza risco sistêmico. |
| `ent_first_late` | 15 | Enterprise atrasando **pela primeira vez**: alto valor, normalmente recuperável (provável falha operacional). |
| `boleto_stuck` | 10 | BOLETO com >2 tentativas: falha técnica, não falta de dinheiro. Ganho fácil — oferecer PIX. |

**Guard:** saldo recuperável ≤ 0 zera o score — fatura paga nunca entra na fila.
**Tiers:** `critical ≥55` · `high ≥40` · `medium ≥20` · `low ≥1` (calibrados à distribuição; máximo
observado ~75). O score é **persistido** por fatura (composição em `riskFactors`) e **recomputado**
em qualquer write que mude um input das regras. Há um popover "Regras de risco" read-only na lista,
onde dá pra ajustar os pesos e ver o efeito.

## Agente de IA

Loop manual de tool use (Claude API). Leitura executa direto; qualquer mutação passa por um plano que
o analista confirma. Cada usuário tem **um chat persistente** (sem lista/limite); "Resetar chat"
limpa a conversa.

| Tool | Tipo | O que faz |
|---|---|---|
| `searchInvoices`, `getInvoice`, `getTopRisk` | leitura | Busca/detalhe/top-N de faturas. |
| `getPortfolioStats`, `showChart`, `getCustomer`, … | leitura | KPIs, gráficos e demais consultas da carteira. |
| `listAutomations` | leitura | Lista as automações agendadas. |
| `proposeActions` | **gated** | Propõe um plano (status, nota, follow-up, write-off, acordo) para confirmar. |
| `proposeAutomation` | **gated** | Propõe a criação de uma automação para confirmar. |

**Human-in-the-loop:** o agente é estruturalmente incapaz de mutar dados. Toda escrita — até uma nota
ou uma automação — vira um `AgentPlan(pending)`; a UI mostra um modal com os passos (removíveis linha
a linha), e só o clique do analista em "Confirmar" roda `confirmPlan` numa única transação. Toda ação
do agente entra no audit log com `origin=agent`.

## Relatórios PDF

Botão **"Gerar relatório"** no topo de Faturas. O usuário escolhe o **tipo** (Maior risco / Maior
exposição / Vencidas críticas), a **quantidade** (5/10/15/20), e as **colunas**. O PDF é gerado com
`@react-pdf/renderer` (paginação automática, cabeçalho de tabela e rodapé repetidos) e pode ser
**baixado** ou **impresso**. O mesmo documento é renderizado no servidor (buffer) para anexar no email
das automações. `ReportConfig` é o contrato único compartilhado entre diálogo, builder e PDF.

## Automações

Na aba **Agente → Automações**. Uma automação é uma `AutomationSpec` única —
`{ alvo, condição, efeito, agenda }` — que serve ao formulário guiado, à tool do agente, à validação
e ao motor de execução; as combinações são dados, não código por combinação.

- **Gatilho:** faturas ou clientes (com filtros: segmento, risco, em aberto, dias de atraso…), ou a
  carteira inteira (para relatório). O formulário mostra **"N correspondem agora"** ao vivo.
- **Efeito:** escrever nota, agendar follow-up, mudar status (por entidade) ou **enviar relatório por
  email** (roda uma vez; envio simulado — gera o PDF mas não dispara provedor externo). Notas/follow-ups aceitam templates (`{cliente}`, `{valor_aberto}`,
  `{dias_atraso}`…).
- **Agenda:** semanal ou mensal, com data de início e horário (padrão 10h).
- **Execução:** botão **"Executar agora"** (caminho de demo) e rota `GET /api/cron/automations`
  (Vercel Cron, protegida por `CRON_SECRET`) para execução automática. A agenda corre no relógio real;
  as condições são avaliadas contra `APP_TODAY`. Um dedup por regra+entidade evita reescrever a mesma
  ação. Toda escrita entra no audit log com `origin=automation`, e cada execução grava um `AutomationRun`.

## Decisões de design

- **Estado em dois eixos.** `status` é a máquina de estados do enunciado
  (`open → in_negotiation → agreement_signed → paid`, com `written_off`/`disputed` terminais).
  `paymentStatus` (`unpaid|partial|paid`) é um eixo financeiro à parte (13% das faturas têm pagamento
  parcial que o workflow não modela).
- **Audit log como produto de primeira classe.** Todo write (analista, agente ou automação) emite um
  `AuditEvent` na **mesma transação** — evento nunca existe sem a mutação. Rotulado por origem.
- **`APP_TODAY` fixo.** O dataset vai de jan a mai/2026; usar o relógio real jogaria tudo no bucket 90+
  e apagaria a diferenciação que move as regras.
- **Lista filtra no cliente.** O conjunto de trabalho carrega uma vez por escopo; filtros, ordenação e
  busca rodam em memória — resposta instantânea, zero round-trip por toque.
- **UI otimista + menos round-trips.** Escritas (notas, follow-ups, reset de chat, criação de automação)
  refletem na tela na hora e persistem em background. O auth no layout lê a sessão do cookie (sem ida à
  rede; o proxy já validou), o chat carrega em uma única chamada, e o Recharts é lazy-loaded.
- **Um spec para automações.** Uma tool, um formulário, um motor — o spec discriminado é a fonte única
  de verdade, então adicionar uma combinação é dado, não código.
- **PDF isomórfico.** Um só `ReportDocument` serve o navegador (download/impressão) e o servidor (anexo
  de email), via um helper que centraliza o cast de tipos do `@react-pdf`.
- **Acordos em centavos inteiros.** O cronograma é calculado em inteiros (sem drift de float); a última
  parcela absorve o arredondamento.

Tradeoffs e alternativas rejeitadas estão em `MEMORY.md`; a arquitetura estável em `CLAUDE.md`.

## Limitações conhecidas

- **Sem contato do cliente no CSV.** Follow-up "por telefone" é registrado mas não dispara nada real —
  placeholder de UI; integração real plugaria num sistema de comunicação.
- **Envio de email é simulado.** O efeito "report_email" gera o PDF e registra a execução, mas não
  dispara provedor externo (sem dependência/chave). Trocar `emailReport` por um provedor real
  (ex.: Resend) liga o envio de verdade.
- **Agenda vs. dados congelados.** As automações correm no relógio real, mas avaliam as condições contra
  `APP_TODAY` (dataset fixo). O caminho demonstrável é o botão "Executar agora".
- **Migrações via Supabase MCP.** O histórico do Prisma está dessincronizado do banco remoto; mudanças
  de schema são aplicadas via MCP (`apply_migration`) + `prisma generate`, não `prisma migrate dev`
  (que tentaria resetar o banco). Ver `MEMORY.md`.
