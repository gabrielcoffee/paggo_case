import { createElement, type ReactElement } from "react";
import { Document, Page, View, Text, StyleSheet, type DocumentProps } from "@react-pdf/renderer";
import { brl, date, dateTime } from "@/lib/format";
import { SEGMENT_LABELS, STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/invoice-status";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import {
  COLUMN_LABELS,
  type ColumnKey,
  type ReportConfig,
  type ReportData,
  type ReportRow,
} from "@/lib/report/report-config";

// @react-pdf document for the invoice report. Works both in the browser
// (pdf().toBlob() — download/print) and on the server (renderToBuffer — email
// attachment). 5 rows per page, max 3 pages (15 rows).

type ColMeta = { flex: number; align: "left" | "right"; value: (r: ReportRow) => string };

const COLS: Record<ColumnKey, ColMeta> = {
  cliente: { flex: 2.4, align: "left", value: (r) => r.customerName },
  fatura: { flex: 1.3, align: "left", value: (r) => r.id },
  segmento: { flex: 1.1, align: "left", value: (r) => SEGMENT_LABELS[r.segment] ?? r.segment },
  valor: { flex: 1.3, align: "right", value: (r) => brl(r.amount) },
  em_aberto: { flex: 1.3, align: "right", value: (r) => brl(r.open) },
  vencimento: { flex: 1.1, align: "left", value: (r) => date(r.dueDate) },
  dias_atraso: { flex: 1, align: "right", value: (r) => (r.daysOverdue > 0 ? `${r.daysOverdue}d` : "—") },
  risco: { flex: 0.8, align: "right", value: (r) => String(r.riskScore) },
  status: { flex: 1.3, align: "left", value: (r) => STATUS_LABELS[r.status as InvoiceStatus] ?? r.status },
  metodo: { flex: 1.2, align: "left", value: (r) => PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod },
};

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 36, fontSize: 9, color: "#1a1a1a", fontFamily: "Helvetica" },
  brand: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#6d28d9", marginBottom: 2 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sub: { fontSize: 9, color: "#666", marginBottom: 1 },
  kpiRow: { flexDirection: "row", gap: 24, marginTop: 12, marginBottom: 16 },
  kpiLabel: { fontSize: 8, color: "#888", textTransform: "uppercase" },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 4, marginBottom: 2 },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#444", textTransform: "uppercase", paddingHorizontal: 4 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#e2e2e2" },
  cell: { fontSize: 9, paddingHorizontal: 4 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#999" },
});

function Header({ data }: { data: ReportData }) {
  const { meta } = data;
  return (
    <View>
      <Text style={s.brand}>Paggo · Cobrança</Text>
      <Text style={s.title}>{meta.presetLabel}</Text>
      <Text style={s.sub}>Filtro: {meta.filtroResumo || "—"}</Text>
      <Text style={s.sub}>Gerado em {dateTime(meta.geradoEm)} (data de referência da carteira)</Text>
      <View style={s.kpiRow}>
        <View>
          <Text style={s.kpiLabel}>Faturas no relatório</Text>
          <Text style={s.kpiValue}>{meta.count}</Text>
        </View>
        <View>
          <Text style={s.kpiLabel}>Total em aberto</Text>
          <Text style={s.kpiValue}>{brl(meta.totalEmAberto)}</Text>
        </View>
      </View>
    </View>
  );
}

function TableHead({ columns }: { columns: ColumnKey[] }) {
  return (
    <View style={s.thead} fixed>
      {columns.map((k) => (
        <Text
          key={k}
          style={[s.th, { flex: COLS[k].flex, textAlign: COLS[k].align }]}
        >
          {COLUMN_LABELS[k]}
        </Text>
      ))}
    </View>
  );
}

function Row({ row, columns }: { row: ReportRow; columns: ColumnKey[] }) {
  return (
    <View style={s.row} wrap={false}>
      {columns.map((k) => (
        <Text key={k} style={[s.cell, { flex: COLS[k].flex, textAlign: COLS[k].align }]}>
          {COLS[k].value(row)}
        </Text>
      ))}
    </View>
  );
}

// @react-pdf's pdf()/renderToBuffer want a ReactElement<DocumentProps>; a custom
// component element doesn't structurally match, so this helper centralizes the
// cast for all call sites (dialog download/print, email attachment, tests).
export function reportElement(props: { data: ReportData; config: ReportConfig }): ReactElement<DocumentProps> {
  return createElement(ReportDocument, props) as unknown as ReactElement<DocumentProps>;
}

export function ReportDocument({ data, config }: { data: ReportData; config: ReportConfig }) {
  // Single page; @react-pdf breaks to new pages automatically as rows overflow.
  // The header block shows once (page 1), the table head + footer repeat (fixed).
  return (
    <Document title={`Relatório — ${data.meta.presetLabel}`}>
      <Page size="A4" style={s.page}>
        <Header data={data} />
        <TableHead columns={config.columns} />
        {data.rows.map((r) => (
          <Row key={r.id} row={r} columns={config.columns} />
        ))}
        {data.rows.length === 0 && (
          <Text style={{ marginTop: 12, color: "#999" }}>Nenhuma fatura corresponde ao filtro.</Text>
        )}
        <View style={s.footer} fixed>
          <Text>Paggo · Relatório de cobrança</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
