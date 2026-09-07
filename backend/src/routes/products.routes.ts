import { Router } from "express";
import { verifyJWT } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Product } from "../models/Product";
import { StockBalance } from "../models/StockBalance";
import { Movement } from "../models/Movement";

export const productsRouter = Router();

productsRouter.use(verifyJWT);

productsRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const filter: Record<string, unknown> = { companyId: req.auth!.companyId };
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { sku: { $regex: q, $options: "i" } },
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
    const product = await Product.findOne({ _id: req.params.id, companyId: req.auth!.companyId });
    if (!product) throw new HttpError(404, "not_found", "Producto no encontrado.");

    const balances = await StockBalance.find({ productId: product._id }).populate("locationId");
    const recentMovements = await Movement.find({ companyId: req.auth!.companyId, "lines.productId": product._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ product, balances, recentMovements });
  } catch (err) {
    next(err);
  }
});
