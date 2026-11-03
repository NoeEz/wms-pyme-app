import { z } from "zod";
import { HttpError } from "../middleware/errorHandler";

const DAY_MS = 86_400_000;

// Query params shared by the dashboard and reports. The web portal sends
// from/to as ISO instants (the browser computes local day boundaries) and
// tzOffset as Date#getTimezoneOffset() minutes (360 for CDMX) so daily
// series are bucketed in the user's local days, not the server's UTC.
const periodSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
});

export interface Period { from: Date; to: Date; tzOffset: number; days: number }

export function parsePeriod(query: unknown, { defaultDays = 30, maxDays = 366 } = {}): Period {
  const { from, to, tzOffset } = periodSchema.parse(query);
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - defaultDays * DAY_MS);
  if (start > end) throw new HttpError(400, "invalid_period", "La fecha inicial es posterior a la final.");
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
  if (days > maxDays) throw new HttpError(400, "invalid_period", `El periodo no puede pasar de ${maxDays} días.`);
  return { from: start, to: end, tzOffset, days };
}

/** "YYYY-MM-DD" of an instant in the user's local time. */
export function localDay(date: Date, tzOffset: number): string {
  return new Date(date.getTime() - tzOffset * 60_000).toISOString().slice(0, 10);
}

/** Every local day in the period, oldest first — so charts get empty days too. */
export function daysOf(period: Period): string[] {
  const out: string[] = [];
  const last = localDay(period.to, period.tzOffset);
  for (let t = period.from.getTime(); ; t += DAY_MS) {
    const day = localDay(new Date(t), period.tzOffset);
    if (out[out.length - 1] !== day) out.push(day);
    if (day >= last) break;
  }
  return out;
}
