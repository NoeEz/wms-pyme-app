import { Router, type Request } from "express";
import { z } from "zod";
import { authenticate, assertPermission, hasPermission, staffOnly } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Movement, MOVEMENT_TYPES, OPERATIONAL_MOVEMENT_TYPES } from "../models/Movement";
import { createMovement } from "../services/movementService";
import { scopedProductIds } from "../services/scope";
import { assertWarehouseAccess, canAccessWarehouse, warehouseFilter } from "../services/access";
import { Types } from "mongoose";

export const movementsRouter = Router();

movementsRouter.use(authenticate);

// A 3PL client user sees only movements touching its customer's products,
// and only those lines of each movement. Null for staff (no line filter).
async function clientProductIds(req: Request): Promise<Set<string> | null> {
  if (req.auth!.role !== "client") return null;
  return new Set((await scopedProductIds(req.auth!)).map(String));
}

function onlyOwnLines(movement: any, ownIds: Set<string>) {
  const obj = movement.toObject();
  obj.lines = obj.lines.filter((l: any) => ownIds.has(String(l.productId?._id ?? l.productId)));
  return obj;
}

const lineSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  sourceLocationId: z.string().optional(),
  destinationLocationId: z.string().optional(),
  lot: z.string().optional(),
  serial: z.string().optional(),
});

const createSchema = z.object({
  warehouseId: z.string(),
  destinationWarehouseId: z.string().optional(),
  type: z.enum(OPERATIONAL_MOVEMENT_TYPES),
  reference: z.string().optional(),
  lines: z.array(lineSchema).min(1),
  clientId: z.string().min(8).max(64).optional(),
  capturedAt: z.string().datetime().optional(),
});

// 3PL client users only look; operating the warehouse is for staff.
// Needs the permission of its type (inbound.create…) and access to the
// warehouse(s) involved — checked after the idempotent-replay lookup.
movementsRouter.post("/", staffOnly, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const authorize = () => {
      assertPermission(req, `${body.type}.create`);
      assertWarehouseAccess(req.access!, body.warehouseId);
      if (body.destinationWarehouseId) assertWarehouseAccess(req.access!, body.destinationWarehouseId);
    };
    const { movement, replayed } = await createMovement({
      companyId: req.auth!.companyId,
      warehouseId: body.warehouseId,
      destinationWarehouseId: body.destinationWarehouseId,
      userId: req.auth!.sub,
      type: body.type,
      reference: body.reference,
      lines: body.lines,
      clientId: body.clientId,
      capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
    }, authorize);
    // 200 on a replay of an already-applied clientId, 201 when newly created.
    res.status(replayed ? 200 : 201).json({ movement, replayed });
  } catch (err) {
    next(err);
  }
});

const listSchema = z.object({
  warehouseId: z.string().optional(),
  status: z.string().optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

movementsRouter.get("/", async (req, res, next) => {
  try {
    const { warehouseId, status, type, from, to, limit } = listSchema.parse(req.query);
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    const and: Record<string, unknown>[] = [];
    // A warehouse's movements include transfers that arrive from another one.
    if (warehouseId) {
      if (!Types.ObjectId.isValid(warehouseId)) throw new HttpError(400, "invalid_id", "Identificador inválido en la solicitud.");
      assertWarehouseAccess(req.access!, warehouseId);
      const id = new Types.ObjectId(warehouseId);
      and.push({ $or: [{ warehouseId: id }, { destinationWarehouseId: id }] });
    }
    const only = warehouseFilter(req.access!);
    if (only) and.push({ $or: [{ warehouseId: only }, { destinationWarehouseId: only }] });
    if (and.length) filter.$and = and;
    // Without history.view, staff see only what they captured themselves.
    if (req.auth!.role !== "client" && !hasPermission(req, "history.view")) filter.userId = req.auth!.sub;
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const ownIds = await clientProductIds(req);
    if (ownIds) filter["lines.productId"] = { $in: [...ownIds] };
    const movements = await Movement.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "name role")
      .populate("lines.sourceLocationId")
      .populate("lines.destinationLocationId");
    res.json({ movements: ownIds ? movements.map(m => onlyOwnLines(m, ownIds)) : movements });
  } catch (err) {
    next(err);
  }
});

movementsRouter.get("/:id", async (req, res, next) => {
  try {
    const ownIds = await clientProductIds(req);
    const movement = await Movement.findOne({
      _id: req.params.id,
      companyId: req.auth!.companyId,
      ...(ownIds ? { "lines.productId": { $in: [...ownIds] } } : {}),
    })
      .populate("userId", "name role")
      .populate("lines.productId")
      .populate("lines.sourceLocationId")
      .populate("lines.destinationLocationId");
    const visible = movement
      && (canAccessWarehouse(req.access!, movement.warehouseId) || (movement.destinationWarehouseId && canAccessWarehouse(req.access!, movement.destinationWarehouseId)))
      && (req.auth!.role === "client" || hasPermission(req, "history.view") || String((movement.userId as any)?._id ?? movement.userId) === req.auth!.sub);
    if (!movement || !visible) throw new HttpError(404, "not_found", "Movimiento no encontrado.");
    res.json({ movement: ownIds ? onlyOwnLines(movement, ownIds) : movement });
  } catch (err) {
    next(err);
  }
});
