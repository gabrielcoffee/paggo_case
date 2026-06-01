import { InvoiceTable } from "@/components/invoice-table";
import { appToday } from "@/lib/risk";
import { fetchInvoiceDataset, type ScopePreset } from "@/lib/queries/invoices";
import { fetchCustomerOptions } from "@/lib/queries/customers";

type SP = Record<string, string | string[] | undefined>;

function parseScope(sp: SP): ScopePreset {
  const raw = Array.isArray(sp.scope) ? sp.scope[0] : sp.scope;
  return raw === "overdue" || raw === "all" ? raw : "unpaid";
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const scope = parseScope(sp);
  const [{ rows, capped, totalAll }, customers] = await Promise.all([
    fetchInvoiceDataset(scope),
    fetchCustomerOptions(),
  ]);

  return (
    <InvoiceTable
      rows={rows}
      scope={scope}
      capped={capped}
      totalAll={totalAll}
      today={appToday().toISOString()}
      customers={customers}
    />
  );
}
