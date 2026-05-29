import { riskTier } from "@/lib/risk";
import { cn } from "@/lib/utils";

const TIER_STYLES: Record<string, string> = {
  low: "bg-risk-low text-risk-low-fg",
  medium: "bg-risk-medium text-risk-medium-fg",
  high: "bg-risk-high text-risk-high-fg",
  critical: "bg-risk-critical text-risk-critical-fg",
};

const TIER_LABELS: Record<string, string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  critical: "Crítico",
};

export function RiskBadge({
  score,
  showLabel = false,
  className,
}: {
  score: number;
  showLabel?: boolean;
  className?: string;
}) {
  const tier = riskTier(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
        TIER_STYLES[tier],
        className,
      )}
      title={`Risco ${TIER_LABELS[tier]} (${score}/100)`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70"
      />
      {score}
      {showLabel && (
        <span className="font-sans font-medium">{TIER_LABELS[tier]}</span>
      )}
    </span>
  );
}
