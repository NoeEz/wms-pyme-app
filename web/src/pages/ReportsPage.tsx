import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage, qs } from "../lib/api";
import { useSession } from "../lib/auth";
import { useProducts, useWarehouseFilter, useWarehouses } from "../lib/data";
import { exportName, type ExportColumn } from "../lib/export";
import { fmtDateTime, fmtMoney, fmtNumber, MOVEMENT_LABEL, periodParams, startOfDayAgo, toDateInput } from "../lib/format";
import type { MovementType } from "../lib/types";
import { Card, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Select, Table, td, th } from "../components/ui";
import { ExportButtons } from "../components/ExportButtons";
import { MovementTypeBadge } from "./MovementsPage";

// Row shapes of /api/reports/* (see backend/src/routes/reports.routes.ts).
interface KardexRow { date: string; folio: string; type: MovementType; reference: string | null; user: string; location: string | null; lot: string | null; serial: string | null; in: number; out: number; balance: number }
interface Kardex { product: { id: string; sku: string; name: string; unit: string; cost: number | null }; opening: number; closing: number; totals: { in: number; out: number }; rows: KardexRow[] }
interface MovementRow { date: string; capturedAt: string | null; folio: string; type: MovementType; warehouse: string | null; user: string; reference: string | null; sku: string | null; product: string | null; customer: string | null; unit: string | null; quantity: number; lot: string | null; serial: string | null; source: string | null; destination: string | null }
interface StockLocationRow { warehouse: string | null; location: string | null; zone: string | null; aisle: string | null; rack: string | null; position: string | null; sku: string | null; product: string | null; customer: string | null; unit: string | null; available: number; cost: number | null; value: number | null }

const TABS = [
  { key: "kardex", label: "Kardex por producto" },
  { key: "movimientos", label: "Movimientos por periodo" },
  { key: "existencias", label: "Existencias por ubicación" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function usePeriod(defaultDays = 30) {
  const [fromDay, setFromDay] = useState(toDateInput(startOfDayAgo(defaultDays - 1)));
  const [toDay, setToDay] = useState(toDateInput(new Date()));
  const fields = (
    <>
      <Field label="Desde"><Input type="date" value={fromDay} max={toDay} onChange={e => setFromDay(e.target.value)} /></Field>
      <Field label="Hasta"><Input type="date" value={toDay} min={fromDay} onChange={e => setToDay(e.target.value)} /></Field>
    </>
  );
  return { fromDay, toDay, params: periodParams(fromDay, toDay), fields };
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(t => t.key === params.get("reporte")) ? params.get("reporte") : "kardex") as Tab;
  return (
    <>
      <PageHeader title="Reportes" description="Consulta y exporta a Excel o PDF." />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
        {TABS.map(t => (
          <button
            key={t.key} role="tab" aria-selected={tab === t.key}
            onClick={() => setParams(p => { p.set("reporte", t.key); return p; }, { replace: true })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >{t.label}</button>
        ))}
      </div>
      {tab === "kardex" && <KardexReport />}
      {tab === "movimientos" && <MovementsReport />}
      {tab === "existencias" && <StockByLocationReport />}
    </>
  );
}

function useScopeLabel() {
  const session = useSession();
  const { warehouseId } = useWarehouseFilter();
  const { data: warehouses } = useWarehouses();
  return `${session.company.name} · ${warehouses?.find(w => w._id === warehouseId)?.name ?? "Todos los almacenes"}`;
}

function KardexReport() {
  const [params, setParams] = useSearchParams();
  const productId = params.get("producto") ?? "";
  const { warehouseId } = useWarehouseFilter();
  const products = useProducts(true);
  const period = usePeriod(30);
  const scope = useScopeLabel();
  const query = useQuery({
    queryKey: ["reports", "kardex", { productId, warehouseId, from: period.fromDay, to: period.toDay }],
    queryFn: () => api.get<Kardex>(`/reports/kardex${qs({ productId, warehouseId, ...period.params })}`),
    enabled: !!productId,
  });
  const k = query.data;
  const columns: ExportColumn<KardexRow>[] = [
    { header: "Fecha", value: r => new Date(r.date), kind: "datetime", width: 18 },
    { header: "Folio", value: r => r.folio, width: 18 },
    { header: "Tipo", value: r => MOVEMENT_LABEL[r.type] },
    { header: "Ubicación", value: r => r.location, width: 14 },
    { header: "Lote / serie", value: r => [r.lot, r.serial].filter(Boolean).join(" · "), width: 16 },
    { header: "Usuario", value: r => r.user, width: 18 },
    { header: "Entrada", value: r => r.in || null, kind: "number" },
    { header: "Salida", value: r => r.out || null, kind: "number" },
    { header: "Saldo", value: r => r.balance, kind: "number" },
  ];

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <Field label="Producto" className="min-w-72 flex-1">
          <Select value={productId} onChange={e => setParams(p => { p.set("producto", e.target.value); return p; }, { replace: true })}>
            <option value="">Selecciona un producto…</option>
            {products.data?.map(p => <option key={p._id} value={p._id}>{p.sku} · {p.name}</option>)}
          </Select>
        </Field>
        {period.fields}
        {k && (
          <div className="flex gap-2 pb-0.5">
            <ExportButtons spec={() => ({
              fileName: exportName("kardex", k.product.sku),
              title: `Kardex ${k.product.sku} · ${k.product.name}`,
              subtitle: `${scope} · ${period.fromDay} a ${period.toDay} · Saldo inicial ${k.opening} · Saldo final ${k.closing} ${k.product.unit}`,
              columns, rows: k.rows,
            })} />
          </div>
        )}
      </div>
      {!productId ? <EmptyState icon="reports" title="Elige un producto" description="El kardex muestra cada entrada y salida con su saldo." /> : query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorBox message={errorMessage(query.error)} /></div> : k && (
        <>
          <dl className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            {[["Saldo inicial", k.opening], ["Entradas", k.totals.in], ["Salidas", k.totals.out], ["Saldo final", k.closing]].map(([label, v]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-xs text-slate-500">{label}</dt><dd className="tabular text-lg font-semibold">{fmtNumber(v as number)} <span className="text-xs font-normal text-slate-400">{k.product.unit}</span></dd></div>
            ))}
          </dl>
          {k.rows.length === 0 ? <EmptyState title="Sin movimientos en el periodo" /> : (
            <Table>
              <thead><tr><th className={th}>Fecha</th><th className={th}>Folio</th><th className={th}>Tipo</th><th className={th}>Ubicación</th><th className={th}>Lote / serie</th><th className={th}>Usuario</th><th className={`${th} text-right`}>Entrada</th><th className={`${th} text-right`}>Salida</th><th className={`${th} text-right`}>Saldo</th></tr></thead>
              <tbody>
                {k.rows.map((r, i) => (
                  <tr key={i}>
                    <td className={td}>{fmtDateTime(r.date)}</td>
                    <td className={`${td} font-mono text-xs`}>{r.folio}</td>
                    <td className={td}><MovementTypeBadge type={r.type} /></td>
                    <td className={`${td} font-mono text-xs`}>{r.location}</td>
                    <td className={`${td} text-xs`}>{[r.lot, r.serial].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={td}>{r.user}</td>
                    <td className={`${td} tabular text-right text-emerald-700`}>{r.in ? fmtNumber(r.in) : ""}</td>
                    <td className={`${td} tabular text-right text-red-700`}>{r.out ? fmtNumber(r.out) : ""}</td>
                    <td className={`${td} tabular text-right font-medium`}>{fmtNumber(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </Card>
  );
}

function MovementsReport() {
  const { warehouseId } = useWarehouseFilter();
  const isClient = useSession().user.role === "client";
  const [type, setType] = useState<MovementType | "">("");
  const period = usePeriod(30);
  const scope = useScopeLabel();
  const query = useQuery({
    queryKey: ["reports", "movements", { warehouseId, type, from: period.fromDay, to: period.toDay }],
    queryFn: () => api.get<{ rows: MovementRow[] }>(`/reports/movements${qs({ warehouseId, type, ...period.params })}`).then(r => r.rows),
  });
  const rows = query.data ?? [];
  const columns: ExportColumn<MovementRow>[] = [
    { header: "Fecha", value: r => new Date(r.date), kind: "datetime", width: 18 },
    { header: "Folio", value: r => r.folio, width: 18 },
    { header: "Tipo", value: r => MOVEMENT_LABEL[r.type] },
    { header: "Almacén", value: r => r.warehouse, width: 20 },
    ...(isClient ? [] : [{ header: "Usuario", value: (r: MovementRow) => r.user, width: 18 }]),
    { header: "SKU", value: r => r.sku, width: 14 },
    { header: "Producto", value: r => r.product, width: 28 },
    { header: "Cantidad", value: r => r.quantity, kind: "number" },
    { header: "Origen", value: r => r.source, width: 14 },
    { header: "Destino", value: r => r.destination, width: 14 },
    { header: "Lote", value: r => r.lot },
    { header: "Serie", value: r => r.serial },
    { header: "Referencia", value: r => r.reference, width: 24 },
  ];

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        {period.fields}
        <Field label="Tipo">
          <Select value={type} onChange={e => setType(e.target.value as MovementType | "")} className="w-44">
            <option value="">Todos</option>
            {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map(t => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
          </Select>
        </Field>
        <div className="flex gap-2 pb-0.5">
          <ExportButtons disabled={!rows.length} spec={() => ({
            fileName: exportName("movimientos-periodo"), title: "Movimientos por periodo",
            subtitle: `${scope} · ${period.fromDay} a ${period.toDay}${type ? ` · ${MOVEMENT_LABEL[type]}` : ""}`, columns, rows,
          })} />
        </div>
      </div>
      {query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorBox message={errorMessage(query.error)} /></div> : !rows.length ? <EmptyState title="Sin movimientos en el periodo" /> : (
        <Table>
          <thead><tr><th className={th}>Fecha</th><th className={th}>Folio</th><th className={th}>Tipo</th><th className={th}>Producto</th><th className={`${th} text-right`}>Cantidad</th><th className={th}>Origen → destino</th>{!isClient && <th className={th}>Usuario</th>}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={td}>{fmtDateTime(r.date)}</td>
                <td className={`${td} font-mono text-xs`}>{r.folio}</td>
                <td className={td}><MovementTypeBadge type={r.type} /></td>
                <td className={td}><p>{r.product}</p><p className="font-mono text-xs text-slate-500">{r.sku}{r.lot ? ` · lote ${r.lot}` : ""}{r.serial ? ` · serie ${r.serial}` : ""}</p></td>
                <td className={`${td} tabular text-right`}>{fmtNumber(r.quantity)}</td>
                <td className={`${td} font-mono text-xs`}>{r.source ?? "—"} → {r.destination ?? "—"}</td>
                {!isClient && <td className={td}>{r.user}</td>}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function StockByLocationReport() {
  const { warehouseId } = useWarehouseFilter();
  const scope = useScopeLabel();
  const query = useQuery({
    queryKey: ["reports", "stock-by-location", { warehouseId }],
    queryFn: () => api.get<{ rows: StockLocationRow[] }>(`/reports/stock-by-location${qs({ warehouseId })}`).then(r => r.rows),
  });
  const rows = query.data ?? [];
  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const columns: ExportColumn<StockLocationRow>[] = [
    { header: "Almacén", value: r => r.warehouse, width: 20 },
    { header: "Ubicación", value: r => r.location, width: 14 },
    { header: "Zona", value: r => r.zone },
    { header: "Pasillo", value: r => r.aisle },
    { header: "Rack", value: r => r.rack },
    { header: "Posición", value: r => r.position },
    { header: "SKU", value: r => r.sku, width: 14 },
    { header: "Producto", value: r => r.product, width: 28 },
    { header: "Cliente", value: r => r.customer },
    { header: "Existencia", value: r => r.available, kind: "number" },
    { header: "Costo", value: r => r.cost, kind: "money" },
    { header: "Valor", value: r => r.value, kind: "money" },
  ];

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <p className="text-sm text-slate-600">{scope} · <span className="font-medium">{fmtMoney(total)}</span> valuado</p>
        <div className="flex gap-2">
          <ExportButtons disabled={!rows.length} spec={() => ({ fileName: exportName("existencias-ubicacion"), title: "Existencias por ubicación", subtitle: `${scope} · al ${new Date().toLocaleDateString("es-MX")}`, columns, rows })} />
        </div>
      </div>
      {query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorBox message={errorMessage(query.error)} /></div> : !rows.length ? <EmptyState title="Sin existencias" /> : (
        <Table>
          <thead><tr><th className={th}>Almacén</th><th className={th}>Ubicación</th><th className={th}>Producto</th><th className={th}>Cliente</th><th className={`${th} text-right`}>Existencia</th><th className={`${th} text-right`}>Valor</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={td}>{r.warehouse}</td>
                <td className={`${td} font-mono text-xs`}>{r.location}</td>
                <td className={td}><p>{r.product}</p><p className="font-mono text-xs text-slate-500">{r.sku}</p></td>
                <td className={td}>{r.customer ?? <span className="text-xs text-slate-400">Propio</span>}</td>
                <td className={`${td} tabular text-right`}>{fmtNumber(r.available)} <span className="text-xs text-slate-400">{r.unit}</span></td>
                <td className={`${td} tabular text-right`}>{fmtMoney(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
