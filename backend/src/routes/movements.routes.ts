import { Router, type Request } from "express";
import { z } from "zod";
import { verifyJWT, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Movement, MOVEMENT_TYPES } from "../models/Movement";
import { createMovement } from "../services/movementService";
import { scopedProductIds } from "../services/scope";

export const movementsRouter = Router();

movementsRouter.use(verifyJWT);

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
  type: z.enum(MOVEMENT_TYPES),
  reference: z.string().optional(),
  lines: z.array(lineSchema).min(1),
  clientId: z.string().min(8).max(64).optional(),
  capturedAt: z.string().datetime().optional(),
});

// 3PL client users only look; operating the warehouse is for staff.
movementsRouter.post("/", requireRole("operator", "supervisor", "admin"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const { movement, replayed } = await createMovement({
      companyId: req.auth!.companyId,
      warehouseId: body.warehouseId,
      userId: req.auth!.sub,
      type: body.type,
      reference: body.reference,
      lines: body.lines,
      clientId: body.clientId,
      capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
    });
    // 200 on a replay of an already-applied clientId, 201 when newly created.
    res.status(replayed ? 200 : 201).json({ movement, replayed });
  } catch (err) {
    next(err);
  }
});

movementsRouter.get("/", async (req, res, next) => {
  try {
    const { warehouseId, status } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (warehouseId) filter.warehouseId = warehouseId;
    if (status) filter.status = status;
    const ownIds = await clientProductIds(req);
    if (ownIds) filter["lines.productId"] = { $in: [...ownIds] };
    const movements = await Movement.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
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
    if (!movement) throw new HttpError(404, "not_found", "Movimiento no encontrado.");
    res.json({ movement: ownIds ? onlyOwnLines(movement, ownIds) : movement });
  } catch (err) {
    next(err);
  }
});
