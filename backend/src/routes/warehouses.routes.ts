import { Router } from "express";
import { z } from "zod";
import { verifyJWT, adminOnly } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Warehouse } from "../models/Warehouse";
import { applyPatch, audit, updateAction } from "../services/audit";

export const warehousesRouter = Router();

warehousesRouter.use(verifyJWT);

warehousesRouter.get("/", async (req, res, next) => {
  try {
    const warehouses = await Warehouse.find({ companyId: req.auth!.companyId }).sort({ name: 1 });
    res.json({ warehouses });
  } catch (err) {
    next(err);
  }
});

const fields = {
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  state: z.enum(["active", "inactive"]),
};

warehousesRouter.post("/", adminOnly, async (req, res, next) => {
  try {
    const body = z.object({ ...fields, state: fields.state.default("active") }).parse(req.body);
    const warehouse = await Warehouse.create({ ...body, companyId: req.auth!.companyId });
    await audit(req.auth!, { action: "create", entity: "warehouse", entityId: warehouse._id, label: warehouse.name });
    res.status(201).json({ warehouse });
  } catch (err) {
    next(err);
  }
});

warehousesRouter.patch("/:id", adminOnly, async (req, res, next) => {
  try {
    const body = z.object(fields).partial().parse(req.body);
    const warehouse = await Warehouse.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!warehouse) throw new HttpError(404, "warehouse_not_found", "El almacén no existe en tu empresa.");
    const changes = applyPatch(warehouse, body, ["name", "city", "state"]);
    if (changes.length) {
      await warehouse.save();
      await audit(req.auth!, { action: updateAction(changes, "state"), entity: "warehouse", entityId: warehouse._id, label: warehouse.name, changes });
    }
    res.json({ warehouse });
  } catch (err) {
    next(err);
  }
});
