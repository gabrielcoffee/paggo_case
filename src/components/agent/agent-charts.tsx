"use client";

import { AgingBar } from "@/components/charts/aging-bar";
import { ArTrendLine } from "@/components/charts/ar-trend-line";
import { TierChart } from "@/components/charts/tier-chart";
import { TopRiskChart } from "@/components/charts/top-risk-chart";
import type { AgingBucket } from "@/lib/aging";

const TITLES: Record<string, string> = {
  aging: "Aging da carteira",
  ar_trend: "Faturado vs. recebido",
  risk_tiers: "Distribuição por risco",
  top_risk: "Top risco",
};

export function AgentChart({ type, data }: { type: string; data: unknown }) {
  let chart: React.ReactNode = null;
  if (type === "aging")
    chart = <AgingBar data={data as { bucket: AgingBucket; count: number; open: number }[]} />;
  else if (type === "ar_trend")
    chart = <ArTrendLine data={data as { month: string; billed: number; received: number }[]} />;
  else if (type === "risk_tiers")
    chart = <TierChart data={data as { critical: number; high: number; medium: number; low: number }} />;
  else if (type === "top_risk")
    chart = <TopRiskChart data={data as { label: string; risco: number; open: number }[]} />;

  if (!chart) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{TITLES[type] ?? type}</p>
      {chart}
    </div>
  );
}
