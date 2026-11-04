import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Company } from "../models/Company";
import { applyPatch, audit } from "../services/audit";

// The logged-in user's own company (name and login code).
export const companyRouter = Router();

companyRouter.use(authenticate);

companyRouter.get("/", async (req, res, next) => {
  try {
    const company = await Company.findById(req.auth!.companyId).select("name slug");
    if (!company) throw new HttpError(404, "not_found", "Empresa no encontrada.");
    res.json({ company });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Usa de 2 a 40 letras minúsculas, números o guiones."),
}).partial();

companyRouter.patch("/", requirePermission("admin.company"), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const company = await Company.findById(req.auth!.companyId);
    if (!company) throw new HttpError(404, "not_found", "Empresa no encontrada.");
    const changes = applyPatch(company, body, ["name", "slug"]);
    if (changes.length) {
      await company.save();
      await audit(req.auth!, { action: "update", entity: "company", entityId: company._id, label: company.slug, changes });
    }
    res.json({ company: { _id: company._id, name: company.name, slug: company.slug } });
  } catch (err) {
    next(err);
  }
});
