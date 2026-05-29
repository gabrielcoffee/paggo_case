@AGENTS.md

# Paggo Collections Tool

Internal web app helping a B2B collections analyst triage and act on overdue invoices.
This is a hiring case for Paggo. Production-grade prototype, 4-day implementation window.

## Project Overview

The dataset is ~8000 synthetic invoices over Jan-Mar 2026 (some due dates extend through May).
Invoices have no priority labels — the app derives them via rule-based scoring.
The analyst can view, filter, update status, add notes, create payment agreements, schedule follow-ups.
An AI agent answers questions about the data and can execute the same write operations under human-in-the-loop confirmation for batch/destructive actions.

## Architecture

- **Framework**: Next.js 16 (App Router, Server Components, Server Actions)
- **UI**: shadcn/ui (base-nova preset using `@base-ui/react`) + Tailwind CSS v4
- **Database**: PostgreSQL on Supabase
- **ORM**: Prisma 6 with the new `prisma-client` generator (output: `src/generated/prisma`)
- **LLM**: Anthropic Claude (Sonnet 4.6) via `@anthropic-ai/sdk` directly (no wrapper). Tool use + prompt caching.
- **Charts**: Recharts (Tremor was rejected — see MEMORY.md).
- **Validation**: zod for inputs (server actions, agent tool schemas)
- **CSV ingest**: `csv-parse` in `prisma/seed.ts`

## Tech Stack Notes (Next.js 16 specifics)

This project runs on Next.js 16. Several APIs are NOT what you remember from Next.js 15:

- `params` and `searchParams` in `page.tsx`/`layout.tsx`/`route.ts` are **Promises**. Always `await` them.
- Use the global type helpers `PageProps<'/route'>`, `LayoutProps<'/route'>`, `RouteContext<'/route'>` (run `npx next typegen` to generate).
- `cookies()`, `headers()`, `draftMode()` are async — always `await`.
- `middleware.ts` is deprecated — use `proxy.ts` if you need request-level interception (we don't).
- `next lint` was removed; use `eslint` directly via `npm run lint`.
- Turbopack is the default for `dev` and `build`. No need for `--turbopack` flag.
- `revalidateTag(tag, cacheLife)` now requires a second arg. Use `updateTag(tag)` in Server Actions for read-your-writes semantics.
- PPR moved from `experimental.ppr` to top-level `cacheComponents: true`. We are not opting in.

When in doubt, consult `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.

## Folder Structure

```
paggo-app/
  data/invoices.csv             - dataset (copied from project root)
  prisma/
    schema.prisma               - DB schema (all models + enums)
    seed.ts                     - idempotent CSV import + risk score precompute
    migrations/                 - Prisma migrations
  prisma.config.ts              - Prisma 6 config (loads .env)
  src/
    app/                        - Next.js routes (App Router)
    components/ui/              - shadcn components
    generated/prisma/           - Prisma client output (gitignored after first gen)
    lib/
      risk.ts                   - prioritization rules + risk scoring
      utils.ts                  - shadcn cn() helper
  .env                          - DATABASE_URL, ANTHROPIC_API_KEY, APP_TODAY
  AGENTS.md                     - Next.js 16 warning
  CLAUDE.md                     - this file
  MEMORY.md                     - decisions, tradeoffs, learnings
```

## Domain Model

`Customer` 1—N `Invoice`. `Invoice` 1—N `PaymentAgreement` 1—N `AgreementInstallment`.
Polymorphic siblings (entityType + entityId): `Note`, `FollowUp`, `AuditEvent`.
`AgentPlan` is the server-side draft for batch agent actions, confirmed by the analyst before execution.

### Invoice state model

Two orthogonal axes:

- **`status`** (workflow enum, from the PDF spec): `open → in_negotiation → agreement_signed → paid`, with `written_off` and `disputed` as terminal branches. Invalid transitions are rejected by the state machine in server actions and tool implementations.
- **`paymentStatus`** (financial state): `unpaid | partial | paid`. Derived from `amountPaid` vs `amount`. The PDF state machine does not model partial payments; this field handles that 13% of the dataset.

The reference "today" is fixed via `APP_TODAY` env var (default `2026-04-01`) so aging buckets remain meaningful across sessions.

### Risk scoring

5 rules in `src/lib/risk.ts`, each contributing 0..N points to a 0-100 score:

1. `recoverable_x_chronicity` (0-30): unpaid balance weighted by historical late count.
2. `credit_utilization` (0-20): `openBalance / creditLimit` ratio.
3. `ent_first_late` (binary 25): Enterprise customer overdue for the first time.
4. `boleto_stuck` (binary 10): BOLETO + attempts > 2.
5. `silent_high_value` (binary 15): amount > R$10k, overdue > 30d, no payment yet.

Score and the contributing factors (`riskFactors` jsonb) are persisted per invoice and recomputed on any write that affects the input fields.

## Audit Log

Every write — analyst or agent — creates an `AuditEvent` with `origin` set accordingly.
Agent actions also reference the originating `AgentPlan.id` in the payload when applicable.
The audit log is treated as a first-class product feature, surfaced in invoice and customer drawers.

## AI Agent

`/api/agent/chat` runs an Anthropic tool-use loop. Tools live in `src/lib/agent/tools/`.

- Read-only tools execute directly.
- Single low-risk writes (`addNote`, `scheduleFollowUp`, single `updateInvoiceStatus`) execute directly.
- Batch actions, write-offs, and payment agreements go through `proposeBatchAction` → `agent_plans` row → UI plan card → `confirmPlan(planId)` → transactional execution.
- The model never invents IDs; tool schemas require concrete identifiers, otherwise the agent must search or ask.
- System prompt uses Anthropic prompt caching for the tools description and persona block.

## Development Workflow

```bash
# First time setup (after .env has DATABASE_URL filled)
npm run db:generate          # generate Prisma client
npm run db:migrate           # apply migrations to Supabase
npm run db:seed              # import CSV + compute risk scores

# Day-to-day
npm run dev                  # Next.js dev server (Turbopack)
npm run db:studio            # browse the DB
npm run lint                 # ESLint

# Deployment
# - Push to GitHub
# - Connect repo to Vercel
# - Set env vars (DATABASE_URL, ANTHROPIC_API_KEY, APP_TODAY) on Vercel
# - Vercel builds and deploys automatically
```

## Environment Variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (Transaction pooler URI) |
| `ANTHROPIC_API_KEY` | Claude API key for the agent |
| `APP_TODAY` | Reference date for aging math (e.g. `2026-04-01`) |

## Coding Standards

- TypeScript strict mode (Next.js default).
- Server Components by default; `'use client'` only where interactivity demands it.
- Server Actions for analyst-driven CRUD. Route handlers (`route.ts`) for the agent endpoint (streaming).
- All write paths validate input with zod before touching the DB.
- All writes that change persistent state emit an `AuditEvent` in the same Prisma transaction.
- Money is stored as `Decimal(14,2)` in Postgres and `Decimal.js` instances in app code — never plain `number` for amounts.
- Dates without a time component use `@db.Date`. Timestamps use Postgres `timestamptz`.
- No `console.log` in committed code. Use `console.error` only for unrecoverable errors.

## Memory Management

This project uses two files for long-term context:

- **CLAUDE.md** (this file): stable architecture, conventions, workflows. Updated rarely.
- **MEMORY.md**: decisions, tradeoffs, learnings, rejected approaches. Grows over time.

When making changes:
- Update CLAUDE.md only if stable structure or conventions changed.
- Update MEMORY.md when you make a decision, reject an alternative, or hit a non-obvious issue.
- Avoid duplicate content across the two files.
