import { Router } from "express";
import { z } from "zod";
import { verifyJWT, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Company } from "../models/Company";
import { MODULE_CATALOG, ALL_MODULE_KEYS, isValidModuleKey } from "../config/modules";
import { audit } from "../services/audit";

export const modulesRouter = Router();

modulesRouter.use(verifyJWT);

modulesRouter.get("/", async (req, res, next) => {
  try {
    const company = await Company.findById(req.auth!.companyId);
    if (!company) throw new HttpError(404, "not_found", "Empresa no encontrada.");
    const enabled = new Set(company.enabledModules ?? ALL_MODULE_KEYS);
    res.json({
      modules: MODULE_CATALOG.map(m => ({ ...m, enabled: enabled.has(m.key) })),
    });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  enabledModules: z.array(z.string()).refine(keys => keys.every(isValidModuleKey), {
    message: "Uno o más módulos no son válidos.",
  }),
});

modulesRouter.patch("/", requireRole("admin"), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const before = await Company.findById(req.auth!.companyId);
    if (!before) throw new HttpError(404, "not_found", "Empresa no encontrada.");
    const company = await Company.findByIdAndUpdate(
      req.auth!.companyId,
      { enabledModules: body.enabledModules },
      { new: true },
    );
    if (!company) throw new HttpError(404, "not_found", "Empresa no encontrada.");
    const was = [...(before.enabledModules ?? [])].sort();
    const now = [...(company.enabledModules ?? [])].sort();
    if (JSON.stringify(was) !== JSON.stringify(now)) {
      await audit(req.auth!, { action: "update", entity: "modules", entityId: company._id, changes: [{ field: "enabledModules", from: was, to: now }] });
    }
    const enabled = new Set(company.enabledModules ?? []);
    res.json({
      modules: MODULE_CATALOG.map(m => ({ ...m, enabled: enabled.has(m.key) })),
    });
  } catch (err) {
    next(err);
  }
});
