"use server";

import { reportConfigSchema, type ReportData } from "@/lib/report/report-config";
import { fetchReportRows } from "@/lib/report/build-report";

// Thin server action so the client report dialog can pull rows from the DB, then
// render the PDF in the browser. The automation effect calls fetchReportRows
// directly (no round-trip needed server-side).
export async function getReportRows(config: unknown): Promise<ReportData> {
  const parsed = reportConfigSchema.parse(config);
  return fetchReportRows(parsed);
}
