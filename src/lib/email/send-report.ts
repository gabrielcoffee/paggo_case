import { renderToBuffer } from "@react-pdf/renderer";
import { reportElement } from "@/components/report/report-document";
import { fetchReportRows } from "@/lib/report/build-report";
import type { ReportConfig } from "@/lib/report/report-config";

// Simulated email: renders the report PDF server-side (proving the attachment
// generates) but does NOT actually send it — no external provider or API key
// needed, so it always works in the demo. To go live, drop a real provider
// (e.g. Resend) here using `to` + the rendered buffer.
export async function emailReport(
  to: string,
  config: ReportConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const data = await fetchReportRows(config);
    await renderToBuffer(reportElement({ data, config }));
    void to; // recipient is logged by the caller; no real send in this prototype
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
