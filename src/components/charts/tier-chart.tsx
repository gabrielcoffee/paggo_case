"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const TIERS = [
  { key: "critical", label: "Crítico", color: "var(--risk-critical)" },
  { key: "high", label: "Alto", color: "var(--risk-high)" },
  { key: "medium", label: "Médio", color: "var(--risk-medium)" },
  { key: "low", label: "Baixo", color: "var(--risk-low)" },
] as const;

export function TierChart({
  data,
}: {
  data: { critical: number; high: number; medium: number; low: number };
}) {
  const chart = TIERS.map((t) => ({ name: t.label, count: data[t.key] ?? 0, color: t.color }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.4 }}
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chart.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
