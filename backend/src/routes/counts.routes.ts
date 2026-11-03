import { Router } from "express";
import { z } from "zod";
import { verifyJWT, managersOnly } from "../middleware/auth";
import { InventoryCount } from "../models/InventoryCount";
import { recordCount } from "../services/countService";

export const countsRouter = Router();

countsRouter.use(verifyJWT, managersOnly);

countsRouter.get("/", async (req, res, next) => {
  try {
    const { warehouseId, limit } = z.object({
      warehouseId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (warehouseId) filter.warehouseId = warehouseId;
    const counts = await InventoryCount.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("locationId", "code")
      .populate("userId", "name")
      .populate("lines.productId", "sku name unit")
      .populate("adjustmentId", "folio");
    res.json({ counts });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  warehouseId: z.string(),
  locationId: z.string(),
  lines: z.array(z.object({ productId: z.string(), counted: z.number().min(0) })).min(1),
  notes: z.string().trim().max(200).optional(),
});

countsRouter.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const { count, adjustment } = await recordCount(req.auth!, body);
    res.status(201).json({ count, adjustment });
  } catch (err) {
    next(err);
  }
});
