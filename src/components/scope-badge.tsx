import { FileText, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Notes and follow-ups are polymorphic (invoice|customer). In the aggregated
// views (activity page, agent chat lists) the scope is otherwise ambiguous, so
// this badge makes "is this about a Fatura or a Cliente?" explicit at a glance.
export function ScopeBadge({ entityType }: { entityType: string }) {
  const isCustomer = entityType === "customer";
  const Icon = isCustomer ? Building2 : FileText;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        isCustomer
          ? "bg-chart-2/12 text-chart-2 ring-chart-2/30"
          : "bg-secondary text-secondary-foreground ring-border",
      )}
    >
      <Icon className="h-3 w-3" />
      {isCustomer ? "Cliente" : "Fatura"}
    </span>
  );
}
