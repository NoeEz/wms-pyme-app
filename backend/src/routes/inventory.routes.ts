import { Router } from "express";
import { verifyJWT } from "../middleware/auth";
import { Location } from "../models/Location";
import { StockBalance } from "../models/StockBalance";

export const inventoryRouter = Router();

inventoryRouter.use(verifyJWT);

inventoryRouter.get("/", async (req, res, next) => {
  try {
    const { warehouseId, locationId, lowStock } = req.query as Record<string, string | undefined>;

    const locationFilter: Record<string, unknown> = {};
    if (warehouseId) locationFilter.warehouseId = warehouseId;
    if (locationId) locationFilter._id = locationId;

    const locations = warehouseId || locationId ? await Location.find(locationFilter) : [];
    const locationIds = locations.map(l => l._id);

    const balanceFilter: Record<string, unknown> = {};
    if (locationIds.length) balanceFilter.locationId = { $in: locationIds };

    const balances = await StockBalance.find(balanceFilter)
      .populate("productId")
      .populate("locationId");

    const companyId = req.auth!.companyId;
    const filtered = balances.filter((b: any) => b.productId?.companyId?.toString() === companyId);

    const withLowStock = lowStock === "true"
      ? filtered.filter((b: any) => b.productId && b.available <= b.productId.lowStockThreshold)
      : filtered;

    res.json({ balances: withLowStock });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get("/locations", async (req, res, next) => {
  try {
    const { warehouseId } = req.query as Record<string, string | undefined>;
    if (!warehouseId) return res.json({ locations: [] });
    const locations = await Location.find({ warehouseId }).sort({ code: 1 });
    res.json({ locations });
  } catch (err) {
    next(err);
  }
});
