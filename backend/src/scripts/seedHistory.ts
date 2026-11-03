import { Types } from "mongoose";
import { InventoryCount } from "../models/InventoryCount";
import { Movement, type MovementType } from "../models/Movement";
import { generateFolio } from "../services/folio";

// 30 days of plausible demo activity for the seed, so the portal's dashboard
// and reports have something to show: daily receipts and dispatches,
// transfers, a few movements synced late (captured offline), and two
// physical counts — one exact, one that needed an adjustment. Deterministic
// (fixed PRNG seed). Stock is simulated forward from an opening balance and
// the caller stores the resulting balances, so kardex and stock reconcile.

type Id = Types.ObjectId;

interface Line { productId: Id; quantity: number; sourceLocationId?: Id; destinationLocationId?: Id; lot?: string }

export interface HistoryContext {
  companyId: Id;
  users: { operator: Id; supervisor: Id };
  warehouses: { north: Id; center: Id };
  locations: { northA: Id; northB: Id; centerA: Id; centerB: Id };
  products: { banda: Id; filtro: Id };
}

const DAYS = 30;

function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Writes the history and returns the resulting balances ("productId:locationId" → qty). */
export async function seedHistory(ctx: HistoryContext): Promise<Map<string, number>> {
  const rand = prng(20261103);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const key = (p: Id, l: Id) => `${p}:${l}`;
  const stock = new Map<string, number>();
  const add = (p: Id, l: Id, q: number) => stock.set(key(p, l), (stock.get(key(p, l)) ?? 0) + q);
  const has = (p: Id, l: Id) => stock.get(key(p, l)) ?? 0;

  // Opening balances 30 days ago.
  add(ctx.products.filtro, ctx.locations.northB, 180);
  add(ctx.products.banda, ctx.locations.northB, 34);

  const movements: Record<string, unknown>[] = [];
  const counts: Record<string, unknown>[] = [];
  const folioSeq = new Map<string, number>();

  function record(type: MovementType, at: Date, warehouseId: Id, userId: Id, lines: Line[], reference?: string, offline = false) {
    const dayKey = `${type}:${at.toDateString()}`;
    const seq = (folioSeq.get(dayKey) ?? 0) + 1;
    folioSeq.set(dayKey, seq);
    for (const l of lines) {
      if (l.sourceLocationId) add(l.productId, l.sourceLocationId, -l.quantity);
      if (l.destinationLocationId) add(l.productId, l.destinationLocationId, l.quantity);
    }
    const _id = new Types.ObjectId();
    // Captured on the device seconds before reaching the server — or hours,
    // when the operator was working without signal.
    const lagMs = type === "adjustment" ? 0 : offline ? int(20, 180) * 60_000 : int(3, 90) * 1000;
    movements.push({
      _id, folio: generateFolio(type, seq, at), type, status: "completed",
      companyId: ctx.companyId, warehouseId, userId, reference, lines,
      ...(type === "adjustment" ? {} : { clientId: new Types.ObjectId().toHexString(), capturedAt: new Date(at.getTime() - lagMs) }),
      syncedAt: at, createdAt: at,
    });
    return _id;
  }

  function count(at: Date, warehouseId: Id, locationId: Id, productId: Id, counted: number, code: string) {
    const expected = has(productId, locationId);
    const diff = counted - expected;
    const adjustmentId = diff === 0 ? undefined : record("adjustment", at, warehouseId, ctx.users.supervisor, [
      diff > 0 ? { productId, quantity: diff, destinationLocationId: locationId } : { productId, quantity: -diff, sourceLocationId: locationId },
    ], `Conteo físico ${code}`);
    counts.push({
      companyId: ctx.companyId, warehouseId, locationId, userId: ctx.users.supervisor,
      lines: [{ productId, expected, counted }], accurate: diff === 0, adjustmentId, createdAt: at,
    });
  }

  const today = new Date();
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    const day = new Date(today);
    day.setDate(day.getDate() - daysAgo);
    if (day.getDay() === 0) continue; // closed on Sundays
    const at = (hour: number) => { const d = new Date(day); d.setHours(hour, int(0, 59), int(0, 59), 0); return d; };
    const operator = rand() < 0.8 ? ctx.users.operator : ctx.users.supervisor;
    const lot = `L${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;
    const { north, center } = ctx.warehouses;
    const { northA, northB, centerA } = ctx.locations;
    const { banda, filtro } = ctx.products;

    // Supplier receipt of filters every few days.
    if (daysAgo % 4 === 2) {
      record("inbound", at(8), north, operator, [{ productId: filtro, quantity: 10 * int(3, 5), destinationLocationId: northB }], `OC-${4100 + daysAgo}`);
    }
    // Daily dispatches.
    const filtroOut = int(6, 14);
    if (has(filtro, northB) >= filtroOut) {
      record("outbound", at(int(10, 17)), north, operator, [{ productId: filtro, quantity: filtroOut, sourceLocationId: northB }], `PED-${7300 + daysAgo}`, rand() < 0.12);
    }
    const bandaOut = int(0, 2);
    if (bandaOut > 0 && has(banda, northB) >= bandaOut) {
      record("outbound", at(int(11, 16)), north, operator, [{ productId: banda, quantity: bandaOut, sourceLocationId: northB, lot: "L2409" }], `PED-${7500 + daysAgo}`, rand() < 0.12);
    }
    // Weekly replenishment of the picking face.
    if (day.getDay() === 1 && has(filtro, northB) >= 30) {
      record("transfer", at(9), north, ctx.users.supervisor, [{ productId: filtro, quantity: 20, sourceLocationId: northB, destinationLocationId: northA }], "Reabasto frente de surtido");
    }
    if (daysAgo === 18) {
      record("inbound", at(9), center, ctx.users.supervisor, [{ productId: banda, quantity: 12, destinationLocationId: centerA, lot }], "OC-4090");
    }
    if (daysAgo === 9 && has(banda, centerA) >= 4) {
      record("outbound", at(13), center, ctx.users.supervisor, [{ productId: banda, quantity: 4, sourceLocationId: centerA, lot }], "PED-7611", true);
    }
    if (daysAgo === 12) count(at(18), north, northB, banda, has(banda, northB), "B-01-R01-P02");
    if (daysAgo === 5) count(at(18), north, northB, filtro, has(filtro, northB) - 3, "B-01-R01-P02");
  }

  // Raw inserts so the historical createdAt values aren't replaced by "now".
  if (movements.length) await Movement.collection.insertMany(movements);
  if (counts.length) await InventoryCount.collection.insertMany(counts);
  return stock;
}
