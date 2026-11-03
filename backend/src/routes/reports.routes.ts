import { Router } from "express";
import { z } from "zod";
import { verifyJWT } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { MOVEMENT_TYPES } from "../models/Movement";
import { Warehouse } from "../models/Warehouse";
import { buildScope, lineEffects, onHandByProduct, round, scopedBalances, scopedMovements, type Scope } from "../services/analytics";
import { parsePeriod } from "../services/period";

// Row data for the portal's exportable reports (the browser builds the
// Excel/PDF files). 3PL clients get their own products only and never see
// which staff member made a movement.
export const reportsRouter = Router();

reportsRouter.use(verifyJWT);

const MAX_MOVEMENTS = 5000;

function userName(scope: Scope, user: any): string {
  return scope.isClient ? "—" : user?.name ?? "—";
}

function locationCode(scope: Scope, id: unknown): string | null {
  return id ? scope.locations.get(String(id))?.code ?? null : null;
}

// Kardex: every stock change of one product in the period, with opening
// balance and running balance. The opening balance is derived backwards from
// today's stock, so balances loaded without a movement (the demo seed) still
// reconcile.
reportsRouter.get("/kardex", async (req, res, next) => {
  try {
    const { productId, warehouseId } = z.object({ productId: z.string(), warehouseId: z.string().optional() }).parse(req.query);
    const period = parsePeriod(req.query, { defaultDays: 30, maxDays: 731 });
    const scope = await buildScope(req.auth!, warehouseId);
    const product = scope.products.get(productId);
    if (!product) throw new HttpError(404, "not_found", "Producto no encontrado.");

    const single: Scope = { ...scope, products: new Map([[productId, product]]), productIds: [product._id], isClient: scope.isClient };
    const [balances, movements] = await Promise.all([
      scopedBalances(single),
      scopedMovements(single, { from: period.from }, { "lines.productId": product._id }),
    ]);

    const current = onHandByProduct(balances).get(productId) ?? 0;
    const effectsOf = (m: (typeof movements)[number]) => m.lines.flatMap(line =>
      lineEffects(single, line).map(e => ({ ...e, line })));
    const netSinceFrom = movements.reduce((s, m) => s + effectsOf(m).reduce((t, e) => t + e.delta, 0), 0);
    const opening = current - netSinceFrom;

    let balance = opening, totalIn = 0, totalOut = 0;
    const rows = [];
    for (const m of movements) {
      if (m.createdAt > period.to) break;
      for (const e of effectsOf(m)) {
        balance += e.delta;
        if (e.delta > 0) totalIn += e.delta; else totalOut -= e.delta;
        rows.push({
          date: m.createdAt,
          folio: m.folio,
          type: m.type,
          reference: m.reference ?? null,
          user: userName(single, m.userId),
          location: locationCode(single, e.locationId),
          lot: e.line.lot ?? null,
          serial: e.line.serial ?? null,
          in: e.delta > 0 ? e.delta : 0,
          out: e.delta < 0 ? -e.delta : 0,
          balance,
        });
      }
    }

    res.json({
      product: { id: productId, sku: product.sku, name: product.name, unit: product.unit, cost: product.cost ?? null },
      period: { from: period.from, to: period.to },
      opening,
      closing: balance,
      totals: { in: totalIn, out: totalOut },
      rows,
    });
  } catch (err) {
    next(err);
  }
});

// Movements by period: one row per line, ready for a spreadsheet.
reportsRouter.get("/movements", async (req, res, next) => {
  try {
    const { warehouseId, type } = z.object({
      warehouseId: z.string().optional(),
      type: z.enum(MOVEMENT_TYPES).optional(),
    }).parse(req.query);
    const period = parsePeriod(req.query, { defaultDays: 30, maxDays: 366 });
    const scope = await buildScope(req.auth!, warehouseId);
    const movements = await scopedMovements(scope, period, type ? { type } : {});
    if (movements.length > MAX_MOVEMENTS) {
      throw new HttpError(422, "too_many_rows", `El periodo tiene más de ${MAX_MOVEMENTS} movimientos. Acórtalo o filtra por almacén o tipo.`);
    }
    const warehouses = new Map((await Warehouse.find({ companyId: scope.companyId }).lean()).map(w => [String(w._id), w.name]));

    const rows = movements.flatMap(m => m.lines.map(l => {
      const product = scope.products.get(String(l.productId));
      return {
        date: m.createdAt,
        capturedAt: m.capturedAt ?? null,
        folio: m.folio,
        type: m.type,
        warehouse: warehouses.get(String(m.warehouseId)) ?? null,
        user: userName(scope, m.userId),
        reference: m.reference ?? null,
        sku: product?.sku ?? null,
        product: product?.name ?? null,
        customer: product?.customerId?.code ?? null,
        unit: product?.unit ?? null,
        quantity: l.quantity,
        lot: l.lot ?? null,
        serial: l.serial ?? null,
        source: locationCode(scope, l.sourceLocationId),
        destination: locationCode(scope, l.destinationLocationId),
      };
    }));
    res.json({ period: { from: period.from, to: period.to }, rows });
  } catch (err) {
    next(err);
  }
});

// Stock by location, valued at unit cost where captured.
reportsRouter.get("/stock-by-location", async (req, res, next) => {
  try {
    const { warehouseId } = z.object({ warehouseId: z.string().optional() }).parse(req.query);
    const scope = await buildScope(req.auth!, warehouseId);
    const [balances, warehouses] = await Promise.all([
      scopedBalances(scope),
      Warehouse.find({ companyId: scope.companyId }).lean(),
    ]);
    const warehouseNames = new Map(warehouses.map(w => [String(w._id), w.name]));

    const rows = balances
      .filter(b => b.available !== 0)
      .map(b => {
        const product = scope.products.get(String(b.productId));
        const location = scope.locations.get(String(b.locationId));
        return {
          warehouse: warehouseNames.get(String(location?.warehouseId)) ?? null,
          location: location?.code ?? null,
          zone: location?.zone ?? null,
          aisle: location?.aisle ?? null,
          rack: location?.rack ?? null,
          position: location?.position ?? null,
          sku: product?.sku ?? null,
          product: product?.name ?? null,
          customer: product?.customerId?.code ?? null,
          unit: product?.unit ?? null,
          available: b.available,
          cost: product?.cost ?? null,
          value: product?.cost != null ? round(b.available * product.cost) : null,
        };
      })
      .sort((a, b) => `${a.warehouse}|${a.location}|${a.sku}`.localeCompare(`${b.warehouse}|${b.location}|${b.sku}`));
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});
