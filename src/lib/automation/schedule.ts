import { addWeeks, addMonths, parseISO, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import type { Schedule } from "@/lib/automation/automation-spec";

// Next run is the first scheduled instant strictly after `from`, never before the
// configured start. Cadence derives from startDate: weekly keeps the same weekday,
// monthly the same day-of-month. Uses real wall-clock time (the dataset's aging is
// frozen at APP_TODAY, but the schedule itself runs on the real calendar).
export function computeNextRun(schedule: Schedule, from: Date): Date {
  const [h, m] = schedule.timeOfDay.split(":").map(Number);
  const base = setMilliseconds(setSeconds(setMinutes(setHours(parseISO(schedule.startDate), h), m), 0), 0);

  const step = (d: Date): Date =>
    schedule.frequency === "weekly" ? addWeeks(d, 1) : addMonths(d, 1);

  let run = base;
  let guard = 0;
  while (run <= from && guard++ < 100000) run = step(run);
  return run;
}
