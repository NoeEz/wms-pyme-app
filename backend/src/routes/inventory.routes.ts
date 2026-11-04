import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Location } from "../models/Location";
import { StockBalance } from "../models/StockBalance";
import { Warehouse } from "../models/Warehouse";
import { assertWarehouse, scopedProductIds } from "../services/scope";
import { assertWarehouseAccess, warehouseFilter } from "../services/access";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

// Dispatching and transferring need to see what's available where.
inventoryRouter.get("/", requirePermission("inventory.view", "inbound.create", "outbound.create", "transfer.create", "inventory.count"), async (req, res, next) => {
  try {
    const { warehouseId, locationId, lowStock } = req.query as Record<string, string | undefined>;
    const companyId = req.auth!.companyId;

    const balanceFilter: Record<string, unknown> = { productId: { $in: await scopedProductIds(req.auth!) } };

    const only = warehouseFilter(req.access!);
    if (warehouseId || locationId || only) {
      if (warehouseId) {
        await assertWarehouse(companyId, warehouseId);
        assertWarehouseAccess(req.access!, warehouseId);
      }
      const locationFilter: Record<string, unknown> = warehouseId
        ? { warehouseId }
        : { warehouseId: { $in: (await Warehouse.find({ companyId, ...(only ? { _id: only } : {}) }).select("_id")).map(w => w._id) } };
      if (locationId) locationFilter._id = locationId;
      const locations = await Location.find(locationFilter).select("_id");
      if (locationId && !locations.length) throw new HttpError(404, "location_not_found", "La ubicación no existe en tu empresa.");
      balanceFilter.locationId = { $in: locations.map(l => l._id) };
    }

    const balances = await StockBalance.find(balanceFilter)
      .populate("productId")
      .populate("locationId");

    const withLowStock = lowStock === "true"
      ? balances.filter((b: any) => b.productId && b.available <= b.productId.lowStockThreshold)
      : balances;

    res.json({ balances: withLowStock });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get("/locations", async (req, res, next) => {
  try {
    const { warehouseId } = req.query as Record<string, string | undefined>;
    if (!warehouseId) return res.json({ locations: [] });
    await assertWarehouse(req.auth!.companyId, warehouseId);
    assertWarehouseAccess(req.access!, warehouseId);
    const locations = await Location.find({ warehouseId, active: { $ne: false } }).sort({ code: 1 });
    res.json({ locations });
  } catch (err) {
    next(err);
  }
});
