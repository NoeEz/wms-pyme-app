import mongoose, { Types } from "mongoose";
import type { AuthPayload } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { InventoryCount } from "../models/InventoryCount";
import { Location } from "../models/Location";
import { Movement } from "../models/Movement";
import { Product } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { audit } from "./audit";
import { generateFolio } from "./folio";
import { assertProductsExist } from "./movementService";
import { assertWarehouse } from "./scope";

export interface CountInput {
  warehouseId: string;
  locationId: string;
  lines: { productId: string; counted: number }[];
  notes?: string;
}

/**
 * Records a physical count of one location. Within one transaction: reads
 * what the system expected, sets each balance to the counted quantity and,
 * when anything differs, creates an "adjustment" movement (folio AJU-…) with
 * the differences — so the kardex explains every stock change.
 */
export async function recordCount(auth: AuthPayload, input: CountInput) {
  const { companyId } = auth;
  const { warehouseId, locationId, lines, notes } = input;

  await assertWarehouse(companyId, warehouseId);
  const location = await Location.findOne({ _id: locationId, warehouseId, active: { $ne: false } });
  if (!location) throw new HttpError(422, "location_outside_warehouse", "La ubicación no pertenece al almacén seleccionado.");
  const productIds = lines.map(l => l.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new HttpError(422, "duplicate_product", "Cada producto debe aparecer una sola vez en el conteo.");
  }
  await assertProductsExist(companyId, productIds);
  const skus = new Map((await Product.find({ _id: { $in: productIds } }).select("sku")).map(p => [String(p._id), p.sku]));

  const session = await mongoose.startSession();
  try {
    let result!: { count: any; adjustment: any };
    await session.withTransaction(async () => {
      const counted = [];
      for (const line of lines) {
        const balance = await StockBalance.findOne({ productId: line.productId, locationId }).session(session);
        counted.push({ productId: new Types.ObjectId(line.productId), expected: balance?.available ?? 0, counted: line.counted });
      }
      const differences = counted.filter(l => l.counted !== l.expected);

      let adjustment = null;
      if (differences.length) {
        for (const line of differences) {
          await StockBalance.findOneAndUpdate(
            { productId: line.productId, locationId },
            { $inc: { available: line.counted - line.expected } },
            { upsert: true, session },
          );
        }
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todaysCount = await Movement.countDocuments({ companyId, type: "adjustment", createdAt: { $gte: startOfDay } }).session(session);
        [adjustment] = await Movement.create([{
          folio: generateFolio("adjustment", todaysCount + 1),
          type: "adjustment",
          status: "completed",
          companyId: new Types.ObjectId(companyId),
          warehouseId: new Types.ObjectId(warehouseId),
          userId: new Types.ObjectId(auth.sub),
          reference: notes ? `Conteo físico ${location.code} · ${notes}` : `Conteo físico ${location.code}`,
          syncedAt: new Date(),
          // Surplus enters the location, shortage leaves it.
          lines: differences.map(l => {
            const diff = l.counted - l.expected;
            return diff > 0
              ? { productId: l.productId, quantity: diff, destinationLocationId: location._id }
              : { productId: l.productId, quantity: -diff, sourceLocationId: location._id };
          }),
        }], { session });
      }

      const [count] = await InventoryCount.create([{
        companyId: new Types.ObjectId(companyId),
        warehouseId: new Types.ObjectId(warehouseId),
        locationId: location._id,
        userId: new Types.ObjectId(auth.sub),
        lines: counted,
        accurate: differences.length === 0,
        adjustmentId: adjustment?._id,
        notes,
      }], { session });
      result = { count, adjustment };
    });

    await audit(auth, {
      action: "count", entity: "count", entityId: result.count._id, label: location.code,
      changes: result.count.lines
        .filter((l: any) => l.counted !== l.expected)
        .map((l: any) => ({ field: skus.get(String(l.productId)) ?? String(l.productId), from: l.expected, to: l.counted })),
    });
    return result;
  } finally {
    await session.endSession();
  }
}
