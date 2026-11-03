import { Router } from "express";
import { z } from "zod";
import { verifyJWT } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Movement, MOVEMENT_TYPES } from "../models/Movement";
import { createMovement } from "../services/movementService";

export const movementsRouter = Router();

movementsRouter.use(verifyJWT);

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

movementsRouter.post("/", async (req, res, next) => {
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
    const movements = await Movement.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("userId", "name role")
      .populate("lines.sourceLocationId")
      .populate("lines.destinationLocationId");
    res.json({ movements });
  } catch (err) {
    next(err);
  }
});

movementsRouter.get("/:id", async (req, res, next) => {
  try {
    const movement = await Movement.findOne({ _id: req.params.id, companyId: req.auth!.companyId })
      .populate("userId", "name role")
      .populate("lines.productId")
      .populate("lines.sourceLocationId")
      .populate("lines.destinationLocationId");
    if (!movement) throw new HttpError(404, "not_found", "Movimiento no encontrado.");
    res.json({ movement });
  } catch (err) {
    next(err);
  }
});
