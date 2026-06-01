import { ActivityList } from "@/components/activity/activity-list";
import { appToday } from "@/lib/risk";
import { fetchRecentFollowUps } from "@/lib/queries/activity";

export default async function FollowUpsPage() {
  const rows = await fetchRecentFollowUps();
  return (
    <ActivityList kind="followups" title="Follow-ups" rows={rows} today={appToday().toISOString()} />
  );
}
