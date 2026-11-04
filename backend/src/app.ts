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
import { companyRouter } from "./routes/company.routes";
import { locationsRouter } from "./routes/locations.routes";
import { customersRouter } from "./routes/customers.routes";
import { usersRouter } from "./routes/users.routes";
import { auditRouter } from "./routes/audit.routes";
import { countsRouter } from "./routes/counts.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { reportsRouter } from "./routes/reports.routes";
import { rolesRouter } from "./routes/roles.routes";
import { groupsRouter } from "./routes/groups.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { env } from "./config/env";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan("dev"));

  // NFR: "protección contra excesos de requests" — light global rate limit.
  app.use(rateLimit({ windowMs: 60_000, limit: env.rateLimitPerMinute, standardHeaders: true, legacyHeaders: false }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/warehouses", warehousesRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/movements", movementsRouter);
  app.use("/api/modules", modulesRouter);
  app.use("/api/company", companyRouter);
  app.use("/api/locations", locationsRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/counts", countsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/roles", rolesRouter);
  app.use("/api/groups", groupsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
