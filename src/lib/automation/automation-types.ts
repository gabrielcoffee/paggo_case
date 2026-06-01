import type { Effect, Schedule, Target } from "@/lib/automation/automation-spec";

// Serializable shapes returned by the automation server actions to the UI.
export type AutomationRunInfo = {
  id: string;
  runAt: string;
  trigger: string;
  status: string;
  matched: number;
  acted: number;
  summary: string;
};

export type AutomationSummary = {
  id: string;
  name: string;
  enabled: boolean;
  target: Target;
  condition: unknown;
  effect: Effect;
  frequency: Schedule["frequency"];
  startDate: string;
  timeOfDay: string;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
  lastRun: AutomationRunInfo | null;
};

export type AutomationDetail = AutomationSummary & { runs: AutomationRunInfo[] };
