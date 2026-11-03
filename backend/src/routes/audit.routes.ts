import { Router } from "express";
import { z } from "zod";
import { verifyJWT, managersOnly } from "../middleware/auth";
import { AuditLog, AUDIT_ENTITIES } from "../models/AuditLog";

export const auditRouter = Router();

auditRouter.use(verifyJWT, managersOnly);

const querySchema = z.object({
  entity: z.enum(AUDIT_ENTITIES).optional(),
  entityId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Pagination: pass the createdAt of the last entry received.
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

auditRouter.get("/", async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (q.entity) filter.entity = q.entity;
    if (q.entityId) filter.entityId = q.entityId;
    const createdAt: Record<string, Date> = {};
    if (q.from) createdAt.$gte = q.from;
    if (q.to) createdAt.$lte = q.to;
    if (q.before) createdAt.$lt = q.before;
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;
    const entries = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(q.limit);
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});
