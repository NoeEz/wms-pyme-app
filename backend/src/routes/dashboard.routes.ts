import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { InventoryCount } from "../models/InventoryCount";
import { Movement, MOVEMENT_TYPES, type MovementType } from "../models/Movement";
import {
  buildScope, lineEffects, movementWarehouseMatch, onHandByProduct, percentile, round, scopedBalances, scopedMovements, stockStatus,
} from "../services/analytics";
import { daysOf, localDay, parsePeriod } from "../services/period";
import { moduleSettings } from "../config/modules";

// Monitoring KPIs for the web portal. Every role may read them; a 3PL client
// gets them computed over its own products only, without per-operator data.
// KPI definitions follow WERC DC Measures (inventory count accuracy by
// location, throughput) and SCOR (days of supply, turnover).
export const dashboardRouter = Router();

dashboardRouter.use(authenticate, requirePermission("reports.view"));

const DAY_MS = 86_400_000;
// A movement synced more than this after capture counts as "late" (offline).
const LATE_SYNC_SECONDS = 15 * 60;

dashboardRouter.get("/overview", async (req, res, next) => {
  try {
    const { warehouseId } = z.object({ warehouseId: z.string().optional() }).parse(req.query);
    const period = parsePeriod(req.query, { defaultDays: Number(moduleSettings(req.access!.company as any, "reports").defaultPeriodDays) || 30 });
    const scope = await buildScope(req, warehouseId);
    const [balances, movements] = await Promise.all([scopedBalances(scope), scopedMovements(scope, period)]);

    // ── Stock now ──
    const onHand = onHandByProduct(balances);
    let units = 0, value = 0, valuedUnits = 0, lowStock = 0, stockouts = 0;
    const alerts: { type: "stockout" | "low_stock"; productId: string; sku: string; name: string; onHand: number; threshold: number }[] = [];
    for (const [id, product] of scope.products) {
      if (product.active === false) continue;
      const qty = onHand.get(id) ?? 0;
      units += qty;
      if (product.cost != null) { value += qty * product.cost; valuedUnits += qty; }
      const threshold = product.lowStockThreshold ?? 0;
      const status = stockStatus(qty, threshold, new Date(), new Date(0));
      if (status === "stockout") stockouts++;
      if (status === "low") lowStock++;
      if (status === "stockout" || status === "low") {
        alerts.push({ type: status === "low" ? "low_stock" : "stockout", productId: id, sku: product.sku, name: product.name, onHand: qty, threshold });
      }
    }
    alerts.sort((a, b) => (a.type === b.type ? a.onHand - b.onHand : a.type === "stockout" ? -1 : 1));

    // ── Movements in the period ──
    const emptyTotals = () => ({ movements: 0, lines: 0, units: 0 });
    const totals = Object.fromEntries(MOVEMENT_TYPES.map(t => [t, emptyTotals()])) as Record<MovementType, ReturnType<typeof emptyTotals>>;
    const series = new Map(daysOf(period).map(day => [day, {
      day, inbound: 0, outbound: 0, transfer: 0, adjustment: 0, unitsIn: 0, unitsOut: 0,
    }]));
    const operators = new Map<string, { userId: string; name: string; movements: number; lines: number; units: number }>();
    const lags: number[] = [];
    let outboundUnits = 0, outboundValue = 0;

    for (const m of movements) {
      if (!m.lines.length) continue;
      const lineUnits = m.lines.reduce((s, l) => s + l.quantity, 0);
      const t = totals[m.type];
      t.movements++; t.lines += m.lines.length; t.units += lineUnits;

      const bucket = series.get(localDay(m.createdAt, period.tzOffset));
      if (bucket) {
        bucket[m.type]++;
        for (const line of m.lines) {
          for (const e of lineEffects(scope, line)) {
            if (m.type === "transfer") continue; // moves stock, doesn't add or remove it
            if (e.delta > 0) bucket.unitsIn += e.delta; else bucket.unitsOut -= e.delta;
          }
        }
      }

      if (m.type === "outbound") {
        outboundUnits += lineUnits;
        for (const l of m.lines) outboundValue += l.quantity * (scope.products.get(String(l.productId))?.cost ?? 0);
      }

      const user = m.userId as any;
      if (!scope.isClient && user?._id) {
        const key = String(user._id);
        const op = operators.get(key) ?? { userId: key, name: user.name, movements: 0, lines: 0, units: 0 };
        op.movements++; op.lines += m.lines.length; op.units += lineUnits;
        operators.set(key, op);
      }

      if (m.capturedAt) lags.push(Math.max(0, (m.createdAt.getTime() - m.capturedAt.getTime()) / 1000));
    }
    lags.sort((a, b) => a - b);

    // ── Inventory accuracy (physical counts in the period) ──
    let accuracy = null;
    if (!scope.isClient) {
      const countFilter: Record<string, unknown> = { companyId: scope.companyId, createdAt: { $gte: period.from, $lte: period.to } };
      if (scope.warehouseIds) countFilter.warehouseId = { $in: scope.warehouseIds };
      countFilter.status = { $ne: "pending" };
      const counts = await InventoryCount.find(countFilter).lean();
      const lines = counts.flatMap(c => c.lines);
      const accurateLines = lines.filter(l => l.counted === l.expected).length;
      accuracy = {
        counts: counts.length,
        accurateCounts: counts.filter(c => c.accurate).length,
        locationAccuracy: counts.length ? round(counts.filter(c => c.accurate).length / counts.length, 4) : null,
        lines: lines.length,
        lineAccuracy: lines.length ? round(accurateLines / lines.length, 4) : null,
        unitsDiscrepancy: lines.reduce((s, l) => s + Math.abs(l.counted - l.expected), 0),
      };
    }

    const avgDailyOutbound = outboundUnits / period.days;
    res.json({
      period: { from: period.from, to: period.to, days: period.days },
      stock: {
        units,
        skus: [...scope.products.values()].filter(p => p.active !== false && (onHand.get(String(p._id)) ?? 0) > 0).length,
        value: round(value),
        valuedUnitsPct: units ? round(valuedUnits / units, 4) : null,
        lowStock,
        stockouts,
        locationsInUse: new Set(balances.filter(b => b.available > 0).map(b => String(b.locationId))).size,
        locations: [...scope.locations.values()].filter(l => l.active !== false).length,
      },
      movements: { totals, series: [...series.values()] },
      operators: scope.isClient ? null : [...operators.values()].sort((a, b) => b.lines - a.lines),
      sync: {
        captured: lags.length,
        avgSeconds: lags.length ? round(lags.reduce((s, x) => s + x, 0) / lags.length, 1) : null,
        p95Seconds: lags.length ? round(percentile(lags, 0.95), 1) : null,
        maxSeconds: lags.length ? round(lags[lags.length - 1], 1) : null,
        late: lags.filter(x => x > LATE_SYNC_SECONDS).length,
        lateThresholdSeconds: LATE_SYNC_SECONDS,
      },
      accuracy,
      flow: {
        outboundUnits,
        outboundValue: round(outboundValue),
        avgDailyOutbound: round(avgDailyOutbound),
        daysOfSupply: avgDailyOutbound > 0 ? round(units / avgDailyOutbound, 1) : null,
        // Outbound in the period over current inventory — in money when costs
        // are captured, otherwise in units.
        turnover: value > 0 ? round(outboundValue / value, 2) : units > 0 ? round(outboundUnits / units, 2) : null,
        turnoverBasis: value > 0 ? "value" : "units",
      },
      alerts: alerts.slice(0, 20),
    });
  } catch (err) {
    next(err);
  }
});

// Per-product health table: stock, value, days of supply, last movement and
// status (stockout / low / slow-moving / ok).
dashboardRouter.get("/stock", async (req, res, next) => {
  try {
    const { warehouseId, days } = z.object({
      warehouseId: z.string().optional(),
      // Default: the reports module's "slowMovingDays" setting.
      days: z.coerce.number().int().min(1).max(365).default(Number(moduleSettings(req.access!.company as any, "reports").slowMovingDays) || 30),
    }).parse(req.query);
    const scope = await buildScope(req, warehouseId);
    const since = new Date(Date.now() - days * DAY_MS);
    const [balances, recent, lastMoves] = await Promise.all([
      scopedBalances(scope),
      scopedMovements(scope, { from: since }, { type: "outbound" }),
      Movement.aggregate<{ _id: unknown; last: Date }>([
        { $match: { companyId: scope.companyId, ...movementWarehouseMatch(scope) } },
        { $unwind: "$lines" },
        { $match: { "lines.productId": { $in: scope.productIds } } },
        { $group: { _id: "$lines.productId", last: { $max: "$createdAt" } } },
      ]),
    ]);

    const onHand = onHandByProduct(balances);
    const outbound = new Map<string, number>();
    for (const m of recent) for (const l of m.lines) outbound.set(String(l.productId), (outbound.get(String(l.productId)) ?? 0) + l.quantity);
    const lastAt = new Map(lastMoves.map(r => [String(r._id), r.last]));

    const products = [...scope.products.values()]
      .filter(p => p.active !== false)
      .map(p => {
        const id = String(p._id);
        const qty = onHand.get(id) ?? 0;
        const out = outbound.get(id) ?? 0;
        const avgDailyOut = out / days;
        const last = lastAt.get(id) ?? null;
        return {
          productId: id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          tracking: p.tracking,
          customer: p.customerId ? { id: String(p.customerId._id), code: p.customerId.code, name: p.customerId.name } : null,
          onHand: qty,
          threshold: p.lowStockThreshold ?? 0,
          cost: p.cost ?? null,
          value: p.cost != null ? round(qty * p.cost) : null,
          outboundUnits: out,
          avgDailyOut: round(avgDailyOut, 3),
          daysOfSupply: avgDailyOut > 0 ? round(qty / avgDailyOut, 1) : null,
          lastMovementAt: last,
          status: stockStatus(qty, p.lowStockThreshold ?? 0, last, since),
        };
      })
      .sort((a, b) => a.sku.localeCompare(b.sku));

    res.json({ days, products });
  } catch (err) {
    next(err);
  }
});
