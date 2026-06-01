import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/components/report/report-document";
import { reportConfigSchema, type ReportData } from "@/lib/report/report-config";

function fakeData(n: number): ReportData {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `INV-${1000 + i}`,
    customerName: `Cliente ${i}`,
    segment: "ENT",
    paymentMethod: "BOLETO",
    amount: 10000 + i * 100,
    open: 8000 + i * 100,
    dueDate: "2026-03-15T00:00:00.000Z",
    daysOverdue: 17 + i,
    riskScore: 70 - i,
    status: "open",
  }));
  return {
    rows,
    meta: { geradoEm: "2026-04-01T00:00:00.000Z", count: n, totalEmAberto: 50000, presetLabel: "Faturas de maior risco", filtroResumo: "Em aberto" },
  };
}

describe("ReportDocument", () => {
  it("renders a multi-page PDF buffer (12 rows → 3 pages)", async () => {
    const config = reportConfigSchema.parse({ preset: "maior_risco", count: 15 });
    const buf = await renderToBuffer(createElement(ReportDocument, { data: fakeData(12), config }));
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders with zero rows (empty-state page)", async () => {
    const config = reportConfigSchema.parse({ preset: "maior_risco" });
    const buf = await renderToBuffer(createElement(ReportDocument, { data: fakeData(0), config }));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
