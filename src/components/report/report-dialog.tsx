"use client";

import { useState } from "react";
import { FileText, Download, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SEGMENT_LABELS, STATUS_LABELS } from "@/lib/invoice-status";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { getReportRows } from "@/lib/actions/report";
import {
  COLUMN_KEYS,
  COLUMN_LABELS,
  PRESET_LABELS,
  PRESETS,
  reportConfigSchema,
  type ColumnKey,
  type ReportConfig,
  type ReportPreset,
} from "@/lib/report/report-config";

const PRESET_DESC: Record<string, string> = {
  maior_risco: "Top por score de risco",
  maior_exposicao: "Maiores valores em aberto",
  vencidas_criticas: "Vencidas + risco alto",
};

const SCOPES = [
  { value: "unpaid", label: "Em aberto" },
  { value: "overdue", label: "Vencidas" },
  { value: "all", label: "Todas" },
] as const;
const SEGMENTS = ["SMB", "MID", "ENT"];
const STATUSES = Object.keys(STATUS_LABELS) as InvoiceStatus[];
const COUNTS = [5, 10, 15] as const;

const DEFAULT: ReportConfig = reportConfigSchema.parse({ preset: "maior_risco" });

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring/40 focus:ring-2";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-input text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ReportDialog() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<ReportConfig>(DEFAULT);
  const [busy, setBusy] = useState<null | "download" | "print">(null);

  // Picking a preset prefills sort/filters/columns; any manual tweak flips to custom.
  function applyPreset(preset: ReportPreset) {
    if (preset === "custom") return setCfg((c) => ({ ...c, preset }));
    const p = PRESETS[preset];
    setCfg((c) => ({ ...c, ...p, preset, count: c.count, filters: { ...c.filters, ...p.filters } }));
  }
  const tweak = (patch: Partial<ReportConfig>) => setCfg((c) => ({ ...c, ...patch, preset: "custom" }));
  const tweakFilter = (patch: Partial<ReportConfig["filters"]>) =>
    setCfg((c) => ({ ...c, preset: "custom", filters: { ...c.filters, ...patch } }));

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  async function generate(): Promise<Blob> {
    const data = await getReportRows(cfg);
    const { pdf } = await import("@react-pdf/renderer");
    const { reportElement } = await import("@/components/report/report-document");
    return pdf(reportElement({ data, config: cfg })).toBlob();
  }

  async function download() {
    setBusy("download");
    try {
      const blob = await generate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório gerado");
    } catch (e) {
      toast.error("Falha ao gerar relatório");
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function print() {
    setBusy("print");
    try {
      const blob = await generate();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      // Give the viewer a moment to load before invoking print.
      if (w) w.onload = () => w.print();
    } catch (e) {
      toast.error("Falha ao gerar relatório");
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" /> Gerar relatório
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar relatório</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Tipo de relatório">
              <div className="grid grid-cols-3 gap-2">
                {(["maior_risco", "maior_exposicao", "vencidas_criticas"] as const).map((p) => {
                  const active = cfg.preset === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={cn(
                        "rounded-md border p-2.5 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-input hover:border-primary/40 hover:bg-accent/40",
                      )}
                    >
                      <span className={cn("block text-xs font-medium", active ? "text-primary" : "text-foreground")}>
                        {PRESET_LABELS[p]}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">
                        {PRESET_DESC[p]}
                      </span>
                    </button>
                  );
                })}
              </div>
              {cfg.preset === "custom" && (
                <span className="text-[11px] text-muted-foreground">Personalizado (filtros ajustados)</span>
              )}
            </Field>

            <Field label="Quantidade">
              <div className="flex gap-1.5">
                {COUNTS.map((n) => (
                  <Chip key={n} active={cfg.count === n} onClick={() => tweak({ count: n })}>
                    {n}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Escopo">
              <select
                value={cfg.filters.scope}
                onChange={(e) => tweakFilter({ scope: e.target.value as ReportConfig["filters"]["scope"] })}
                className={inputCls}
              >
                {SCOPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Segmento">
              <div className="flex flex-wrap gap-1.5">
                {SEGMENTS.map((seg) => (
                  <Chip
                    key={seg}
                    active={cfg.filters.segment.includes(seg)}
                    onClick={() => tweakFilter({ segment: toggle(cfg.filters.segment, seg) })}
                  >
                    {SEGMENT_LABELS[seg] ?? seg}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Status">
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((st) => (
                  <Chip
                    key={st}
                    active={cfg.filters.status.includes(st)}
                    onClick={() => tweakFilter({ status: toggle(cfg.filters.status, st) })}
                  >
                    {STATUS_LABELS[st]}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Colunas">
              <div className="flex flex-wrap gap-1.5">
                {COLUMN_KEYS.map((k) => (
                  <Chip
                    key={k}
                    active={cfg.columns.includes(k)}
                    onClick={() => {
                      const next = toggle(cfg.columns, k);
                      if (next.length) tweak({ columns: next as ColumnKey[] });
                    }}
                  >
                    {COLUMN_LABELS[k]}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={print} loading={busy === "print"} disabled={busy !== null}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <Button onClick={download} loading={busy === "download"} disabled={busy !== null}>
              <Download className="h-4 w-4" /> Baixar PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
