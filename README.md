# Paggo Collections Tool

Ferramenta interna para um(a) analista de cobrança B2B triar e agir sobre faturas em atraso.
A partir de ~8.000 faturas cruas (sem labels), o app deriva prioridade por regras, deixa o
analista atualizar status / notas / acordos / follow-ups com audit log, e inclui um agente de IA
que responde perguntas sobre a carteira e executa ações sob confirmação humana. \(^-^)/

- **App publicado:** https://paggo-case-iota.vercel.app
- **Repositório:** https://github.com/gabrielcoffee/paggo_case

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind v4 + shadcn/ui · PostgreSQL
(Supabase) · Prisma 6 · Anthropic Claude (tool use) · Recharts · Vitest.

## Setup

Pré-requisitos: Node 20+, um banco Postgres (Supabase) e uma chave Anthropic.

```bash
npm install
```

Crie `.env` com:

```bash
DATABASE_URL=            # Postgres runtime — transaction pooler (pgbouncer=true)
DIRECT_URL=             # Postgres migrations — session pooler (porta 5432)
ANTHROPIC_API_KEY=      # chave da API Claude (o agente)
APP_TODAY=2026-04-01    # data de referência fixa para o aging (ver decisões)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Banco + dados:

```bash
npm run db:generate     # gera o Prisma Client
npm run db:migrate      # aplica o schema
npm run db:seed         # importa o CSV + pré-computa o risco (8000 faturas, idempotente)
```

Auth (Supabase dashboard): habilite o provider **Email/Password**; em dev, desligue
"Confirm email" para o signup já criar sessão.

Rodar:

```bash
npm run dev             # http://localhost:3000
npm run test:unit       # lógica pura (~1.5s, sem DB)
npm test                # inclui integração contra o DB
```

## Regras de priorização

Os dados vêm sem rótulo de prioridade. Cada fatura recebe um **risk score 0–100**, soma de 5
regras aditivas. Pontuação alta = "aja primeiro". A escolha por score (não flags binárias) é
proposital: ordena uma fila de triagem em vez de só marcar sim/não. Todas calibradas contra a
distribuição real do dataset (percentis de saldo, atraso, reincidência).

| Regra | Pontos | Por quê |
|---|---|---|
| `balance_at_risk` | 0–30 | Saldo recuperável (linear até R$25k). Dinheiro recuperável é o objetivo direto da cobrança — pesa mais que tudo. |
| `aging` | 0–20 | Dias de atraso (linear até 60). Quanto mais velho, menor a chance de recuperar — sensível ao tempo. |
| `chronicity` | 0–20 | Atrasos anteriores do cliente (linear até 5). Reincidente sinaliza risco sistêmico, não deslize pontual. |
| `ent_first_late` | 15 | Enterprise atrasando **pela primeira vez**: alto valor, normalmente recuperável (provável falha operacional). Vale um toque rápido. |
| `boleto_stuck` | 10 | BOLETO com >2 tentativas: falha técnica, não falta de dinheiro. Ganho fácil — oferecer PIX. |

**Guard:** saldo recuperável ≤ 0 zera o score — fatura paga nunca entra na fila, mesmo de
cliente crônico.

**Tiers** (calibrados à distribuição, não a defaults redondos): `critical ≥55` · `high ≥40` ·
`medium ≥20` · `low ≥1`. Score máximo observado ~75 — a pior combinação de fatores não co-ocorre
nos dados, e isso é honesto (não inflamos a escala). Regras descartadas na calibração (utilização
de crédito morta, termo multiplicativo) estão documentadas em `MEMORY.md`.

O score é **persistido** por fatura (com a composição em `riskFactors`) e **recomputado** em
qualquer write que mude um input das regras. A composição aparece no detalhe da fatura, e há um
popover "Regras" read-only na lista. (•_•)

## Tools do agente

Loop manual de tool use (Claude API). Leitura executa direto; qualquer mutação passa por um plano
que o analista confirma.

| Tool | Tipo | O que faz |
|---|---|---|
| `searchInvoices` | leitura | Busca faturas por filtros (texto, escopo, segmento, status, risco mín., atrasos, valor em aberto). |
| `getInvoice` | leitura | Detalhe completo de uma fatura: campos, composição do risco, notas, follow-ups, acordos, audit. |
| `getTopRisk` | leitura | As N faturas de maior risco. |
| `getPortfolioStats` | leitura | KPIs da carteira: AR total/vencido, DSO, contagem por tier e por status. |
| `showChart` | leitura | Renderiza um gráfico na resposta: `aging`, `ar_trend`, `risk_tiers` ou `top_risk`. |
| `proposeActions` | **gated** | Propõe um plano (status, nota, follow-up, write-off, acordo) para o analista confirmar. **Nunca executa** — cria um plano pendente. |

**Human-in-the-loop:** o agente é estruturalmente incapaz de mutar dados. Toda escrita — até uma
nota — vira um `AgentPlan(pending)`; a UI mostra um modal com os passos (removíveis linha a linha),
e só o clique do analista em "Confirmar" roda `confirmPlan`, executando os passos mantidos numa
única transação. Write-offs, acordos e ações em lote sempre passam por esse portão.

**Segurança:** as tools exigem IDs concretos — o agente nunca inventa IDs ou valores; se faltar
dado, ele busca ou pergunta. Toda ação do agente entra no audit log rotulada `origin=agent`.

Exemplo ponta a ponta (do enunciado): *"Para toda fatura em aberto acima de R$5.000 de clientes
com 3+ atrasos, marque como in_negotiation, adicione a nota 'auto-flagged: chronic late payer' e
agende follow-up por telefone amanhã às 10h. Mostre antes de executar."* → o agente busca, monta o
plano, a UI mostra a prévia, e o analista confirma.

## Decisões de design

- **Estado em dois eixos.** `status` é a máquina de estados do enunciado
  (`open → in_negotiation → agreement_signed → paid`, com `written_off`/`disputed` terminais;
  transições inválidas são rejeitadas). `paymentStatus` (`unpaid|partial|paid`) é um eixo
  financeiro à parte, porque 13% das faturas têm pagamento parcial que o workflow do enunciado não
  modela. Os dois combinam livremente.

- **Audit log como produto de primeira classe.** Todo write (analista ou agente) emite um
  `AuditEvent` na **mesma transação** — evento nunca existe sem a mutação. Eventos são rotulados
  por origem e aparecem no detalhe da fatura.

- **`APP_TODAY` fixo.** O dataset vai de jan a mai/2026; usar o relógio real jogaria tudo no bucket
  90+ e apagaria a diferenciação que move as regras. Data de referência fixa mantém o aging
  significativo.

- **Lista filtra no cliente.** O conjunto de trabalho carrega uma vez por escopo; filtros, ordenação
  e busca rodam em memória — zero round-trip por toque de slider ou chip. Resposta instantânea.

- **Auth + chats por usuário.** Supabase Auth (email/senha). A carteira é compartilhada; só os chats
  do agente são privados por usuário, persistidos (com plans/gráficos) e reidratados no reload.

- **Acordos em centavos inteiros.** O cronograma de parcelas é calculado em inteiros (sem drift de
  float); a última parcela absorve o arredondamento.

Tradeoffs e alternativas rejeitadas (Tremor, registry separado, SSE vs JSON, etc.) estão em
`MEMORY.md`; arquitetura estável em `CLAUDE.md`.

## Limitações conhecidas

- O CSV não tem contato do cliente, então follow-up "por telefone" é registrado mas não dispara nada
  real — é um placeholder de UI; integração real plugaria num sistema de comunicação.
- `previousLateInvoices` é um snapshot do billing na emissão, tratado como input (não re-derivado).
