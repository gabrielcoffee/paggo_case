import { CustomerTable } from "@/components/customer-table";
import { appToday } from "@/lib/risk";
import { fetchCustomerDataset } from "@/lib/queries/customers";

export default async function CustomersPage() {
  const { rows, totalAll } = await fetchCustomerDataset();

  return (
    <CustomerTable rows={rows} totalAll={totalAll} today={appToday().toISOString()} />
  );
}
