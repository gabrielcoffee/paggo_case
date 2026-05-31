"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AGING_LABELS, type AgingBucket } from "@/lib/aging";
import { brl, brlCompact } from "@/lib/format";

const COLORS: Record<AgingBucket, string> = {
  not_due: "var(--muted-foreground)",
  "0-30": "var(--risk-low)",
  "31-60": "var(--risk-medium)",
  "61-90": "var(--risk-high)",
  "90+": "var(--risk-critical)",
};

export function AgingBar({
  data,
}: {
  data: { bucket: AgingBucket; count: number; open: number }[];
}) {
  const chart = data.map((d) => ({
    name: AGING_LABELS[d.bucket],
    bucket: d.bucket,
    open: d.open,
    count: d.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => brlCompact(Number(v))}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => [brl(Number(value)), "Em aberto"]}
        />
        <Bar dataKey="open" radius={[4, 4, 0, 0]}>
          {chart.map((d) => (
            <Cell key={d.bucket} fill={COLORS[d.bucket]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
