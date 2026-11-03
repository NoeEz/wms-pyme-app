import type { MovementType, Role, StockStatus } from "./types";

const LOCALE = "es-MX";

export const fmtNumber = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString(LOCALE, { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

export const fmtPct = (ratio: number | null | undefined, digits = 1) =>
  ratio == null ? "—" : `${(ratio * 100).toLocaleString(LOCALE, { maximumFractionDigits: digits })} %`;

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(LOCALE, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** "YYYY-MM-DD" → "3 nov" for chart axes. */
export const fmtDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} h`;
  return `${(seconds / 86400).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} d`;
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  inbound: "Entrada",
  outbound: "Salida",
  transfer: "Transferencia",
  adjustment: "Ajuste",
};

// Same colors as the mobile app's movement types, plus cyan for adjustments.
// Checked with the dataviz palette validator (light surface, in this
// stacking order): lightness, chroma, CVD and contrast all pass.
export const MOVEMENT_COLOR: Record<MovementType, string> = {
  inbound: "#4F46E5",
  outbound: "#059669",
  transfer: "#B45309",
  adjustment: "#0891B2",
};

export const ROLE_LABEL: Record<Role, string> = {
  operator: "Operador",
  supervisor: "Supervisor",
  admin: "Administrador",
  client: "Cliente 3PL",
};

export const STATUS_LABEL: Record<StockStatus, string> = {
  stockout: "Agotado",
  low: "Stock bajo",
  slow: "Sin movimiento",
  ok: "Normal",
};

export const TRACKING_LABEL = { none: "Sin seguimiento", lot: "Por lote", serial: "Por serie" } as const;

/** Start of the local day `daysAgo` days back, as the API's `from`. */
export function startOfDayAgo(daysAgo: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/** "YYYY-MM-DD" for <input type="date">, in local time. */
export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Local-day period from two <input type="date"> values, for the API. */
export function periodParams(fromDay: string, toDay: string) {
  const from = new Date(`${fromDay}T00:00:00`);
  const to = new Date(`${toDay}T23:59:59.999`);
  return { from: from.toISOString(), to: to.toISOString(), tzOffset: new Date().getTimezoneOffset() };
}
