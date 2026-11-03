import { Router } from "express";
import { z } from "zod";
import { verifyJWT, managersOnly } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Location } from "../models/Location";
import { StockBalance } from "../models/StockBalance";
import { Warehouse } from "../models/Warehouse";
import { applyPatch, audit, updateAction } from "../services/audit";
import { assertWarehouse } from "../services/scope";

// Location management for the web portal. The app keeps reading active
// locations through GET /inventory/locations.
export const locationsRouter = Router();

locationsRouter.use(verifyJWT);

locationsRouter.get("/", async (req, res, next) => {
  try {
    const { warehouseId, includeInactive } = req.query as Record<string, string | undefined>;
    const companyId = req.auth!.companyId;
    if (warehouseId) await assertWarehouse(companyId, warehouseId);
    const warehouseIds = warehouseId ? [warehouseId] : (await Warehouse.find({ companyId }).select("_id")).map(w => w._id);
    const filter: Record<string, unknown> = { warehouseId: { $in: warehouseIds } };
    if (includeInactive !== "true") filter.active = { $ne: false };
    const locations = await Location.find(filter).sort({ code: 1 });
    res.json({ locations });
  } catch (err) {
    next(err);
  }
});

const fields = {
  zone: z.string().trim().min(1).max(60),
  aisle: z.string().trim().min(1).max(60),
  rack: z.string().trim().min(1).max(60),
  position: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(40).transform(c => c.toUpperCase()),
};

locationsRouter.post("/", managersOnly, async (req, res, next) => {
  try {
    const body = z.object({ ...fields, warehouseId: z.string() }).parse(req.body);
    await assertWarehouse(req.auth!.companyId, body.warehouseId);
    const location = await Location.create(body);
    await audit(req.auth!, { action: "create", entity: "location", entityId: location._id, label: location.code });
    res.status(201).json({ location });
  } catch (err) {
    next(err);
  }
});

locationsRouter.patch("/:id", managersOnly, async (req, res, next) => {
  try {
    const body = z.object({ ...fields, active: z.boolean() }).partial().parse(req.body);
    const location = await Location.findById(req.params.id);
    if (!location) throw new HttpError(404, "location_not_found", "La ubicación no existe en tu empresa.");
    await assertWarehouse(req.auth!.companyId, location.warehouseId.toString()).catch(() => {
      throw new HttpError(404, "location_not_found", "La ubicación no existe en tu empresa.");
    });

    if (body.active === false && location.active !== false) {
      const withStock = await StockBalance.exists({ locationId: location._id, available: { $gt: 0 } });
      if (withStock) throw new HttpError(422, "location_has_stock", "No se puede desactivar una ubicación con existencias. Transfiere su mercancía primero.");
    }

    const changes = applyPatch(location, body, ["zone", "aisle", "rack", "position", "code", "active"]);
    if (changes.length) {
      await location.save();
      await audit(req.auth!, { action: updateAction(changes), entity: "location", entityId: location._id, label: location.code, changes });
    }
    res.json({ location });
  } catch (err) {
    next(err);
  }
});
