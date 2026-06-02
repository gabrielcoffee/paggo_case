import { LayoutDashboard } from "lucide-react";
import { fetchDashboard } from "@/lib/queries/dashboard";
import { KpiCard } from "@/components/kpi-card";
import { AgingBar } from "@/components/charts/aging-bar";
import { ArTrendLine } from "@/components/charts/ar-trend-line";
import { brl } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/invoice-status";
import type { InvoiceStatus } from "@/generated/prisma/enums";

const TIERS: { key: "critical" | "high" | "medium" | "low"; label: string; cls: string }[] = [
  { key: "critical", label: "Crítico", cls: "bg-risk-critical text-risk-critical-fg" },
  { key: "high", label: "Alto", cls: "bg-risk-high text-risk-high-fg" },
  { key: "medium", label: "Médio", cls: "bg-risk-medium text-risk-medium-fg" },
  { key: "low", label: "Baixo", cls: "bg-risk-low text-risk-low-fg" },
];

export default async function Home() {
  const d = await fetchDashboard();

  return (
    <div className="h-screen overflow-auto">
      <header className="flex h-14 items-center border-b border-border px-6">
        <div className="flex items-center gap-6">
          <LayoutDashboard className="h-4 w-4 text-primary" />
          <div>
            <h1 className="text-base font-semibold">Painel</h1>
            <p className="text-xs text-muted-foreground">
              Saúde da carteira · referência 01/04/2026
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="AR total em aberto" value={brl(d.ar.total)} />
          <KpiCard
            label="AR vencido"
            value={brl(d.ar.overdue)}
            accent="text-destructive"
            hint={`${Math.round((d.ar.overdue / (d.ar.total || 1)) * 100)}% do total`}
          />
          <KpiCard
            label="DSO realizado"
            value={`${d.dso.realized} dias`}
            hint="Tempo médio para receber (faturas já pagas)"
          />
          <KpiCard
            label="DSO atual"
            value={`${d.dso.current} dias`}
            hint="Carteira em dias: AR ÷ faturado × 90"
          />
        </div>

        {/* Risk tiers */}
        <div>
          <h2 className="mb-2 text-sm font-semibold">Faturas em aberto por nível de risco</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TIERS.map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <span className="text-sm text-muted-foreground">{t.label}</span>
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-sm font-semibold tabular-nums ${t.cls}`}
                >
                  {d.tiers[t.key].toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Aging da carteira em aberto" subtitle="R$ em aberto por faixa">
            <AgingBar data={d.aging} />
          </ChartCard>
          <ChartCard title="Faturado vs. recebido" subtitle="por mês">
            <ArTrendLine data={d.trend} />
          </ChartCard>
        </div>

        {/* Status breakdown */}
        <div>
          <h2 className="mb-2 text-sm font-semibold">Faturas por status</h2>
          <div className="flex flex-wrap gap-2">
            {d.statusCounts.map((s) => (
              <div
                key={s.status}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm"
              >
                <span>{STATUS_LABELS[s.status as InvoiceStatus] ?? s.status}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {s.count.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
