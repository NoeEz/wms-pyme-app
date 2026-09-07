import { Router } from "express";
import { verifyJWT } from "../middleware/auth";
import { Warehouse } from "../models/Warehouse";

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
