import mongoose, { Types } from "mongoose";
import { HttpError } from "../middleware/errorHandler";
import { Company } from "../models/Company";
import { Location } from "../models/Location";
import { Movement, MovementType } from "../models/Movement";
import { Product } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { generateFolio } from "./folio";
import { ALL_MODULE_KEYS, MOVEMENT_TYPE_TO_MODULE } from "../config/modules";

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
  userId: string;
  type: MovementType;
  reference?: string;
  lines: CreateMovementLineInput[];
}

function bad(code: string, message: string): never {
  throw new HttpError(422, code, message);
}

export async function createMovement(input: CreateMovementInput) {
  const { companyId, warehouseId, userId, type, reference, lines } = input;

  const company = await Company.findById(companyId);
  const enabledModules = new Set(company?.enabledModules ?? ALL_MODULE_KEYS);
  if (!enabledModules.has(MOVEMENT_TYPE_TO_MODULE[type])) {
    throw new HttpError(403, "module_disabled", "Este tipo de movimiento no está habilitado para tu empresa. Pide a un administrador que lo active.");
  }

  if (!lines.length) bad("empty_movement", "El movimiento debe tener al menos un artículo.");
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

  // Every referenced location must belong to the selected warehouse.
  const locationIds = [...new Set(lines.flatMap(l => [l.sourceLocationId, l.destinationLocationId].filter(Boolean)))] as string[];
  if (locationIds.length) {
    const count = await Location.countDocuments({ _id: { $in: locationIds }, warehouseId });
    if (count !== locationIds.length) bad("location_outside_warehouse", "La ubicación no pertenece al almacén seleccionado.");
  }

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
          userId: new Types.ObjectId(userId),
          reference,
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
  const count = await Product.countDocuments({ _id: { $in: productIds }, companyId });
  if (count !== new Set(productIds).size) bad("product_not_found", "Uno o más productos no existen.");
}
