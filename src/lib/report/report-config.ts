import { z } from "zod";

// Shared (prisma-free) contract for the PDF report — used by the dialog (client),
// the server builder, the @react-pdf document, and the automation "report_email"
// effect. Single source of truth for what a report can contain.

export const COLUMN_KEYS = [
  "cliente",
  "fatura",
  "segmento",
  "valor",
  "em_aberto",
  "vencimento",
  "dias_atraso",
  "risco",
  "status",
  "metodo",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  cliente: "Cliente",
  fatura: "Fatura",
  segmento: "Segmento",
  valor: "Valor",
  em_aberto: "Em aberto",
  vencimento: "Vencimento",
  dias_atraso: "Dias atraso",
  risco: "Risco",
  status: "Status",
  metodo: "Método",
};

export const DEFAULT_COLUMNS: ColumnKey[] = [
  "cliente",
  "fatura",
  "em_aberto",
  "vencimento",
  "dias_atraso",
  "risco",
];

export const REPORT_PRESETS = [
  "maior_risco",
  "maior_exposicao",
  "vencidas_criticas",
  "custom",
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const PRESET_LABELS: Record<ReportPreset, string> = {
  maior_risco: "Faturas de maior risco",
  maior_exposicao: "Maiores exposições em aberto",
  vencidas_criticas: "Vencidas críticas",
  custom: "Relatório personalizado",
};

export const reportFiltersSchema = z.object({
  scope: z.enum(["unpaid", "overdue", "all"]).default("unpaid"),
  segment: z.array(z.string()).default([]),
  status: z.array(z.string()).default([]),
  aging: z.array(z.string()).default([]),
  minRisk: z.number().min(0).max(100).default(0),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const reportConfigSchema = z.object({
  preset: z.enum(REPORT_PRESETS).default("maior_risco"),
  count: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
  sort: z.enum(["risco", "valor_aberto", "vencimento"]).default("risco"),
  filters: reportFiltersSchema.default({ scope: "unpaid", segment: [], status: [], aging: [], minRisk: 0 }),
  columns: z.array(z.enum(COLUMN_KEYS)).min(1).default(DEFAULT_COLUMNS),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

// Presets prefill sort/filters/columns. The user can still tweak afterwards
// (which flips the preset to "custom" in the dialog).
export const PRESETS: Record<Exclude<ReportPreset, "custom">, Partial<ReportConfig>> = {
  maior_risco: {
    sort: "risco",
    filters: { scope: "unpaid", segment: [], status: [], aging: [], minRisk: 0 },
    columns: ["cliente", "fatura", "em_aberto", "vencimento", "dias_atraso", "risco"],
  },
  maior_exposicao: {
    sort: "valor_aberto",
    filters: { scope: "unpaid", segment: [], status: [], aging: [], minRisk: 0 },
    columns: ["cliente", "fatura", "valor", "em_aberto", "vencimento", "risco"],
  },
  vencidas_criticas: {
    sort: "risco",
    filters: { scope: "overdue", segment: [], status: [], aging: [], minRisk: 40 },
    columns: ["cliente", "fatura", "em_aberto", "dias_atraso", "risco", "status"],
  },
};

// Row + meta the builder returns and the document renders.
export type ReportRow = {
  id: string;
  customerName: string;
  segment: string;
  paymentMethod: string;
  amount: number;
  open: number;
  dueDate: string;
  daysOverdue: number;
  riskScore: number;
  status: string;
};

export type ReportMeta = {
  geradoEm: string;
  count: number;
  totalEmAberto: number;
  presetLabel: string;
  filtroResumo: string;
};

export type ReportData = { rows: ReportRow[]; meta: ReportMeta };

export const ROWS_PER_PAGE = 5;
