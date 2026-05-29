"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { RiskBadge } from "@/components/risk-badge";
import { StatusChip, PaymentStatusDot } from "@/components/status-chip";
import { FilterDropdown } from "@/components/filter-dropdown";
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

type SortField = "riskScore" | "open" | "dueDate" | "customer";
type SortDir = "asc" | "desc";

export function InvoiceTable({
  rows,
  scope,
  capped,
  totalAll,
  today,
}: {
  rows: InvoiceRow[];
  scope: ScopePreset;
  capped: boolean;
  totalAll: number;
  today: string;
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

  const nq = normalizeText(q);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (minRisk > 0 && r.riskScore < minRisk) return false;
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
  }, [rows, minRisk, segments, methods, statuses, aging, nq, sort, dir, todayDate]);

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
    minRisk > 0;

  function clearAll() {
    setQ("");
    setSegments([]);
    setMethods([]);
    setStatuses([]);
    setAging([]);
    setRiskDraft(0);
    setMinRisk(0);
    setPage(1);
  }

  function changeScope(next: ScopePreset) {
    if (next === scope) return;
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
        <div className="flex items-center gap-2 text-right text-xs text-muted-foreground">
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
        <div className="flex flex-wrap items-center gap-2">
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
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  scope === s.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-primary",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <FilterDropdown
            label="Segmento"
            options={SEGMENT_OPTS}
            selected={segments}
            onToggle={toggle(setSegments)}
            onClear={() => {
              setSegments([]);
              setPage(1);
            }}
          />
          <FilterDropdown
            label="Método"
            options={METHOD_OPTS}
            selected={methods}
            onToggle={toggle(setMethods)}
            onClear={() => {
              setMethods([]);
              setPage(1);
            }}
          />
          <FilterDropdown
            label="Aging"
            options={AGING_OPTS}
            selected={aging}
            onToggle={toggle(setAging)}
            onClear={() => {
              setAging([]);
              setPage(1);
            }}
          />
          <FilterDropdown
            label="Status"
            options={STATUS_OPTS}
            selected={statuses}
            onToggle={toggle(setStatuses)}
            onClear={() => {
              setStatuses([]);
              setPage(1);
            }}
          />

          {/* Risk slider — thumb follows the cursor live, filter applies on release */}
          <label className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
            Risco ≥
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={riskDraft}
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
            <span className="w-6 font-mono font-semibold tabular-nums text-foreground">
              {riskDraft}
            </span>
          </label>

          {hasFilters && (
            <button
              onClick={clearAll}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Limpar filtros
            </button>
          )}
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
            <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:font-medium">
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
                  className="border-b border-border/60 transition-colors hover:bg-accent/40 [&>td]:px-3 [&>td]:py-2.5"
                >
                  <td className="max-w-[220px]">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="block truncate font-medium hover:text-primary hover:underline"
                      title={inv.customerName}
                    >
                      {inv.customerName}
                    </Link>
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
    </div>
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
