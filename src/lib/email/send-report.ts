import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import { reportElement } from "@/components/report/report-document";
import { fetchReportRows } from "@/lib/report/build-report";
import { brl, dateTime } from "@/lib/format";
import type { ReportConfig } from "@/lib/report/report-config";

// Renders the report PDF server-side and emails it as an attachment via Resend.
// Key comes from RESEND_API_KEY (never hardcoded). Without a verified domain,
// Resend only delivers to the account owner's email — fine for this prototype.
export async function emailReport(
  to: string,
  config: ReportConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY ausente no ambiente." };

  const data = await fetchReportRows(config);
  const buf = await renderToBuffer(reportElement({ data, config }));

  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: "onboarding@resend.dev",
    to,
    subject: `Relatório — ${data.meta.presetLabel}`,
    html:
      `<p>Segue o relatório <strong>${data.meta.presetLabel}</strong>.</p>` +
      `<p>${data.meta.count} faturas · total em aberto ${brl(data.meta.totalEmAberto)}.<br/>` +
      `Gerado em ${dateTime(data.meta.geradoEm)} (data de referência da carteira).</p>`,
    attachments: [
      { filename: `relatorio-${new Date().toISOString().slice(0, 10)}.pdf`, content: buf },
    ],
  });

  if (error) return { ok: false, error: error.message ?? String(error) };
  return { ok: true };
}
