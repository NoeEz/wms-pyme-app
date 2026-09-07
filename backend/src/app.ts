import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.routes";
import { warehousesRouter } from "./routes/warehouses.routes";
import { productsRouter } from "./routes/products.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { movementsRouter } from "./routes/movements.routes";
import { modulesRouter } from "./routes/modules.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan("dev"));

  // NFR: "protección contra excesos de requests" — light global rate limit.
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/warehouses", warehousesRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/movements", movementsRouter);
  app.use("/api/modules", modulesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
