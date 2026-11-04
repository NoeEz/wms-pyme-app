import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { InventoryCount, COUNT_STATUSES } from "../models/InventoryCount";
import { recordCount, reviewCount } from "../services/countService";
import { assertWarehouseAccess, warehouseFilter } from "../services/access";

// Physical counts and adjustments (Tesina §4.5.7).
export const countsRouter = Router();

countsRouter.use(authenticate);

countsRouter.get("/", requirePermission("inventory.count", "inventory.approve"), async (req, res, next) => {
  try {
    const { warehouseId, status, limit } = z.object({
      warehouseId: z.string().optional(),
      status: z.enum(COUNT_STATUSES).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (warehouseId) {
      assertWarehouseAccess(req.access!, warehouseId);
      filter.warehouseId = warehouseId;
    } else {
      const only = warehouseFilter(req.access!);
      if (only) filter.warehouseId = only;
    }
    if (status) filter.status = status;
    const counts = await InventoryCount.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("locationId", "code")
      .populate("userId", "name")
      .populate("reviewedBy", "name")
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

countsRouter.post("/", requirePermission("inventory.count"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    assertWarehouseAccess(req.access!, body.warehouseId);
    const { count, adjustment } = await recordCount(req.auth!, body);
    res.status(201).json({ count, adjustment });
  } catch (err) {
    next(err);
  }
});

// Critical adjustments waiting for authorization (inventory module setting).
countsRouter.post("/:id/:decision(approve|reject)", requirePermission("inventory.approve"), async (req, res, next) => {
  try {
    const { note } = z.object({ note: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const existing = await InventoryCount.findOne({ _id: req.params.id, companyId: req.auth!.companyId }).select("warehouseId");
    if (!existing) throw new HttpError(404, "not_found", "Conteo no encontrado.");
    assertWarehouseAccess(req.access!, existing.warehouseId);
    const result = await reviewCount(req.auth!, req.params.id, req.params.decision as "approve" | "reject", note);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
