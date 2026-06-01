"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Building2, ChevronsUpDown, Search, X } from "lucide-react";
import { FilterDropdown } from "@/components/filter-dropdown";
import { CustomerCreateModal } from "@/components/forms/customer-create-modal";
import { CustomerSheet } from "@/components/customer-sheet";
import { Sheet } from "@/components/ui/sheet";
import { InvoiceDetailPanel } from "@/components/invoice-detail-panel";
import { PAGE_SIZE, type CustomerRow } from "@/lib/queries/customer-types";
import { prefetchCustomer } from "@/lib/customer-detail-cache";
import { prefetchDetail } from "@/lib/detail-cache";
import { SEGMENT_LABELS } from "@/lib/invoice-status";
import { brl } from "@/lib/format";
import { normalizeText } from "@/lib/text";
import { cn } from "@/lib/utils";

const SEGMENT_OPTS = ["SMB", "MID", "ENT"].map((v) => ({ value: v, label: SEGMENT_LABELS[v] }));

type SortField = "name" | "openAr" | "overdueAr" | "overdueCount";
type SortDir = "asc" | "desc";

export function CustomerTable({
  rows,
  totalAll,
  today,
}: {
  rows: CustomerRow[];
  totalAll: number;
  today: string;
}) {
  const [q, setQ] = useState("");
  const [segments, setSegments] = useState<string[]>([]);
  const [sort, setSort] = useState<SortField>("overdueAr");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [openCustomer, setOpenCustomer] = useState<CustomerRow | null>(null);
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);

  const nq = normalizeText(q);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (segments.length && !segments.includes(r.segment)) return false;
      if (nq) {
        const hay = normalizeText(`${r.name} ${r.id}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
    const factor = dir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      let cmp =
        sort === "name"
          ? a.name.localeCompare(b.name, "pt-BR")
          : (a[sort] as number) - (b[sort] as number);
      if (cmp === 0) cmp = a.id.localeCompare(b.id);
      return cmp * factor;
    });
    return out;
  }, [rows, segments, nq, sort, dir]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, total);

  const hasFilters = q !== "" || segments.length > 0;

  function clearAll() {
    setQ("");
    setSegments([]);
    setPage(1);
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
          <h1 className="text-base font-semibold">Clientes</h1>
          <p className="text-xs text-muted-foreground">Carteira B2B · {totalAll} clientes</p>
        </div>
        <div className="flex items-center gap-3">
          <CustomerCreateModal />
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {total.toLocaleString("pt-BR")}
            </span>{" "}
            no filtro atual
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Cliente ou ID…"
            className="h-8 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none ring-ring/40 focus:ring-2"
          />
        </div>
        <FilterDropdown
          label="Segmento"
          icon={Building2}
          options={SEGMENT_OPTS}
          selected={segments}
          onToggle={(v) => {
            setSegments((prev) =>
              prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
            );
            setPage(1);
          }}
          onClear={() => {
            setSegments([]);
            setPage(1);
          }}
        />
        {hasFilters && (
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> Limpar filtros
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[0_1px_0_0_var(--border)]">
            <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:font-medium [&>th:first-child]:pl-5! [&>th:last-child]:pr-5!">
              <th>
                <SortHeader label="Cliente" field="name" sort={sort} dir={dir} onSort={sortBy} />
              </th>
              <th>Seg.</th>
              <th className="text-right!">
                <SortHeader label="AR aberto" field="openAr" sort={sort} dir={dir} onSort={sortBy} align="right" />
              </th>
              <th className="text-right!">
                <SortHeader label="AR vencido" field="overdueAr" sort={sort} dir={dir} onSort={sortBy} align="right" />
              </th>
              <th className="text-right!">Faturas</th>
              <th className="text-right!">
                <SortHeader label="Vencidas" field="overdueCount" sort={sort} dir={dir} onSort={sortBy} align="right" />
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => (
              <tr
                key={c.id}
                onClick={() => setOpenCustomer(c)}
                onMouseEnter={() => prefetchCustomer(c.id)}
                className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40 [&>td]:px-3 [&>td]:py-2.5 [&>td:first-child]:pl-5! [&>td:last-child]:pr-5!"
              >
                <td className="max-w-[260px]">
                  <span className="block truncate font-medium" title={c.name}>
                    {c.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>
                </td>
                <td className="text-xs">{SEGMENT_LABELS[c.segment] ?? c.segment}</td>
                <td className="text-right font-mono tabular-nums">{brl(c.openAr)}</td>
                <td
                  className={cn(
                    "text-right font-mono tabular-nums",
                    c.overdueAr > 0 && "text-destructive",
                  )}
                >
                  {brl(c.overdueAr)}
                </td>
                <td className="text-right font-mono tabular-nums">{c.invoiceCount}</td>
                <td className="text-right font-mono tabular-nums">{c.overdueCount}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-16 text-center text-sm text-muted-foreground">
                  Nenhum cliente corresponde aos filtros.
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

      <CustomerSheet
        customer={openCustomer}
        today={today}
        onClose={() => setOpenCustomer(null)}
        onOpenInvoice={(invId) => {
          prefetchDetail(invId);
          setOpenInvoice(invId);
        }}
      />
      <Sheet open={openInvoice != null} onClose={() => setOpenInvoice(null)}>
        {openInvoice && (
          <InvoiceDetailPanel
            key={openInvoice}
            id={openInvoice}
            today={today}
            onClose={() => setOpenInvoice(null)}
          />
        )}
      </Sheet>
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
