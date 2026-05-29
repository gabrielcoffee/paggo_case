# MEMORY

Decisions, tradeoffs, and learnings during development. Most-recent-first within sections.

## UX / performance decisions

### Invoice list filters client-side in memory (instant), scope is the only server round-trip

Case demands "responsive and instant". Server-side pagination re-queried the DB on every slider tick / chip toggle → lag. Reworked to load the whole working set once per scope (`fetchInvoiceDataset` in `src/lib/queries/invoices.ts`) and do all filtering, sorting, search, and pagination in the client `InvoiceTable` component — zero network after load. `unpaid` / `overdue` load the full set (~1.9k / fewer rows). `all` is capped at `DATASET_CAP = 1500` highest-risk rows (shows a banner). Decimals→numbers, dates→ISO at the RSC boundary so the dataset serializes cleanly. Trade-off accepted: filters left the URL (no shareable/bookmark state, no back-button filter history); scope stays in the URL and is the only thing that triggers a server refetch.

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

### Hardcoded `analyst-default` actor (no auth)

The optional bonus includes auth. ROI is low for this case — auth doesn't change the prioritization quality, agent quality, or CRUD correctness. All audit entries use `actor: 'analyst-default'` until/unless auth is added. The schema already accommodates real user IDs without migration.

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
