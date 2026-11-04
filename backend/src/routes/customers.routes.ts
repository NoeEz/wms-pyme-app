import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission, staffOnly } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Customer } from "../models/Customer";
import { applyPatch, audit, updateAction } from "../services/audit";

// 3PL customers: third parties whose merchandise the company stores.
export const customersRouter = Router();

customersRouter.use(authenticate, staffOnly);

customersRouter.get("/", async (req, res, next) => {
  try {
    const customers = await Customer.find({ companyId: req.auth!.companyId }).sort({ name: 1 });
    res.json({ customers });
  } catch (err) {
    next(err);
  }
});

const fields = {
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(160),
  contactEmail: z.string().trim().email().nullable(),
};

customersRouter.post("/", requirePermission("admin.customers"), async (req, res, next) => {
  try {
    const body = z.object({ ...fields, contactEmail: fields.contactEmail.optional() }).parse(req.body);
    const customer = await Customer.create({ ...body, contactEmail: body.contactEmail ?? undefined, companyId: req.auth!.companyId });
    await audit(req.auth!, { action: "create", entity: "customer", entityId: customer._id, label: customer.code });
    res.status(201).json({ customer });
  } catch (err) {
    next(err);
  }
});

customersRouter.patch("/:id", requirePermission("admin.customers"), async (req, res, next) => {
  try {
    const body = z.object({ ...fields, active: z.boolean() }).partial().parse(req.body);
    const customer = await Customer.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!customer) throw new HttpError(404, "not_found", "Cliente no encontrado.");
    const patch = { ...body, ...(body.code ? { code: body.code.toUpperCase() } : {}) };
    const changes = applyPatch(customer, patch, ["code", "name", "contactEmail", "active"]);
    if (changes.length) {
      await customer.save();
      await audit(req.auth!, { action: updateAction(changes), entity: "customer", entityId: customer._id, label: customer.code, changes });
    }
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});
