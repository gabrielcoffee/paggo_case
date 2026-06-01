"use client";

import { AgingBar } from "@/components/charts/aging-bar";
import { ArTrendLine } from "@/components/charts/ar-trend-line";
import { TierChart } from "@/components/charts/tier-chart";
import { TopRiskChart } from "@/components/charts/top-risk-chart";
import { ChatEntityList, type EntitySelect } from "@/components/agent/chat-entity-list";
import type { AgingBucket } from "@/lib/aging";

const TITLES: Record<string, string> = {
  aging: "Aging da carteira",
  ar_trend: "Faturado vs. recebido",
  risk_tiers: "Distribuição por risco",
  top_risk: "Top risco",
  invoice_list: "Faturas",
  customer_list: "Clientes",
};

export function AgentChart({
  type,
  data,
  onSelect,
}: {
  type: string;
  data: unknown;
  onSelect?: EntitySelect;
}) {
  let chart: React.ReactNode = null;
  if (type === "aging")
    chart = <AgingBar data={data as { bucket: AgingBucket; count: number; open: number }[]} />;
  else if (type === "ar_trend")
    chart = <ArTrendLine data={data as { month: string; billed: number; received: number }[]} />;
  else if (type === "risk_tiers")
    chart = <TierChart data={data as { critical: number; high: number; medium: number; low: number }} />;
  else if (type === "top_risk")
    chart = <TopRiskChart data={data as { label: string; risco: number; open: number }[]} />;
  else if (type === "invoice_list")
    chart = <ChatEntityList kind="invoice" data={data} onSelect={onSelect} />;
  else if (type === "customer_list")
    chart = <ChatEntityList kind="customer" data={data} onSelect={onSelect} />;

  if (!chart) return null;
  const flush = type === "invoice_list" || type === "customer_list";
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <p className="px-3 pt-3 text-xs font-medium text-muted-foreground">{TITLES[type] ?? type}</p>
      <div className={flush ? "mt-2" : "p-3"}>{chart}</div>
    </div>
  );
}
