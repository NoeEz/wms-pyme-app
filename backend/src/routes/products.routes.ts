import { Router } from "express";
import { z } from "zod";
import { verifyJWT, managersOnly } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Product, TRACKING_MODES } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { Movement } from "../models/Movement";
import { assertCustomer, productScope } from "../services/scope";
import { applyPatch, audit, updateAction } from "../services/audit";

export const productsRouter = Router();

productsRouter.use(verifyJWT);

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ?includeInactive=true is for the portal's catalog screen; the app and
// pickers only ever see active products.
productsRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const filter: Record<string, unknown> = { ...productScope(req.auth!) };
    if (req.query.includeInactive !== "true") filter.active = { $ne: false };
    if (q) {
      const pattern = escapeRegex(q);
      filter.$or = [
        { name: { $regex: pattern, $options: "i" } },
        { sku: { $regex: pattern, $options: "i" } },
        { barcodeValues: q },
      ];
    }
    const products = await Product.find(filter).sort({ name: 1 });
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

productsRouter.get("/:id", async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, ...productScope(req.auth!) });
    if (!product) throw new HttpError(404, "not_found", "Producto no encontrado.");

    const balances = await StockBalance.find({ productId: product._id }).populate("locationId");
    const recentMovements = await Movement.find({ companyId: req.auth!.companyId, "lines.productId": product._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // A 3PL client must not see the other lines (other owners' products) of a shared movement.
    const visible = req.auth!.role === "client"
      ? recentMovements.map(m => ({ ...m, lines: m.lines.filter(l => String(l.productId) === String(product._id)) }))
      : recentMovements;

    res.json({ product, balances, recentMovements: visible });
  } catch (err) {
    next(err);
  }
});

const productFields = {
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  barcodeValues: z.array(z.string().trim().min(1).max(128)).max(20),
  unit: z.string().trim().min(1).max(16),
  tracking: z.enum(TRACKING_MODES),
  lowStockThreshold: z.number().min(0),
  cost: z.number().min(0).nullable(),
  customerId: z.string().nullable(),
};

const createSchema = z.object({
  ...productFields,
  barcodeValues: productFields.barcodeValues.default([]),
  unit: productFields.unit.default("pza"),
  tracking: productFields.tracking.default("none"),
  lowStockThreshold: productFields.lowStockThreshold.default(0),
  cost: productFields.cost.optional(),
  customerId: productFields.customerId.optional(),
});

const updateSchema = z.object({ ...productFields, active: z.boolean() }).partial();
const UPDATABLE = ["sku", "name", "barcodeValues", "unit", "tracking", "lowStockThreshold", "cost", "customerId", "active"] as const;

async function stockOf(productId: unknown): Promise<number> {
  const balances = await StockBalance.find({ productId });
  return balances.reduce((sum, b) => sum + b.available, 0);
}

productsRouter.post("/", managersOnly, async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    if (body.customerId) await assertCustomer(req.auth!.companyId, body.customerId);
    const product = await Product.create({ ...body, cost: body.cost ?? undefined, customerId: body.customerId ?? undefined, companyId: req.auth!.companyId });
    await audit(req.auth!, { action: "create", entity: "product", entityId: product._id, label: product.sku });
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

productsRouter.patch("/:id", managersOnly, async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const product = await Product.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!product) throw new HttpError(404, "not_found", "Producto no encontrado.");
    if (body.customerId) await assertCustomer(req.auth!.companyId, body.customerId);

    const trackingChanges = body.tracking !== undefined && body.tracking !== product.tracking;
    const deactivates = body.active === false && product.active !== false;
    if (trackingChanges || deactivates) {
      const stock = await stockOf(product._id);
      if (stock > 0 && trackingChanges) {
        throw new HttpError(422, "tracking_locked", "No se puede cambiar el seguimiento (lote/serie) de un producto con existencias.");
      }
      if (stock > 0 && deactivates) {
        throw new HttpError(422, "product_has_stock", "No se puede desactivar un producto con existencias. Da salida o ajusta su inventario primero.");
      }
    }

    const changes = applyPatch(product, body, UPDATABLE);
    if (changes.length) {
      await product.save();
      await audit(req.auth!, { action: updateAction(changes), entity: "product", entityId: product._id, label: product.sku, changes });
    }
    res.json({ product });
  } catch (err) {
    next(err);
  }
});
