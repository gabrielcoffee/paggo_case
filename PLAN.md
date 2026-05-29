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
- [ ] `/invoices` list: server component, table, sort, pagination
- [ ] Filters sidebar: status, segment, payment method, risk range, aging bucket
- [ ] RiskBadge + StatusChip components, color by tier
- [ ] Customer name search

## Day 4 — Dashboard + CRUD + audit + agent (read)

- [ ] Dashboard `/`: KPI cards (AR total, AR overdue, DSO realized + current, recovery rate, top-N risk)
- [ ] Charts (Recharts): aging buckets bar + AR-over-time line
- [ ] Server actions: updateStatus (state machine), addNote, createAgreement, scheduleFollowUp + zod validation
- [ ] State machine enforcer (reject invalid transitions); recompute risk on writes that affect inputs
- [ ] AuditEvent emitted in same transaction as every write; `<AuditLog />` component
- [ ] Invoice detail drawer: tabs Details | Notes | Audit | Agreement
- [ ] Payment agreement modal (N installments, discount/fee, preview)
- [ ] Agent endpoint `/api/agent/chat` (Anthropic tool-use loop, prompt caching)
- [ ] Read tools: searchInvoices, getInvoice, getCustomer, getTopRisk, listAgingBuckets
- [ ] Chat UI (shadcn), text rendering

## Day 5 — Agent (write) + batch confirmation + customer view

- [ ] Low-risk write tools: addNote, scheduleFollowUp, single updateInvoiceStatus
- [ ] proposeBatchAction → AgentPlan row → plan card UI → confirmPlan(planId) transactional execute
- [ ] createPaymentAgreement tool with preview
- [ ] Write-off always confirms; agent audit entries tagged origin='agent'
- [ ] Customer view `/customers/[id]`: invoices, payment history, agreements, notes, aggregated audit, current vs snapshot open balance
- [ ] End-to-end: run the PDF's batch example ("R$5k+ invoices of 3+ prior-late customers → in_negotiation + note + follow-up, preview first")

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
