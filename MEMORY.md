# MEMORY

Decisions, tradeoffs, and learnings during development. Most-recent-first within sections.

## Scoring simplified to 5 rules (dropped silent_high_value)

Removed the `silent_high_value` rule (binary +5: amount>10k, overdue>30d, amountPaid=0) to simplify
the model. Now 5 additive rules (max 95): balance_at_risk(30), aging(20), chronicity(20),
ent_first_late(15), boleto_stuck(10). Removing it changes persisted scores, so re-ran `npm run db:seed`
(child tables were empty — safe) to recompute all 8000. New distribution: 23 critical / 89 high /
640 medium, max 75 (was 24/94/634, max 79). Rule metadata centralized in `src/lib/risk-rules.ts`
(drives the read-only "Regras" popover top-right of `/invoices` and the detail labels — replaced the
duplicated `RULE_LABELS` in `invoice-sheet.tsx` and `invoices/[id]/page.tsx`). Tier thresholds left
as-is (not recalibrated). `prisma/recompute-risk.ts` is the recompute path if child tables ever hold
data and a re-seed would be destructive.

## Day 5 — AI agent decisions

### Manual tool-use loop, non-streaming JSON response (not SSE)

Agent = Claude API + tool use with a **manual agentic loop** (`src/lib/agent/loop.ts`, `runAgent`) — not Managed Agents — because we host compute and need human approval gates. Model `claude-opus-4-8` in a constant (`AGENT_MODEL` in `agent/config.ts`); 1-line swap to `claude-sonnet-4-6`. Request shape kept minimal (model, max_tokens, system+`cache_control`, tools, messages) — no `thinking`/`output_config`/`effort`, to avoid SDK-0.100/model mismatch. The route `/api/agent/chat` returns **plain JSON `{text, plans[]}`**, not an SSE stream — simpler and robust; the chat shows a "pensando…" state then the answer. Token-streaming can be added later. Verified the live call shape + the full tool_result→end_turn threading against opus-4-8 with two throwaway SDK smokes (both green) before trusting the loop.

### Tools in one module + runTool dispatch (not a separate registry.ts)

`src/lib/agent/tools.ts` holds `TOOL_DEFS` (hand-written JSON schemas) + `runTool(name, input, sessionId)` dispatcher. Read tools (`searchInvoices`, `getInvoice`, `getPortfolioStats`, `getTopRisk`) reuse Day-4 queries. Direct low-risk writes (`addNote`, `scheduleFollowUp`) reuse the Day-4 actions passing `ctx={origin:"agent",actor:"agent"}` (the actions were refactored to take an optional `WriteCtx`, default analyst). One gated tool `proposeActions(summary, steps)` covers all batch/financial/destructive work — it only writes an `AgentPlan(pending)` and returns the plan id; it never mutates domain data.

### Human-in-the-loop: agent proposes, analyst confirms

`proposeActions` → `AgentPlan` row (typed `steps` validated by `planStepsSchema` in `agent/plan-steps.ts`, a prisma-free discriminated union: status | note | followup | writeoff | agreement). The chat UI renders a `PlanCard` with Confirmar/Rejeitar. `confirmPlan(planId)` (`actions/agent-plan.ts`) executes **every step in one `prisma.$transaction`** — any invalid step rolls back the whole plan (proven by test) — emitting one agent-attributed `AuditEvent` per step (payload references `planId`), then sets the plan `executed`. `rejectPlan` just marks `rejected`. The model is structurally unable to execute batch/destructive actions directly; only the human's confirm click runs `confirmPlan`. write_off and payment agreements always go through this gate.

## Agente v2 — auth, chats por usuário, mutações 100% gated, gráficos, streaming

### Auth via Supabase Auth (@supabase/ssr) — antes era pulado, agora é requisito
Email/senha. `lib/supabase/server.ts` (createServerClient + `cookies()` async) e `client.ts` (browser). `src/proxy.ts` (Next 16 renomeou middleware→proxy, runtime nodejs) refaz a sessão por request e protege rotas: deslogado → `/login`; em `/api/*` retorna 401 JSON (não redirect, pra fetch não pegar HTML). `/login` + `login-form.tsx` (signIn/signUp), `/auth/signout` (route POST). `layout.tsx` virou async: só renderiza sidebar+main se houver `getUser()`; senão só children (tela de login). Sidebar mostra email + Sair.
**PASSO MANUAL (Supabase dashboard):** habilitar provider Email/Password e, pra dev, desligar "Confirm email" — senão signup não cria sessão na hora.
Carteira (invoices/customers) é **compartilhada** entre usuários; só os chats são privados.

### Chats persistidos por usuário, cap 5
Modelos `Chat` + `ChatMessage` (aplicados via MCP `apply_migration`, RLS on). `lib/queries/chats.ts` deriva `userId` da sessão (`getUser()`, nunca de param) e escopa tudo; `createChat` recusa o 6º (`MAX_CHATS=5`). `AgentPlan.sessionId` = chatId. `ChatMessage.data` (jsonb) guarda plans/charts/trace pra re-render no reload; `getPlanStatuses` reconcilia status dos planos ao carregar.

### Toda mutação é gated por modal (sem escrita direta)
Removidas as write-tools diretas do agente. Tools agora: 4 de leitura + `showChart` + `proposeActions`. QUALQUER mudança (até 1 nota) → `proposeActions` → `AgentPlan(pending)` → UI mostra `PlanModal` (card "Revisar" → Dialog lista os passos com **X por linha** pra remover) → `confirmPlan(planId, keptIndexes)` executa **só os mantidos** numa transação e audita só eles. Segurança: o modelo é estruturalmente incapaz de executar; só o clique do humano roda `confirmPlan`.

### Gráficos + trace + streaming
`showChart({type})` sinaliza um gráfico; o `loop` coleta `{type,data}` (fora do que o modelo vê) e a UI renderiza `aging`/`ar_trend` (reusa dashboard), `risk_tiers` (`TierChart`), `top_risk` (`TopRiskChart`). `ToolTrace` = expandível com as ferramentas usadas. **Streaming SSE:** `loop.ts` virou `streamAgent` (async generator, usa `client.messages.stream`); a rota `/api/agent/chat` emite `data:` events de texto e um `done` final com `{plans,charts,trace}`, persistindo as mensagens. `runAgent` (wrapper não-stream) mantido p/ testes/fallback. Respostas do chat renderizam markdown (`react-markdown`+`remark-gfm`); IDs `INV-xxx` viram links.

## Testing decisions

### Vitest, unit + DB-integration with TEST-* fixtures (no E2E yet)

Backfilled a regression suite over existing code (not strict red-green — code predates tests; true
TDD applies from the agent/Day 5 onward). Stack: Vitest + `vite-tsconfig-paths`. **Unit** tests
(`*.test.ts`) cover all pure logic (risk scoring rules + tiers, aging buckets, agreement schedule
cents math, text normalization, status state machine) — 49 tests, ~7s, no DB. **Integration**
(`*.integration.test.ts`) exercises the Server Actions against the real Supabase DB using dedicated
`TEST-*` rows created/cleaned per test, so the 8000 seeds stay intact (verified 0 residue). `next/cache`
is mocked. Integration is slow (~13s/test, ~2min total) because each query is a remote pooler
round-trip — hence the `test:unit` fast lane for the daily loop. **E2E (Playwright) deliberately
skipped for now** — it's what would catch client-side bugs like the `appToday`-in-client crash, but
it competes with finishing the agent; revisit on Day 6 if time allows.

### Bug class the tests don't cover: server-only code in client components

The `appToday()`-in-a-client-component crash (reads `process.env.APP_TODAY`, undefined in the browser)
slipped past typecheck, lint, unit tests, AND server-route smoke curls — it only fires when a client
component mounts in a real browser. Mitigation applied: pass server-derived values (like `today`) as
props into client components instead of reading env there. Until E2E exists, the manual browser click
is the only thing that catches this class.

## Day 4 — CRUD + audit + drawer decisions

### Detail = lateral Sheet, not a modal or page nav

Clicar numa linha abre um `Sheet` lateral (`src/components/ui/sheet.tsx`, hand-rolled — base-nova
não tem sheet) sobre a lista; a fila de triagem continua scrollável atrás. A página
`/invoices/[id]` permanece como fallback de deep-link/F5. O Sheet (`invoice-sheet.tsx`) busca o
detalhe via `fetchInvoiceDetail` (server action em `lib/actions/invoice-detail.ts` — precisa ser
`"use server"` pra ser chamável do client) ao abrir e re-busca após cada mutação. A lista atrás
atualiza sozinha porque as actions chamam `revalidatePath("/invoices")` e o estado de filtro do
`InvoiceTable` client sobrevive (mesma posição na árvore).

### Escrita = Server Actions com audit na mesma transação

`lib/actions/invoices.ts` (`"use server"`): `updateInvoiceStatus`, `addNote`, `scheduleFollowUp`,
`createPaymentAgreement`. Cada uma valida com zod v4, roda em `prisma.$transaction`, e emite
`AuditEvent` via `recordAudit(tx, …)` (`lib/audit.ts`) dentro da mesma tx — evento nunca existe sem
a mutação. Actor fixo `"analyst"`, origin `"analyst"` (agente usará `"agent"` no Day 5). Retorno
`{ok:true}|{ok:false,error}`.

### status→paid também quita o financeiro

`updateInvoiceStatus(to:"paid")` seta `paymentStatus=paid, amountPaid=amount, paidDate=appToday()`
e recomputa o risco (`recomputeInvoiceRisk` em `lib/risk-recompute.ts`) → recoverable 0 → score 0.
Transições validadas por `canTransition` (state machine de `invoice-status.ts`); inválida retorna
erro sem gravar nada.

### Acordo: cents inteiros num módulo prisma-free

`lib/agreement.ts` `buildSchedule()` calcula o cronograma em **cents inteiros** (sem float drift),
última parcela absorve o arredondamento. É prisma-free de propósito: o preview do modal roda no
client (importar Prisma no bundle do browser quebra o Turbopack — ver gotcha). O server converte
`amountCents` → `Prisma.Decimal(cents)/100` ao gravar as `AgreementInstallment`.

## UX / performance decisions

### Invoice list filters client-side in memory (instant), scope is the only server round-trip

Case demands "responsive and instant". Server-side pagination re-queried the DB on every slider tick / chip toggle → lag. Reworked to load the whole working set once per scope (`fetchInvoiceDataset` in `src/lib/queries/invoices.ts`) and do all filtering, sorting, search, and pagination in the client `InvoiceTable` component — zero network after load. `unpaid` / `overdue` load the full set (~1.9k / fewer rows). `all` is capped at `DATASET_CAP = 1500` highest-risk rows (shows a banner). Decimals→numbers, dates→ISO at the RSC boundary so the dataset serializes cleanly. Trade-off accepted: filters left the URL (no shareable/bookmark state, no back-button filter history); scope stays in the URL and is the only thing that triggers a server refetch.

### Every write must refresh the aggregated lists, not just the detail panel

Recurring expectation: create/edit/delete updates the visible list instantly, including the list on the page currently open. The detail panels update optimistically (local state + list-cache patch for the invoices table), but the dedicated activity pages (`/notes`, `/followups`, `/agreements`) and the dashboard read straight from the DB. Two-part invariant: (1) every mutating server action calls `revalidate()` which now covers `/`, `/invoices`, `/customers`, `/notes`, `/followups`, `/agreements`; (2) both detail panels call `router.refresh()` in `reconcile` (onSuccess of every mutation) so the current route's server components re-run and the list behind the open Sheet updates in place — `router.refresh()` preserves client state, so the Sheet stays open. When adding a new write path, wire both or the list goes stale.

### Risk slider commits on release, not on every tick

`riskDraft` follows the thumb live (shown number updates), but the applied `minRisk` only updates on `onMouseUp`/`onTouchEnd`/`onKeyUp`. "Select first, then crop."

### Filter chips moved into click-to-open dropdowns

`FilterDropdown` (`src/components/filter-dropdown.tsx`): opens on click (not hover), closes on mouse-leave, shows label + count badge + chevron (down=closed, up=open), ~150ms reveal animation. Hover preview ≈ 50% of the selected (primary/teal) color via `hover:bg-primary/5 hover:text-primary`.

### Search is accent- and case-insensitive

`normalizeText` in `src/lib/text.ts`: NFD normalize → strip `\p{Diacritic}` → lowercase. "ç"→"c", "São"="sao"="SAO". Applied to both query and the `customerName + id + customerId` haystack client-side.

## Gotchas

### Never import a runtime value from a prisma-importing module into a client component

A `"use client"` component importing a *value* (e.g. `PAGE_SIZE`) from `lib/queries/invoices.ts` pulled `@/lib/prisma` → `@prisma/client` into the browser bundle. Turbopack failed: "the chunking context does not support external modules (request: node:module)". Pure `import type {...}` is erased and is safe; a value import drags the whole module graph. Fix pattern: keep shared constants/types in a prisma-free module (`lib/queries/invoice-types.ts`) and import values from there on the client; the server query module re-exports them.

## Environment gotchas

### Stray `~/package.json` + `~/package-lock.json` froze the dev machine

Empty `{}` package.json and an empty lockfile sat in `$HOME` (leftover from an accidental `npm` run). Next/Turbopack walks up the tree to infer the workspace root, hit `~/package.json`, and concluded HOME was the workspace → file-watcher scanned the entire home folder → CPU pinned, `next dev` never readied, whole UI froze. Fixed by moving both files to `/tmp` and clearing the poisoned `.next` cache. The `turbopack: { root }` pin in `next.config.ts` only silenced the warning, not the underlying scan. **Do not auto-spawn `npm run dev` in the background to "verify"** — it was the freeze trigger; let the user run the server in their own terminal.

## Stack decisions

### Tremor was evaluated and rejected — using Recharts directly

Tremor 3.18 pins `react@^18` as a peer dep. Next.js 16 ships React 19. `npm install` failed with `ERESOLVE`. Rather than force `--legacy-peer-deps` and risk runtime issues, dropped Tremor and went with Recharts directly. Recharts is also what shadcn `chart` component is built on, so we can layer shadcn chart wrappers on top later for consistent theming.

### shadcn `base-nova` preset (uses @base-ui/react, not Radix)

`shadcn init -d` selected the `base-nova` preset which uses `@base-ui/react` instead of Radix Primitives. Newer default. Keeps things lighter and is what shadcn recommends going forward. No code-side action needed — components have identical API.

### Prisma 6 with new `prisma-client` generator

Prisma 6 introduced a new generator (`prisma-client` instead of `prisma-client-js`) with `output` pointing at a project-local path (`src/generated/prisma`). Imports go through `@/generated/prisma`. Migration command is unchanged (`prisma migrate dev`). Seed is configured via the `prisma.seed` field in `package.json` (`tsx prisma/seed.ts`).

### Two-axis invoice state: `status` (workflow) + `paymentStatus` (financial)

The PDF state machine (`open → in_negotiation → agreement_signed → paid`, plus `written_off`/`disputed`) does not model partial payments. The dataset has ~1093 invoices (13%) where `amountPaid > 0 AND amountPaid < amount`. Adding a `partially_paid` value to the workflow enum would conflate two orthogonal concerns and break the state graph defined in the spec.

Resolution: keep `status` exactly as the spec defines it, add a separate `paymentStatus` enum (`unpaid | partial | paid`) derived from `amountPaid`/`amount`. The two axes combine freely: e.g. `status=in_negotiation` with `paymentStatus=partial` describes a renegotiation in progress where the customer already paid some of the original.

Rejected alternatives:
- `isPaid` boolean alongside `paymentStatus`: redundant, risk of drift, dropped.
- Single status enum with `partially_paid` value: conflates workflow with financial state.

### `APP_TODAY` env var instead of `new Date()`

The dataset spans Jan-May 2026. Real wall-clock time is later, which would push every invoice into the 90+ aging bucket and erase the differentiation that drives the prioritization rules. Fixed `APP_TODAY=2026-04-01` so aging buckets are meaningful for demo and evaluation. Documented in README.

### Risk scoring reworked after seeing real data distribution (v2)

The first scoring draft was demonstrably broken once seeded (max score 55, zero high-risk, 7041/8000 at score 0). Root causes found by querying the seeded data:

1. **Credit utilization rule was dead.** `openBalanceSnapshot / creditLimit > 0.8` matched only **2 of 1871** non-paid invoices (max utilization 0.94, only 7 above 0.5). `openBalanceSnapshot` is near-zero relative to `creditLimit` across the dataset. A wasted 20-point axis. **Rejected and removed.**
2. **Rule 1 was multiplicative** (`recoverable × chronicity`). When `previousLate=0` the whole term zeroed, so a R$156k fresh-overdue invoice scored 0. Made components **additive** instead.
3. **Aging (days overdue) was not a factor at all** — a glaring gap for a collections tool. Added it.

v2 model (additive, 0-100), calibrated to observed percentiles (overdue balance p90 ~R$11k / p95 ~R$20k / tail to R$156k; aging max 75 days, p90 57; previousLate 0..9):

- `balance_at_risk` (0-30): `min(recoverable / 25000, 1) * 30`
- `aging` (0-20): `min(daysOverdue / 60, 1) * 20`, overdue only
- `chronicity` (0-20): `min(previousLate / 5, 1) * 20`
- `ent_first_late` (binary 15): ENT, previousLate=0, overdue
- `boleto_stuck` (binary 10): BOLETO + attempts>2
- `silent_high_value` (binary 5): amount>10k, overdue>30, amountPaid=0

Guard: `recoverable <= 0` short-circuits to score 0 — paid invoices never enter the ranking even for chronic customers (chronicity would otherwise fire on settled invoices).

No invoice reaches 80+ because the worst-case factor combination (big balance AND old AND chronic AND boleto-stuck) doesn't co-occur in the data; max observed is 79. This is honest — documented in README.

Tier thresholds calibrated to the resulting distribution (not round defaults): critical>=55 (~24 invoices), high>=40 (~94), medium>=20 (~634), low>0 (~1081). Defined in `riskTier()`.

### Risk score persisted, recomputed on writes

Computing 5 rules across 8000 invoices on every SELECT is wasteful. Persisting `riskScore` and `riskFactors` (jsonb of contributing rules) in the `Invoice` row keeps reads fast and indexes (`@@index([riskScore])`) usable for sorting/filtering. Risk is recomputed in any server action that mutates fields the rules depend on (status changes, payment updates, etc.).

### Polymorphic notes/follow-ups/audit-events via (entityType, entityId)

Notes can attach to either a customer or an invoice (spec requirement). Same for follow-ups and audit events. Two parallel tables per entity would duplicate schema. Single table with `entityType: 'invoice' | 'customer'` + `entityId` keeps things simple at the cost of losing strict referential integrity (no FK). Acceptable for this prototype — referential integrity is enforced at the application layer.

**Scope decision (both invoice + customer stay valid).** Notes and follow-ups intentionally support both scopes — collapsing to one is lossy either way: an invoice-only model has nowhere to record durable customer context ("em recuperação judicial, não cobrar agressivo"), and a customer-only model loses the link to *which* of N overdue invoices a promise refers to. **Agreements stay invoice-only** (`PaymentAgreement.originalInvoiceId`): an agreement restructures one specific debt; multi-invoice "umbrella" agreements are real but out of scope. Chosen UX is **silos + a `ScopeBadge` (Fatura/Cliente) in the aggregated views (activity page, agent chat lists) — no cross-entity inheritance**. Within a detail panel scope is unambiguous (one bucket); the badge only matters where both kinds mix. Deliberately *not* implemented: a note on a customer is NOT surfaced when working an invoice of that customer. Accepted gap for the case.

### Hardcoded `analyst-default` actor (no auth)

The optional bonus includes auth. ROI is low for this case — auth doesn't change the prioritization quality, agent quality, or CRUD correctness. All audit entries use `actor: 'analyst-default'` until/unless auth is added. The schema already accommodates real user IDs without migration.

## Reports + Automations (final feature)

### One AutomationSpec drives everything (not a tool per combination)

The tricky part was the combinatorial explosion (causes × effects × schedules). Resolved with a single `AutomationSpec` (`src/lib/automation/automation-spec.ts`): `{ target, condition, effect, schedule }` with discriminated-union effect. The same schema validates the agent tool input, the manual form, and the engine — combinations are *data* (enums + params), not code per combination. So **one** `proposeAutomation` agent tool, one form, one engine. The engine branches in just two ways: per-entity effects (note/followup/status, iterate matches) vs portfolio (report_email, runs once).

### Scheduling: wall-clock cadence, APP_TODAY conditions, dedup, manual demo path

Data is frozen at `APP_TODAY`, so a real daily cron would rewrite the same notes forever. Decision: schedule advances on the real calendar (`computeNextRun`), but conditions are evaluated against `APP_TODAY`. Dedup keys on `AuditEvent.payload.automationId` since `lastRunAt`, so re-clicking "Executar agora" never duplicates. The demo path is the per-rule "Executar agora" button; `GET /api/cron/automations` (Vercel Cron, `CRON_SECRET`) is the real unattended path.

### Chat creation reuses the plan-card HITL flow

Rather than thread a new proposal-card type through the streaming/persistence pipeline, `proposeAutomation` builds an `AgentPlan` with a new `automation` plan step. `PlanModal` already renders steps via `describeStep`, and `confirmPlan`/`execStep` execute them — so chat-created automations get the existing confirm modal for free. **Why:** keeps the human-in-the-loop guarantee with zero new plumbing.

### PDF via @react-pdf/renderer; email via Resend

`@react-pdf/renderer` installed clean under React 19. One `ReportDocument` serves browser (`pdf().toBlob()` for download/print) and server (`renderToBuffer` for the email attachment) — see `reportElement` helper for the shared typed cast. Report-email recipient is `getUser().email`; **Resend without a verified domain only delivers to the account owner's email**, so the Supabase login email must match the Resend account email (or verify a domain).

### Migration applied via Supabase MCP (migrate dev would reset)

`AutomationRule`/`AutomationRun` were added with `mcp__supabase__apply_migration` (+ `prisma generate`), NOT `prisma migrate dev` — the latter detected drift (Chat/ChatMessage were also added via MCP, not in migration history) and wanted to **reset the DB**, which would wipe the 8000 invoices. RLS enabled, no policies (consistent with the other tables).

## Process / scope decisions

### 4-day compressed schedule

Originally planned 6 days at 4h each. Days 1-2 were not used. Remaining 4 days (today + 3) compress the original plan:
- Day 3 (today): setup, schema, seed, prioritization, invoice list.
- Day 4: dashboard, CRUD, audit log, drawer details, agent read tools.
- Day 5: agent write tools, batch confirmation flow, customer view.
- Day 6: polish, deploy to Vercel, README, demo video.

Cut targets if behind: customer view (drill-down) and any feedback/human-in-the-loop refinements come out first. Floor is: list with prioritization, CRUD persisting, agent with at least one write tool gated by confirmation.

## Database provisioning

### Schema applied via Supabase MCP, registered with Prisma after the fact

Supabase project ref `brzcqxenysjatedpzxvu`, URL `https://brzcqxenysjatedpzxvu.supabase.co`. The schema was applied to the remote DB through the Supabase MCP `apply_migration` tool (two migrations: `init` for the DDL, `enable_rls` for RLS), not through `prisma migrate deploy`. The local Prisma migration folder `prisma/migrations/20260529000000_init` holds the same DDL and was registered as already-applied via `prisma migrate resolve --applied 20260529000000_init` so Prisma's `_prisma_migrations` history is consistent. Future schema changes can go through normal `prisma migrate dev` (direct connection works — see below).

RLS is enabled on all 8 tables with **no policies** (INFO-level advisor warning, expected). Prisma connects as the `postgres` role which bypasses RLS, so the app is unaffected. This is defense-in-depth for any future anon-key client access.

### Connection uses the IPv4 shared poolers (NOT the direct host)

The direct host `db.brzcqxenysjatedpzxvu.supabase.co` is **IPv6-only**. The dev machine lost its IPv6 route (network change), so direct connections fail with "Can't reach database server". Switched to Supabase's shared poolers (IPv4), region **us-east-1**, prefix **aws-1**:

- `DATABASE_URL` = transaction pooler `aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true` — app runtime. `pgbouncer=true` disables prepared statements (required for transaction mode).
- `DIRECT_URL` = session pooler `...:5432/postgres` — migrations/CLI (transaction pooler doesn't support the migration engine).

`schema.prisma` datasource has both `url` + `directUrl`. `prisma.config.ts` `datasource.url` points at `DIRECT_URL` so CLI commands use the session pooler. Both poolers are IPv4 → also the correct setup for Vercel. Env vars live in `.env` (Prisma CLI reads `.env`, not `.env.local`).

### Seed uses delete-then-createMany in chunks, not per-row upsert

Per-row `upsert` over the remote connection was ~15 min for 8000 rows. Rewrote `prisma/seed.ts` to `deleteMany` all tables (children first for FKs) then `createMany` in chunks of 1000. Full refresh, idempotent, runs in seconds. Risk scores are computed in-process during the build of the invoice array.

## Known issues / risks

### CSV has no customer contact info

The PDF example asks for "follow-up by phone tomorrow at 10am" but the dataset has no phone or email per customer. The `FollowUp` model records the channel and body, but the app does not actually send anything. README will explain this is a UI placeholder — real integration would plug into a comms system.

### `previousLateInvoices` is a historical snapshot, not live

Field is whatever the upstream billing system reported at issue time. It cannot be recomputed from the dataset alone (we'd need a full history). Treated as input data, never re-derived.

### `openBalance` snapshot vs current

`openBalanceSnapshot` is at invoice issue time. The current open balance for a customer is derivable from the live data (sum of `amount - amountPaid` for non-paid invoices). Customer view will show "current" recomputed alongside the historical snapshot.
