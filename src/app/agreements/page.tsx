import { ActivityList } from "@/components/activity/activity-list";
import { appToday } from "@/lib/risk";
import { fetchRecentAgreements } from "@/lib/queries/activity";

export default async function AgreementsPage() {
  const rows = await fetchRecentAgreements();
  return (
    <ActivityList kind="agreements" title="Acordos" rows={rows} today={appToday().toISOString()} />
  );
}
