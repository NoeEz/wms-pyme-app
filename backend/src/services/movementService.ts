import mongoose, { Types } from "mongoose";
import { HttpError } from "../middleware/errorHandler";
import { Company } from "../models/Company";
import { Location } from "../models/Location";
import { Movement, OperationalMovementType } from "../models/Movement";
import { Product } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { generateFolio } from "./folio";
import { assertWarehouse } from "./scope";
import { MOVEMENT_TYPE_TO_MODULE, enabledModuleSet, moduleSettings } from "../config/modules";

export interface CreateMovementLineInput {
  productId: string;
  quantity: number;
  sourceLocationId?: string;
  destinationLocationId?: string;
  lot?: string;
  serial?: string;
}

export interface CreateMovementInput {
  companyId: string;
  warehouseId: string;
  /** Transfers only: destination warehouse when different from warehouseId. */
  destinationWarehouseId?: string;
  userId: string;
  type: OperationalMovementType;
  reference?: string;
  lines: CreateMovementLineInput[];
  clientId?: string;
  capturedAt?: Date;
}

function bad(code: string, message: string): never {
  throw new HttpError(422, code, message);
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * `authorize` runs after the idempotent-replay check and before anything is
 * applied: a movement already applied is returned as-is even if the user's
 * permissions changed since (the offline queue retrying it must not see it
 * "rejected" when it actually went through).
 */
export async function createMovement(input: CreateMovementInput, authorize?: () => void | Promise<void>) {
  const { companyId, clientId } = input;

  // Idempotent replay: the device already sent this movement (e.g. the
  // response was lost on a flaky connection). Return it as-is, before any
  // validation — re-validating would fail on its own serials/stock changes.
  if (clientId) {
    const existing = await Movement.findOne({ companyId, clientId });
    if (existing) return { movement: existing, replayed: true };
  }

  try {
    await authorize?.();
    return { movement: await applyMovement(input), replayed: false };
  } catch (err) {
    // Two concurrent retries with the same clientId: the unique index lets
    // only one transaction commit; the loser returns the winner's movement.
    if (clientId && isDuplicateKeyError(err)) {
      const existing = await Movement.findOne({ companyId, clientId });
      if (existing) return { movement: existing, replayed: true };
    }
    throw err;
  }
}

async function applyMovement(input: CreateMovementInput) {
  const { companyId, warehouseId, userId, type, reference, lines, clientId, capturedAt } = input;

  const company = await Company.findById(companyId);
  const moduleKey = MOVEMENT_TYPE_TO_MODULE[type];
  if (!enabledModuleSet(company).has(moduleKey)) {
    throw new HttpError(403, "module_disabled", "Este tipo de movimiento no está habilitado para tu empresa. Pide a un administrador que lo active.");
  }
  const settings = moduleSettings(company, moduleKey);
  if (settings.requireReference && !reference?.trim()) {
    bad("reference_required", "Tu empresa exige una referencia (documento o motivo) para este tipo de movimiento.");
  }

  if (!lines.length) bad("empty_movement", "El movimiento debe tener al menos un artículo.");
  const blockInactive = moduleSettings(company, "warehouses").blockInactiveWarehouses !== false;
  const origin = await assertWarehouse(companyId, warehouseId);
  if (blockInactive && origin.state === "inactive") bad("warehouse_inactive", "El almacén está inactivo: no admite movimientos.");
  const maxPerLine = Number(settings.maxQuantityPerLine) || 0;
  if (maxPerLine > 0 && lines.some(l => l.quantity > maxPerLine)) {
    bad("quantity_limit", `La cantidad por línea no puede pasar de ${maxPerLine}. Si es correcta, divídela o pide a un administrador que ajuste el límite.`);
  }
  const destinationWarehouseId = input.destinationWarehouseId && input.destinationWarehouseId !== warehouseId
    ? input.destinationWarehouseId
    : undefined;
  if (destinationWarehouseId) {
    if (type !== "transfer") bad("invalid_destination_warehouse", "Solo las transferencias pueden tener un almacén destino.");
    if (!settings.allowInterWarehouse) bad("inter_warehouse_disabled", "Tu empresa no permite transferencias entre almacenes.");
    const destination = await assertWarehouse(companyId, destinationWarehouseId);
    if (blockInactive && destination.state === "inactive") bad("warehouse_inactive", "El almacén destino está inactivo: no admite movimientos.");
  }
  await assertProductsExist(companyId, lines.map(l => l.productId));
  if (type === "inbound" && settings.requireLot) {
    const lotTracked = await Product.find({ _id: { $in: lines.map(l => l.productId) }, tracking: "lot" }).select("_id");
    const needLot = new Set(lotTracked.map(p => String(p._id)));
    if (lines.some(l => needLot.has(l.productId) && !l.lot?.trim())) {
      bad("lot_required", "Tu empresa exige el número de lote en productos con seguimiento por lote.");
    }
  }
  for (const line of lines) {
    if (!(line.quantity > 0)) bad("invalid_quantity", "La cantidad debe ser mayor que cero.");
    if (type === "inbound" && !line.destinationLocationId) bad("missing_destination", "Falta la ubicación destino.");
    if (type === "outbound" && !line.sourceLocationId) bad("missing_origin", "Falta la ubicación origen.");
    if (type === "transfer" && (!line.sourceLocationId || !line.destinationLocationId)) {
      bad("missing_locations", "La transferencia requiere origen y destino.");
    }
    if (type === "transfer" && line.sourceLocationId === line.destinationLocationId) {
      bad("same_location", "El origen y destino no pueden ser la misma ubicación.");
    }
  }

  // Origins must belong to the selected warehouse; destinations too, or to
  // the destination warehouse of an inter-warehouse transfer.
  const unique = (ids: (string | undefined)[]) => [...new Set(ids.filter(Boolean))] as string[];
  const checkLocations = async (ids: string[], inWarehouse: string) => {
    if (!ids.length) return;
    const count = await Location.countDocuments({ _id: { $in: ids }, warehouseId: inWarehouse, active: { $ne: false } });
    if (count !== ids.length) bad("location_outside_warehouse", "La ubicación no pertenece al almacén seleccionado.");
  };
  await checkLocations(unique(lines.map(l => l.sourceLocationId)), warehouseId);
  await checkLocations(unique(lines.map(l => l.destinationLocationId)), destinationWarehouseId ?? warehouseId);

  // Serial numbers can't repeat within the same movement, nor duplicate one
  // already recorded for that product in a previous movement.
  const serials = lines.map(l => l.serial).filter(Boolean) as string[];
  if (new Set(serials).size !== serials.length) {
    bad("duplicate_serial", "El número de serie no puede repetirse en el mismo movimiento.");
  }
  if (serials.length) {
    const clash = await Movement.findOne({ companyId, "lines.serial": { $in: serials } });
    if (clash) bad("duplicate_serial", "El número de serie ya fue registrado en otro movimiento.");
  }

  const session = await mongoose.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      // Outbound with "protectMinimumStock": the product's total stock in the
      // company may not end below its minimum.
      if (type === "outbound" && settings.protectMinimumStock) {
        const requested = new Map<string, number>();
        for (const l of lines) requested.set(l.productId, (requested.get(l.productId) ?? 0) + l.quantity);
        const products = await Product.find({ _id: { $in: [...requested.keys()] } }).select("sku lowStockThreshold").session(session);
        for (const product of products) {
          if (!(product.lowStockThreshold > 0)) continue;
          const balances = await StockBalance.find({ productId: product._id }).session(session);
          const total = balances.reduce((s, b) => s + b.available, 0);
          if (total - requested.get(String(product._id))! < product.lowStockThreshold) {
            bad("below_minimum", `La salida dejaría ${product.sku} por debajo de su stock mínimo (${product.lowStockThreshold}).`);
          }
        }
      }

      // Outbound / transfer: check available stock before touching anything.
      for (const line of lines) {
        if (type === "outbound" || type === "transfer") {
          const balance = await StockBalance.findOne({ productId: line.productId, locationId: line.sourceLocationId }).session(session);
          const available = balance?.available ?? 0;
          if (available < line.quantity) {
            bad("insufficient_stock", "La existencia disponible es insuficiente para esta salida.");
          }
        }
      }

      for (const line of lines) {
        if (type === "inbound" || type === "transfer") {
          await StockBalance.findOneAndUpdate(
            { productId: line.productId, locationId: line.destinationLocationId },
            { $inc: { available: line.quantity } },
            { upsert: true, session },
          );
        }
        if (type === "outbound" || type === "transfer") {
          await StockBalance.findOneAndUpdate(
            { productId: line.productId, locationId: line.sourceLocationId },
            { $inc: { available: -line.quantity } },
            { session },
          );
        }
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todaysCount = await Movement.countDocuments({ companyId, type, createdAt: { $gte: startOfDay } }).session(session);
      const folio = generateFolio(type, todaysCount + 1);

      const [movement] = await Movement.create(
        [{
          folio,
          type,
          status: "completed",
          companyId: new Types.ObjectId(companyId),
          warehouseId: new Types.ObjectId(warehouseId),
          destinationWarehouseId: destinationWarehouseId ? new Types.ObjectId(destinationWarehouseId) : undefined,
          userId: new Types.ObjectId(userId),
          reference,
          clientId,
          capturedAt,
          syncedAt: new Date(),
          lines: lines.map(l => ({
            productId: new Types.ObjectId(l.productId),
            quantity: l.quantity,
            sourceLocationId: l.sourceLocationId ? new Types.ObjectId(l.sourceLocationId) : undefined,
            destinationLocationId: l.destinationLocationId ? new Types.ObjectId(l.destinationLocationId) : undefined,
            lot: l.lot,
            serial: l.serial,
          })),
        }],
        { session },
      );
      created = movement;
    });
    return created;
  } finally {
    await session.endSession();
  }
}

export async function assertProductsExist(companyId: string, productIds: string[]): Promise<void> {
  const count = await Product.countDocuments({ _id: { $in: productIds }, companyId, active: { $ne: false } });
  if (count !== new Set(productIds).size) bad("product_not_found", "Uno o más productos no existen.");
}
