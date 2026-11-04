import mongoose, { Types, type ClientSession } from "mongoose";
import type { AuthPayload } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Company } from "../models/Company";
import { InventoryCount } from "../models/InventoryCount";
import { Location } from "../models/Location";
import { Movement } from "../models/Movement";
import { Product } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { moduleSettings } from "../config/modules";
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

interface CountedLine { productId: Types.ObjectId; expected: number; counted: number; before?: number }

/**
 * Sets each line's balance to the counted quantity and, when anything
 * differs, records an "adjustment" movement (folio AJU-…) with the
 * differences — so the kardex explains every stock change. `before` is the
 * balance right before applying (previous balance; difference = counted −
 * before; resulting balance = counted).
 */
async function applyAdjustment(
  session: ClientSession,
  params: { companyId: string; warehouseId: string; userId: string; location: { _id: Types.ObjectId; code: string }; notes?: string; lines: CountedLine[] },
) {
  const { companyId, warehouseId, userId, location, notes, lines } = params;
  const differences = lines.filter(l => l.counted !== l.before);
  if (!differences.length) return null;
  for (const line of differences) {
    await StockBalance.findOneAndUpdate(
      { productId: line.productId, locationId: location._id },
      { $inc: { available: line.counted - line.before! } },
      { upsert: true, session },
    );
  }
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todaysCount = await Movement.countDocuments({ companyId, type: "adjustment", createdAt: { $gte: startOfDay } }).session(session);
  const [adjustment] = await Movement.create([{
    folio: generateFolio("adjustment", todaysCount + 1),
    type: "adjustment",
    status: "completed",
    companyId: new Types.ObjectId(companyId),
    warehouseId: new Types.ObjectId(warehouseId),
    userId: new Types.ObjectId(userId),
    reference: notes ? `Conteo físico ${location.code} · ${notes}` : `Conteo físico ${location.code}`,
    syncedAt: new Date(),
    // Surplus enters the location, shortage leaves it.
    lines: differences.map(l => {
      const diff = l.counted - l.before!;
      return diff > 0
        ? { productId: l.productId, quantity: diff, destinationLocationId: location._id }
        : { productId: l.productId, quantity: -diff, sourceLocationId: location._id };
    }),
  }], { session });
  return adjustment;
}

async function skuMap(productIds: unknown[]) {
  return new Map((await Product.find({ _id: { $in: productIds } }).select("sku")).map(p => [String(p._id), p.sku]));
}

/**
 * Records a physical count of one location (Tesina §4.5.7). Within one
 * transaction it reads what the system expected and either applies the
 * adjustment right away or — when the inventory module requires approval
 * and the difference reaches the configured threshold — leaves the count
 * "pending" for a different authorized user, without touching stock.
 */
export async function recordCount(auth: AuthPayload, input: CountInput) {
  const { companyId } = auth;
  const { warehouseId, locationId, lines, notes } = input;

  const company = await Company.findById(companyId).lean() as any;
  const warehouse = await assertWarehouse(companyId, warehouseId);
  if (moduleSettings(company, "warehouses").blockInactiveWarehouses !== false && warehouse.state === "inactive") {
    throw new HttpError(422, "warehouse_inactive", "El almacén está inactivo: no admite conteos.");
  }
  const location = await Location.findOne({ _id: locationId, warehouseId, active: { $ne: false } });
  if (!location) throw new HttpError(422, "location_outside_warehouse", "La ubicación no pertenece al almacén seleccionado.");
  const productIds = lines.map(l => l.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new HttpError(422, "duplicate_product", "Cada producto debe aparecer una sola vez en el conteo.");
  }
  await assertProductsExist(companyId, productIds);
  const skus = await skuMap(productIds);
  const settings = moduleSettings(company, "inventory");

  const session = await mongoose.startSession();
  try {
    let result!: { count: any; adjustment: any };
    await session.withTransaction(async () => {
      const counted: CountedLine[] = [];
      for (const line of lines) {
        const balance = await StockBalance.findOne({ productId: line.productId, locationId }).session(session);
        const expected = balance?.available ?? 0;
        counted.push({ productId: new Types.ObjectId(line.productId), expected, counted: line.counted, before: expected });
      }
      const differences = counted.filter(l => l.counted !== l.expected);
      if (differences.length && settings.requireCountNotes && !notes?.trim()) {
        throw new HttpError(422, "notes_required", "Tu empresa exige anotar el motivo cuando el conteo no coincide con el sistema.");
      }
      const totalDiff = differences.reduce((s, l) => s + Math.abs(l.counted - l.expected), 0);
      const needsApproval = settings.requireApproval === true && totalDiff > 0 && totalDiff >= Number(settings.approvalThreshold);

      const adjustment = needsApproval
        ? null
        : await applyAdjustment(session, { companyId, warehouseId, userId: auth.sub, location, notes, lines: counted });

      const [count] = await InventoryCount.create([{
        companyId: new Types.ObjectId(companyId),
        warehouseId: new Types.ObjectId(warehouseId),
        locationId: location._id,
        userId: new Types.ObjectId(auth.sub),
        lines: needsApproval ? counted.map(({ before: _, ...l }) => l) : counted,
        accurate: differences.length === 0,
        adjustmentId: adjustment?._id,
        notes,
        status: needsApproval ? "pending" : "applied",
      }], { session });
      result = { count, adjustment };
    });

    await audit(auth, {
      action: "count", entity: "count", entityId: result.count._id,
      label: result.count.status === "pending" ? `${location.code} · pendiente de autorización` : location.code,
      changes: result.count.lines
        .filter((l: any) => l.counted !== l.expected)
        .map((l: any) => ({ field: skus.get(String(l.productId)) ?? String(l.productId), from: l.expected, to: l.counted })),
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Approves or rejects a pending (critical) adjustment. The reviewer must be
 * a different user from the one who counted. On approval the difference is
 * computed against the balance at that moment, so stock that moved while the
 * count waited isn't double-counted.
 */
export async function reviewCount(auth: AuthPayload, countId: string, decision: "approve" | "reject", note?: string) {
  const count = await InventoryCount.findOne({ _id: countId, companyId: auth.companyId });
  if (!count) throw new HttpError(404, "not_found", "Conteo no encontrado.");
  if (count.status !== "pending") throw new HttpError(422, "count_not_pending", "Este conteo ya fue revisado.");
  if (String(count.userId) === auth.sub) {
    throw new HttpError(422, "same_user", "Un ajuste crítico debe autorizarlo un usuario distinto de quien hizo el conteo.");
  }
  const location = await Location.findById(count.locationId);
  if (!location) throw new HttpError(404, "location_not_found", "La ubicación del conteo ya no existe.");
  const skus = await skuMap(count.lines.map(l => l.productId));

  if (decision === "reject") {
    if (!note || note.trim().length < 5) throw new HttpError(422, "reason_required", "Escribe el motivo del rechazo (mínimo 5 caracteres).");
    count.status = "rejected";
    count.reviewedBy = new Types.ObjectId(auth.sub);
    count.reviewedAt = new Date();
    count.reviewNote = note.trim();
    await count.save();
    await audit(auth, { action: "reject", entity: "count", entityId: count._id, label: location.code, reason: count.reviewNote });
    return { count, adjustment: null };
  }

  const session = await mongoose.startSession();
  try {
    let adjustment: any = null;
    await session.withTransaction(async () => {
      const lines: CountedLine[] = [];
      for (const l of count.lines) {
        const balance = await StockBalance.findOne({ productId: l.productId, locationId: location._id }).session(session);
        lines.push({ productId: l.productId as Types.ObjectId, expected: l.expected, counted: l.counted, before: balance?.available ?? 0 });
      }
      adjustment = await applyAdjustment(session, {
        companyId: auth.companyId, warehouseId: String(count.warehouseId), userId: auth.sub, location,
        notes: [count.notes, `autorizado por ${auth.name}`].filter(Boolean).join(" · "), lines,
      });
      count.set("lines", lines);
      count.status = "applied";
      count.adjustmentId = adjustment?._id;
      count.reviewedBy = new Types.ObjectId(auth.sub);
      count.reviewedAt = new Date();
      count.reviewNote = note?.trim() || undefined;
      await count.save({ session });
    });
    await audit(auth, {
      action: "approve", entity: "count", entityId: count._id, label: location.code, reason: note?.trim() || undefined,
      changes: count.lines
        .filter(l => l.counted !== l.before)
        .map(l => ({ field: skus.get(String(l.productId)) ?? String(l.productId), from: l.before, to: l.counted })),
    });
    return { count, adjustment };
  } finally {
    await session.endSession();
  }
}
