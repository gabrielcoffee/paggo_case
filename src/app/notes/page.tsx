import { ActivityList } from "@/components/activity/activity-list";
import { appToday } from "@/lib/risk";
import { fetchRecentNotes } from "@/lib/queries/activity";

export default async function NotesPage() {
  const rows = await fetchRecentNotes();
  return <ActivityList kind="notes" title="Notas" rows={rows} today={appToday().toISOString()} />;
}
