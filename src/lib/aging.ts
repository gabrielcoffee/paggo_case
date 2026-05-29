import { differenceInCalendarDays } from "date-fns";

export type AgingBucket = "not_due" | "0-30" | "31-60" | "61-90" | "90+";

export const AGING_BUCKETS: AgingBucket[] = [
  "not_due",
  "0-30",
  "31-60",
  "61-90",
  "90+",
];

export const AGING_LABELS: Record<AgingBucket, string> = {
  not_due: "A vencer",
  "0-30": "0–30 dias",
  "31-60": "31–60 dias",
  "61-90": "61–90 dias",
  "90+": "90+ dias",
};

export function daysOverdue(dueDate: Date, today: Date): number {
  return differenceInCalendarDays(today, dueDate);
}

export function agingBucket(dueDate: Date, today: Date): AgingBucket {
  const d = daysOverdue(dueDate, today);
  if (d <= 0) return "not_due";
  if (d <= 30) return "0-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}
