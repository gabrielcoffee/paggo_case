import { AutomationsPanel } from "@/components/automation/automations-panel";
import { appToday } from "@/lib/risk";

export default function AutomacoesPage() {
  return (
    <div className="h-screen">
      <AutomationsPanel today={appToday().toISOString()} />
    </div>
  );
}
