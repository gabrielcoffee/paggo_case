import { AgentWorkspace } from "@/components/agent/agent-workspace";
import { appToday } from "@/lib/risk";

export default function AgentPage() {
  return <AgentWorkspace today={appToday().toISOString()} />;
}
