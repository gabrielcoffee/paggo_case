# PLAN — Paggo Collections Tool

Persistent build plan. Survives chat resets. Update the status boxes as work lands.
See CLAUDE.md for architecture, MEMORY.md for decisions/rationale.

**Window:** 4 working days, ~4h/day. Today is Day 3 (2026-05-29). Delivery ~2026-06-01.
**Priority order if behind (from the case):** show data → prioritization → CRUD that persists → agent that both answers and executes ≥1 action with confirmation. Ship something that works.

---

## Status legend
- [x] done
- [~] in progress
- [ ] not started

---

## Day 3 (today) — Foundation + data + prioritization

- [x] Next.js 16 + TS + Tailwind v4 + App Router scaffold
- [x] Deps: Prisma, Anthropic SDK, zod, csv-parse, date-fns, decimal.js, recharts, shadcn
- [x] shadcn components (table, badge, input, select, card, dropdown, dialog, tabs, etc.)
- [x] Prisma schema (9 models, 6 enums) — two-axis invoice state (status + paymentStatus)
- [x] Supabase project provisioned, schema applied via MCP, RLS enabled
- [x] Seed: CSV parse → 600 customers + 8000 invoices, idempotent chunked createMany
- [x] Risk scoring v2 (6 additive rules, calibrated to real data) in src/lib/risk.ts
- [x] Verified distribution: 24 critical / 94 high / 634 medium / 1081 low
- [x] `/invoices` list: client table, sort, server-paged → reworked to in-memory (instant)
- [x] Filters: status, segment, payment method, risk range, aging — as click dropdowns
- [x] RiskBadge + StatusChip components, color by tier
- [x] Customer name + ID search, accent/case-insensitive (normalizeText)
- [x] Connection moved to IPv4 poolers (direct host is IPv6-only) — see MEMORY.md

## Day 4 — Dashboard + CRUD + audit + drawer (agent moved to Day 5)

- [x] Dashboard `/`: KPI cards (AR total, AR overdue, DSO realized + current) + risk-tier strip + status breakdown
- [x] Charts (Recharts): aging buckets bar + AR-over-time line (faturado vs recebido)
- [x] Server actions: updateInvoiceStatus (state machine), addNote, createPaymentAgreement, scheduleFollowUp + zod
- [x] State machine enforcer (canTransition rejects invalid); recompute risk on mark-paid
- [x] AuditEvent emitted in same transaction as every write; `<AuditTimeline />` component
- [x] Invoice **Sheet** (lateral, sem nav): abas Visão | Notas | Audit | Acordo
- [x] Payment agreement modal (N parcelas, desconto/juros, preview ao vivo via buildSchedule)
- [→] Agent endpoint/read tools/chat UI — **movido para Day 5** (decisão: agente inteiro num dia)

## Day 5 — AI agent (read + write) + human-in-the-loop batch confirmation

**Surface:** Claude API + tool use, **manual agentic loop** (we host compute + need approval gates).
**Model:** `claude-opus-4-8` in a constant (`AGENT_MODEL`); 1-line swap to `claude-sonnet-4-6`.
**SDK:** `@anthropic-ai/sdk` 0.100.1 — verify exact call shape (adaptive thinking / streaming / tool loop) against the installed version before coding; pin to what 0.100 supports.
**TDD:** new deterministic code is test-first (red→green). The LLM loop is verified manually + one mocked-client test.

### Bloco D1 — Agent core + read tools
- [x] `src/lib/agent/config.ts`: `AGENT_MODEL`, system prompt builder (persona = B2B collections assistant; injects RISK_RULES from `risk-rules.ts` + APP_TODAY; rules: never invent IDs → search first; batch/financial/destructive ⇒ MUST use `propose*`, never claim done; be concise). `cache_control` on system + tools.
- [x] `src/lib/agent/tools/` — tool defs (name, description, zod→JSON input schema) + impls. **Read (execute directly):**
  - `searchInvoices` (reuse `buildWhere`/filters from queries/invoices) → compact rows
  - `getInvoice(id)` (reuse `fetchInvoiceDetail`)
  - `getPortfolioStats` (reuse `fetchDashboard`)
  - `getTopRisk(n, scope)`
- [x] `src/lib/agent/registry.ts`: maps tool name → {schema, kind: read|write-direct|propose, run}. **[test-first]** dispatch routes correctly + rejects unknown tool.
- [x] `src/lib/agent/loop.ts`: manual tool-use loop (call → on `tool_use` dispatch → feed `tool_result` → repeat until `end_turn`); collects any `AgentPlan` ids created. Cap iterations.

### Bloco D2 — Write tools + human-in-the-loop plans
- [x] **Direct writes** (low-risk, reuse Day-4 actions with `origin="agent"`): `addNote`, `scheduleFollowUp`. (Refactor actions to accept an `origin`/`actor` param; default `analyst`.)
- [x] **Proposed (gated):** `proposeBatchAction` (bulk status change / note / follow-up across N invoices), `proposePaymentAgreement`, `proposeWriteOff`. Each writes `AgentPlan(status=pending, sessionId, summary, steps jsonb)` and returns the plan id + human-readable summary to the model. **[test-first]** plan rows created with correct typed steps; nothing else mutated.
- [x] `src/lib/actions/agent-plan.ts` (`"use server"`): `confirmPlan(planId)` executes every step in one `prisma.$transaction`, emits an `AuditEvent` per step (`origin="agent"`, payload references `planId`), sets `status=executed` + `executedAt`; `rejectPlan(planId)` → `status=rejected`. State-machine + balance guards reused. **[test-first, TEST- fixtures]** confirm executes + audits; invalid step aborts whole tx; reject mutates nothing.

### Bloco D3 — Endpoint + chat UI
- [x] `src/app/api/agent/chat/route.ts` (POST, streaming): runs `loop`, streams assistant text to client; after the turn, emits a final SSE event with any pending `AgentPlan` (id + summary + steps) so the UI can render a confirm card. Reads `ANTHROPIC_API_KEY` from env.
- [x] `src/app/agent/page.tsx` + `src/components/agent/*`: chat (message list, streaming render, input), `PlanCard` (summary + steps + Confirmar/Rejeitar → `confirmPlan`/`rejectPlan`, then shows result). Sidebar already links `/agent`.
- [x] Audit entries from agent actions appear in the invoice Sheet's Audit tab with the `agent` origin badge (already supported by `AuditTimeline`).

### Bloco D4 — End-to-end (the PDF batch example)
- [ ] Drive the case's scenario: "faturas R$5k+ de clientes com 3+ atrasos → in_negotiation + nota + follow-up, prévia antes". Agent searches, calls `proposeBatchAction`, UI shows the plan, confirm executes, audit shows `origin=agent`. Verify rows via MCP `execute_sql`.

### Cut to Day 6 if short on time
- [ ] Customer view `/customers/[id]` (invoices, agreements, notes, aggregated audit, current vs snapshot balance) — already #2 on the cut list; agent is the priority.

## Day 6 — Polish + deploy + README + demo

- [ ] Empty states, loading skeletons, error toasts, design pass, responsive sanity
- [ ] README: setup, prioritization rules + WHY, agent tools list, design decisions, screenshots
- [ ] Deploy Vercel + switch DATABASE_URL to Supabase pooler URI; set env vars on Vercel
- [ ] Smoke test prod; bug bash critical flow
- [ ] Short demo video (agent batch → confirm → audit)

## Cut targets if behind (drop in this order)
1. Feedback / human-in-the-loop ranking refinement (not started — bonus)
2. Customer view drill-down
3. Auth (intentionally skipped — see MEMORY.md)

## Concepts (for quick recall)

- **Risk score** = per-invoice 0-100, sum of 6 rules' points. Drives the triage queue. Shown as colored badge + number; breakdown in the drawer from `riskFactors` jsonb.
- **DSO** = portfolio KPI (NOT a risk rule). Realized DSO = avg(paidDate - issueDate) over paid invoices. Current DSO = (AR / total billed) × 90. Global on dashboard, per-customer on customer view.
- **Two-axis state**: `status` (workflow per spec) + `paymentStatus` (unpaid/partial/paid). See MEMORY.md.
- **APP_TODAY** = 2026-04-01, fixed reference date for aging.
