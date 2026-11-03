import { Types } from "mongoose";
import type { AuthPayload } from "../middleware/auth";
import { Location } from "../models/Location";
import { Movement } from "../models/Movement";
import { Product } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { Warehouse } from "../models/Warehouse";
import { assertWarehouse, productScope } from "./scope";

// Shared building blocks for the dashboard and reports: what a user may see
// (company, warehouse, 3PL customer) and how a movement line changes stock.

export interface Scope {
  companyId: Types.ObjectId;
  warehouseId?: Types.ObjectId;
  isClient: boolean;
  products: Map<string, any>; // lean Product docs by id, active and inactive
  productIds: Types.ObjectId[];
  locations: Map<string, any>; // lean Location docs by id
  locationIds: Types.ObjectId[];
}

export async function buildScope(auth: AuthPayload, warehouseId?: string): Promise<Scope> {
  const companyId = new Types.ObjectId(auth.companyId);
  if (warehouseId) await assertWarehouse(auth.companyId, warehouseId);
  const warehouseIds = warehouseId
    ? [new Types.ObjectId(warehouseId)]
    : (await Warehouse.find({ companyId }).select("_id").lean()).map(w => w._id);
  const [products, locations] = await Promise.all([
    Product.find(productScope(auth)).populate("customerId", "code name").lean(),
    Location.find({ warehouseId: { $in: warehouseIds } }).lean(),
  ]);
  return {
    companyId,
    warehouseId: warehouseId ? new Types.ObjectId(warehouseId) : undefined,
    isClient: auth.role === "client",
    products: new Map(products.map(p => [String(p._id), p])),
    productIds: products.map(p => p._id),
    locations: new Map(locations.map(l => [String(l._id), l])),
    locationIds: locations.map(l => l._id),
  };
}

export async function scopedBalances(scope: Scope) {
  return StockBalance.find({ productId: { $in: scope.productIds }, locationId: { $in: scope.locationIds } }).lean();
}

/** Movements in scope, oldest first, with lines outside the scope's products removed. */
export async function scopedMovements(scope: Scope, range: { from?: Date; to?: Date }, extra: Record<string, unknown> = {}) {
  const filter: Record<string, unknown> = { companyId: scope.companyId, ...extra };
  if (scope.warehouseId) filter.warehouseId = scope.warehouseId;
  if (range.from || range.to) {
    filter.createdAt = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
  }
  if (scope.isClient) filter["lines.productId"] = { $in: scope.productIds };
  const movements = await Movement.find(filter).sort({ createdAt: 1 }).populate("userId", "name").lean();
  return movements.map(m => ({
    ...m,
    createdAt: (m as unknown as { createdAt: Date }).createdAt, // timestamps option isn't in the inferred type
    lines: m.lines.filter(l => scope.products.has(String(l.productId))),
  }));
}

export interface LineEffect { locationId: string; delta: number }

/**
 * Stock changes a line causes inside the scope's locations: destination
 * gains, source loses (inbound/outbound/transfer/adjustment alike).
 */
export function lineEffects(scope: Scope, line: { quantity: number; sourceLocationId?: unknown; destinationLocationId?: unknown }): LineEffect[] {
  const out: LineEffect[] = [];
  const src = line.sourceLocationId ? String(line.sourceLocationId) : undefined;
  const dest = line.destinationLocationId ? String(line.destinationLocationId) : undefined;
  if (src && scope.locations.has(src)) out.push({ locationId: src, delta: -line.quantity });
  if (dest && scope.locations.has(dest)) out.push({ locationId: dest, delta: line.quantity });
  return out;
}

export function onHandByProduct(balances: { productId: unknown; available: number }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const b of balances) totals.set(String(b.productId), (totals.get(String(b.productId)) ?? 0) + b.available);
  return totals;
}

export type StockStatus = "stockout" | "low" | "slow" | "ok";

export function stockStatus(onHand: number, threshold: number, lastMovementAt: Date | null, slowSince: Date): StockStatus {
  if (onHand <= 0) return "stockout";
  if (threshold > 0 && onHand <= threshold) return "low";
  if (!lastMovementAt || lastMovementAt < slowSince) return "slow";
  return "ok";
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

