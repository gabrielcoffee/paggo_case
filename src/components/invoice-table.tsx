"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Banknote,
  Barcode,
  Building2,
  ChevronsUpDown,
  Clock,
  CreditCard,
  Hourglass,
  Loader2,
  Repeat,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RiskBadge } from "@/components/risk-badge";
import { StatusChip, PaymentStatusDot } from "@/components/status-chip";
import { FilterDropdown } from "@/components/filter-dropdown";
import { InvoiceSheet } from "@/components/invoice-sheet";
import { prefetchDetail } from "@/lib/detail-cache";
import { InvoiceCreateModal } from "@/components/forms/invoice-create-modal";
import { ReportDialog } from "@/components/report/report-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RISK_RULES } from "@/lib/risk-rules";
import { PAGE_SIZE, type InvoiceRow, type ScopePreset } from "@/lib/queries/invoice-types";
import { agingBucket, AGING_BUCKETS, AGING_LABELS, daysOverdue } from "@/lib/aging";
import {
  SEGMENT_LABELS,
  STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/invoice-status";
import { brl } from "@/lib/format";
import { normalizeText } from "@/lib/text";
import { cn } from "@/lib/utils";

const SCOPES: { value: ScopePreset; label: string }[] = [
  { value: "unpaid", label: "Não pagas" },
  { value: "overdue", label: "Em atraso" },
  { value: "all", label: "Todas" },
];

const SEGMENT_OPTS = ["SMB", "MID", "ENT"].map((v) => ({ value: v, label: SEGMENT_LABELS[v] }));
const METHOD_OPTS = ["BOLETO", "PIX", "CREDIT_CARD", "BANK_TRANSFER"].map((v) => ({
  value: v,
  label: PAYMENT_METHOD_LABELS[v],
}));
const AGING_OPTS = AGING_BUCKETS.map((v) => ({ value: v, label: AGING_LABELS[v] }));
const STATUS_OPTS = (
  ["open", "in_negotiation", "agreement_signed", "paid", "written_off", "disputed"] as const
).map((v) => ({ value: v, label: STATUS_LABELS[v] }));

// Live risk re-weighting: the analyst tunes how many points each rule is worth
// (0-30, sticky to 5s). Defaults mirror the persisted weights, so the table is
// identical to the server score until a slider moves. Nothing is saved — scores,
// ordering, badges and the "Risco ≥" filter are recomputed in memory only.
const RULE_MAX: Record<string, number> = Object.fromEntries(
  RISK_RULES.map((r) => [r.key, r.max]),
);
const DEFAULT_WEIGHTS: Record<string, number> = { ...RULE_MAX };

const RULE_ICON: Record<string, LucideIcon> = {
  balance_at_risk: Banknote,
  aging: Hourglass,
  chronicity: Repeat,
  ent_first_late: Building2,
  boleto_stuck: Barcode,
};

// What each rule measures + how its points scale. Clearer than the one-line
// rationale; the last two are all-or-nothing (binary).
const RULE_DESC: Record<string, string> = {
  balance_at_risk:
    "Saldo em aberto da fatura. Pontua proporcional ao valor, atingindo o máximo em R$ 25 mil.",
  aging: "Dias desde o vencimento. Cresce com o atraso e satura aos 60 dias.",
  chronicity:
    "Atrasos do cliente nos últimos 12 meses. Proporcional até 5 atrasos, quando bate o teto.",
  ent_first_late:
    "Cliente Enterprise atrasando pela primeira vez. Pontua cheio quando ocorre.",
  boleto_stuck:
    "Boleto com mais de 2 tentativas (falha técnica). Pontua cheio quando ocorre.",
};

function liveScore(
  factors: { rule: string; points: number }[],
  weights: Record<string, number>,
): number {
  let score = 0;
  for (const f of factors) {
    const max = RULE_MAX[f.rule] ?? 0;
    // points/max is the realized intensity (binary rules fire at full → 1).
    if (max > 0) score += (f.points / max) * (weights[f.rule] ?? 0);
  }
  return Math.round(score);
}

type SortField = "riskScore" | "open" | "dueDate" | "customer";
type SortDir = "asc" | "desc";

export function InvoiceTable({
  rows,
  scope,
  capped,
  totalAll,
  today,
  customers,
}: {
  rows: InvoiceRow[];
  scope: ScopePreset;
  capped: boolean;
  totalAll: number;
  today: string;
  customers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const todayDate = useMemo(() => new Date(today), [today]);

  // All filter state is client-side for instant, no-network filtering.
  const [q, setQ] = useState("");
  const [segments, setSegments] = useState<string[]>([]);
  const [methods, setMethods] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [aging, setAging] = useState<string[]>([]);
  const [riskDraft, setRiskDraft] = useState(0); // follows the slider thumb live
  const [minRisk, setMinRisk] = useState(0); // applied only when the user releases
  const [sort, setSort] = useState<SortField>("riskScore");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [openRow, setOpenRow] = useState<InvoiceRow | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>(() => ({
    ...DEFAULT_WEIGHTS,
  }));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pendingScope, setPendingScope] = useState<ScopePreset | null>(null);
  // Optimistic per-row patches: a mutation in the open sheet (e.g. status change)
  // lands here instantly so the row behind updates without waiting on the DB or a
  // server revalidate. Layered over the server rows; rolled back if the write fails.
  const [overrides, setOverrides] = useState<Map<string, Partial<InvoiceRow>>>(new Map());

  const onInvoiceChange = useCallback(
    (rowId: string, patch: Partial<InvoiceRow>) => {
      let prev: Partial<InvoiceRow> | undefined;
      setOverrides((m) => {
        const n = new Map(m);
        prev = n.get(rowId);
        n.set(rowId, { ...(prev ?? {}), ...patch });
        return n;
      });
      return () =>
        setOverrides((m) => {
          const n = new Map(m);
          if (prev === undefined) n.delete(rowId);
          else n.set(rowId, prev);
          return n;
        });
    },
    [],
  );

  const effectiveRows = useMemo(
    () =>
      overrides.size === 0
        ? rows
        : rows.map((r) => (overrides.has(r.id) ? { ...r, ...overrides.get(r.id) } : r)),
    [rows, overrides],
  );

  const nq = normalizeText(q);

  const weightsDirty = useMemo(
    () => RISK_RULES.some((r) => weights[r.key] !== DEFAULT_WEIGHTS[r.key]),
    [weights],
  );
  const maxScore = useMemo(
    () => Object.values(weights).reduce((a, b) => a + b, 0),
    [weights],
  );

  // Re-score every row from its factors. Identical to the persisted score while
  // weights are untouched, so the default view is unchanged.
  const scored = useMemo(
    () =>
      weightsDirty
        ? effectiveRows.map((r) => ({ ...r, riskScore: liveScore(r.riskFactors, weights) }))
        : effectiveRows,
    [effectiveRows, weights, weightsDirty],
  );

  // Lowering weights can drop the ceiling below a previously-set threshold; clamp
  // at apply-time so the filter never hides everything (state itself is preserved).
  const effMinRisk = Math.min(minRisk, maxScore);

  const filtered = useMemo(() => {
    const out = scored.filter((r) => {
      if (effMinRisk > 0 && r.riskScore < effMinRisk) return false;
      if (segments.length && !segments.includes(r.segment)) return false;
      if (methods.length && !methods.includes(r.paymentMethod)) return false;
      if (statuses.length && !statuses.includes(r.status)) return false;
      if (aging.length) {
        const b = agingBucket(new Date(r.dueDate), todayDate);
        if (!aging.includes(b)) return false;
      }
      if (nq) {
        const hay = normalizeText(`${r.customerName} ${r.id} ${r.customerId}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });

    const factor = dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      let cmp = 0;
      if (sort === "customer") cmp = a.customerName.localeCompare(b.customerName, "pt-BR");
      else if (sort === "open") cmp = a.open - b.open;
      else if (sort === "dueDate") cmp = a.dueDate.localeCompare(b.dueDate);
      else cmp = a.riskScore - b.riskScore;
      if (cmp === 0) cmp = a.id.localeCompare(b.id);
      return cmp * factor;
    });
    return out;
  }, [scored, effMinRisk, segments, methods, statuses, aging, nq, sort, dir, todayDate]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, total);

  // Toggling any filter sends the user back to the first page.
  const toggle =
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) => {
      setter((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
      );
      setPage(1);
    };

  const hasFilters =
    q !== "" ||
    segments.length > 0 ||
    methods.length > 0 ||
    statuses.length > 0 ||
    aging.length > 0 ||
    minRisk > 0 ||
    weightsDirty;

  function clearAll() {
    setQ("");
    setSegments([]);
    setMethods([]);
    setStatuses([]);
    setAging([]);
    setRiskDraft(0);
    setMinRisk(0);
    setWeights({ ...DEFAULT_WEIGHTS });
    setPage(1);
  }

  function changeScope(next: ScopePreset) {
    if (next === scope) return;
    setPendingScope(next);
    startTransition(() => router.push(`/invoices?scope=${next}`));
  }

  function sortBy(field: SortField) {
    if (sort === field) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(field);
      setDir("desc");
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div>
          <h1 className="text-base font-semibold">Faturas</h1>
          <p className="text-xs text-muted-foreground">Triagem por risco · carteira B2B</p>
        </div>
        <div className="flex items-center gap-3 text-right text-xs text-muted-foreground">
          <ReportDialog />
          <InvoiceCreateModal customers={customers} />
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {total.toLocaleString("pt-BR")}
            </span>{" "}
            no filtro atual
          </span>
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 border-b border-border bg-card px-5 py-3">
        {/* Line 1: search + scope (left), risk controls (right) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Cliente ou ID da fatura…"
              className="h-8 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none ring-ring/40 focus:ring-2"
            />
          </div>

          {/* Scope segmented control (the only server round-trip) */}
          <div className="flex rounded-md border border-input bg-background p-0.5">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                onClick={() => changeScope(s.value)}
                disabled={pending}
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                  scope === s.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-primary",
                )}
              >
                {pending && pendingScope === s.value && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {s.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {hasFilters && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            )}

            {/* Risk slider — thumb follows the cursor live, filter applies on release */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Risco ≥
              <input
                type="range"
                min={0}
                max={maxScore}
                step={5}
                value={Math.min(riskDraft, maxScore)}
                onChange={(e) => setRiskDraft(Number(e.target.value))}
                onMouseUp={() => {
                  setMinRisk(riskDraft);
                  setPage(1);
                }}
                onTouchEnd={() => {
                  setMinRisk(riskDraft);
                  setPage(1);
                }}
                onKeyUp={() => {
                  setMinRisk(riskDraft);
                  setPage(1);
                }}
                className="accent-primary"
              />
              <span className="w-14 font-mono font-semibold tabular-nums text-foreground">
                {Math.min(riskDraft, maxScore)}
                <span className="text-muted-foreground">/{maxScore}</span>
              </span>
            </label>

            <button
              onClick={() => setRulesOpen(true)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm",
                weightsDirty
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Regras de risco
            </button>
          </div>
        </div>

        {/* Line 2: 2x2 grid of filters with icons + inline selected chips. Auto
            columns mean selected chips on the left column push Aging/Status right. */}
        <div className="grid w-fit grid-cols-[auto_auto] gap-x-8 gap-y-2">
          <FilterDropdown
            label="Segmento"
            icon={Building2}
            options={SEGMENT_OPTS}
            selected={segments}
            onToggle={toggle(setSegments)}
            onClear={() => {
              setSegments([]);
              setPage(1);
            }}
          />
          <FilterDropdown
            label="Aging"
            icon={Clock}
            options={AGING_OPTS}
            selected={aging}
            onToggle={toggle(setAging)}
            onClear={() => {
              setAging([]);
              setPage(1);
            }}
          />
          <FilterDropdown
            label="Método"
            icon={CreditCard}
            options={METHOD_OPTS}
            selected={methods}
            onToggle={toggle(setMethods)}
            onClear={() => {
              setMethods([]);
              setPage(1);
            }}
          />
          <FilterDropdown
            label="Status"
            icon={Activity}
            options={STATUS_OPTS}
            selected={statuses}
            onToggle={toggle(setStatuses)}
            onClear={() => {
              setStatuses([]);
              setPage(1);
            }}
          />
        </div>

        {capped && (
          <p className="text-[11px] text-muted-foreground">
            Mostrando as {rows.length.toLocaleString("pt-BR")} faturas de maior risco de{" "}
            {totalAll.toLocaleString("pt-BR")}. Use “Não pagas” ou “Em atraso” para a
            carteira ativa completa.
          </p>
        )}
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[0_1px_0_0_var(--border)]">
            <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:font-medium [&>th:first-child]:pl-5! [&>th:last-child]:pr-5!">
              <th>
                <SortHeader label="Cliente" field="customer" sort={sort} dir={dir} onSort={sortBy} />
              </th>
              <th>Fatura</th>
              <th>Seg.</th>
              <th>Método</th>
              <th className="text-right!">
                <SortHeader label="Em aberto" field="open" sort={sort} dir={dir} onSort={sortBy} align="right" />
              </th>
              <th>
                <SortHeader label="Vencimento" field="dueDate" sort={sort} dir={dir} onSort={sortBy} />
              </th>
              <th>Status</th>
              <th className="text-right!">
                <SortHeader label="Risco" field="riskScore" sort={sort} dir={dir} onSort={sortBy} align="right" />
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((inv) => {
              const od = daysOverdue(new Date(inv.dueDate), todayDate);
              return (
                <tr
                  key={inv.id}
                  onClick={() => setOpenRow(inv)}
                  onMouseEnter={() => prefetchDetail(inv.id)}
                  className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40 [&>td]:px-3 [&>td]:py-2.5 [&>td:first-child]:pl-5! [&>td:last-child]:pr-5!"
                >
                  <td className="max-w-[220px]">
                    <span
                      className="block truncate font-medium"
                      title={inv.customerName}
                    >
                      {inv.customerName}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {inv.customerId}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">{inv.id}</td>
                  <td className="text-xs">{SEGMENT_LABELS[inv.segment]}</td>
                  <td className="text-xs">{PAYMENT_METHOD_LABELS[inv.paymentMethod]}</td>
                  <td className="text-right">
                    <div className="font-mono font-medium tabular-nums">{brl(inv.open)}</div>
                    {inv.paymentStatus !== "unpaid" && (
                      <div className="text-[11px]">
                        <PaymentStatusDot status={inv.paymentStatus as never} />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="font-mono text-xs tabular-nums">
                      {new Date(inv.dueDate).toLocaleDateString("pt-BR")}
                    </div>
                    {od > 0 && <div className="text-[11px] text-destructive">{od}d atraso</div>}
                  </td>
                  <td>
                    <StatusChip status={inv.status as never} />
                  </td>
                  <td className="text-right">
                    <RiskBadge score={inv.riskScore} />
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-16 text-center text-sm text-muted-foreground">
                  Nenhuma fatura corresponde aos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex h-12 shrink-0 items-center justify-between border-t border-border px-5 text-xs text-muted-foreground">
        <span>
          {from}–{to} de {total.toLocaleString("pt-BR")}
        </span>
        <div className="flex items-center gap-1">
          <PageBtn onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} label="Anterior" />
          <span className="px-2 font-mono tabular-nums">
            {safePage} / {pageCount}
          </span>
          <PageBtn
            onClick={() => setPage(safePage + 1)}
            disabled={safePage >= pageCount}
            label="Próxima"
          />
        </div>
      </footer>

      <InvoiceSheet
        row={openRow}
        today={today}
        onClose={() => setOpenRow(null)}
        onInvoiceChange={onInvoiceChange}
      />

      <RiskRulesModal
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        weights={weights}
        onChange={(key, val) => {
          setWeights((w) => ({ ...w, [key]: val }));
          setPage(1);
        }}
        onReset={() => {
          setWeights({ ...DEFAULT_WEIGHTS });
          setPage(1);
        }}
        maxScore={maxScore}
      />
    </div>
  );
}

function RiskRulesModal({
  open,
  onOpenChange,
  weights,
  onChange,
  onReset,
  maxScore,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  weights: Record<string, number>;
  onChange: (key: string, val: number) => void;
  onReset: () => void;
  maxScore: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="gap-1 border-b border-border px-5 py-4">
          <DialogTitle className="text-sm font-semibold">Regras de risco</DialogTitle>
          <DialogDescription className="text-xs">
            O risco de cada fatura é a soma dos pontos das regras que ela aciona. Ajuste o peso de
            cada regra (0–30).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b border-border px-5 py-2.5 text-xs">
          <span className="text-muted-foreground">Pontuação máxima (somatória)</span>
          <span className="font-mono text-sm font-semibold tabular-nums">{maxScore}</span>
        </div>

        <div className="space-y-4 overflow-auto px-5 py-4">
          {RISK_RULES.map((r) => {
            const w = weights[r.key] ?? 0;
            const def = DEFAULT_WEIGHTS[r.key];
            const Icon = RULE_ICON[r.key];
            return (
              <div key={r.key} className="flex items-start gap-3">
                {Icon && (
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.label}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {RULE_DESC[r.key] ?? r.why}
                  </p>
                  {w > def && (
                    <p className="mt-1 text-[11px] text-destructive">
                      Acima do padrão calibrado ({def}).
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={5}
                    value={w}
                    onChange={(e) => onChange(r.key, Number(e.target.value))}
                    className="w-24 accent-primary"
                  />
                  <span className="w-5 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                    {w}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Restaurar padrão
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Concluir
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function SortHeader({
  label,
  field,
  sort,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  sort: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = sort === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "group inline-flex items-center gap-1 hover:text-foreground",
        align === "right" && "flex-row-reverse",
        active && "text-foreground",
      )}
    >
      {label}
      {active ? (
        dir === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUp className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50" />
      )}
    </button>
  );
}

function PageBtn({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md border border-border px-2.5 py-1",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
