import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage, qs } from "../lib/api";
import { useSession } from "../lib/auth";
import { useModuleSetting, useWarehouseFilter, useWarehouses } from "../lib/data";
import { exportName } from "../lib/export";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber, MOVEMENT_LABEL, STATUS_LABEL, TRACKING_LABEL } from "../lib/format";
import type { Balance, Movement, Product, StockRow, StockStatus } from "../lib/types";
import { Badge, Card, EmptyState, ErrorBox, Loading, Modal, PageHeader, SearchInput, Select, Table, td, th } from "../components/ui";
import { ExportButtons } from "../components/ExportButtons";

const STATUS_BADGE: Record<StockStatus, "danger" | "warning" | "neutral" | "success"> = {
  stockout: "danger", low: "warning", slow: "neutral", ok: "success",
};

export function StatusBadge({ status }: { status: StockStatus }) {
  return <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export default function InventoryPage() {
  const session = useSession();
  const isClient = session.user.role === "client";
  const { warehouseId } = useWarehouseFilter();
  const { data: warehouses } = useWarehouses();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StockStatus | "">("");
  const [customer, setCustomer] = useState("");
  const [selected, setSelected] = useState<StockRow | null>(null);
  const SLOW_DAYS = Number(useModuleSetting("reports", "slowMovingDays")) || 30;

  const query = useQuery({
    queryKey: ["dashboard", "stock", { warehouseId, days: SLOW_DAYS }],
    queryFn: () => api.get<{ products: StockRow[] }>(`/dashboard/stock${qs({ warehouseId, days: SLOW_DAYS })}`).then(r => r.products),
    refetchInterval: 60_000,
  });

  const rows = query.data ?? [];
  const customers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => r.customer && map.set(r.customer.id, `${r.customer.code} · ${r.customer.name}`));
    return [...map];
  }, [rows]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (!status || r.status === status)
      && (!customer || (customer === "own" ? !r.customer : r.customer?.id === customer))
      && (!q || r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)));
  }, [rows, search, status, customer]);

  const counts = useMemo(() => {
    const c: Record<StockStatus, number> = { stockout: 0, low: 0, slow: 0, ok: 0 };
    rows.forEach(r => c[r.status]++);
    return c;
  }, [rows]);
  const warehouseName = warehouses?.find(w => w._id === warehouseId)?.name ?? "Todos los almacenes";

  return (
    <>
      <PageHeader
        title="Inventario"
        description={`Existencias por producto · ${warehouseName}. "Sin movimiento" = con stock pero sin movimientos en ${SLOW_DAYS} días.`}
        actions={
          <ExportButtons
            disabled={!filtered.length}
            spec={() => ({
              fileName: exportName("inventario"),
              title: "Inventario por producto",
              subtitle: `${session.company.name} · ${warehouseName}`,
              rows: filtered,
              columns: [
                { header: "SKU", value: r => r.sku, width: 14 },
                { header: "Producto", value: r => r.name, width: 32 },
                ...(customers.length ? [{ header: "Cliente", value: (r: StockRow) => r.customer?.code ?? "Propio" }] : []),
                { header: "Existencia", value: r => r.onHand, kind: "number" },
                { header: "Unidad", value: r => r.unit },
                { header: "Mínimo", value: r => r.threshold, kind: "number" },
                { header: "Costo", value: r => r.cost, kind: "money" },
                { header: "Valor", value: r => r.value, kind: "money" },
                { header: "Días de inventario", value: r => r.daysOfSupply, kind: "number" },
                { header: "Último movimiento", value: r => (r.lastMovementAt ? new Date(r.lastMovementAt) : null), kind: "date" },
                { header: "Estado", value: r => STATUS_LABEL[r.status] },
              ],
            })}
          />
        }
      />

      <div className="mb-5 grid min-w-0 grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        {(["", "stockout", "low", "slow", "ok"] as const).map(s => (
          <button
            key={s || "all"} onClick={() => setStatus(s)} aria-pressed={status === s}
            className={`flex min-h-12 min-w-0 flex-row items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${status === s ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"}`}
          >
            {s ? STATUS_LABEL[s] : "Todos"} <span className="tabular block max-w-full overflow-x-auto whitespace-nowrap text-lg font-semibold tracking-tight">{s ? counts[s] : rows.length}</span>
          </button>
        ))}
      </div>

      <Card padded={false} className="overflow-hidden [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_td:first-child]:min-w-64 [&_td:first-child]:max-w-96 [&_td:first-child]:whitespace-normal">
        <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:flex-wrap sm:p-5">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por SKU o nombre" className="w-full min-w-0 sm:min-w-60 sm:flex-1" />
          {!isClient && customers.length > 0 && (
            <Select value={customer} onChange={e => setCustomer(e.target.value)} className="w-full sm:w-60">
              <option value="">Todos los dueños</option>
              <option value="own">Mercancía propia</option>
              {customers.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          )}
        </div>
        {query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorBox message={errorMessage(query.error)} onRetry={() => query.refetch()} /></div> : filtered.length === 0 ? (
          <EmptyState title="Sin productos" description={rows.length ? "Ningún producto coincide con los filtros." : "Aún no hay productos en el catálogo."} />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={th}>Producto</th>
                {!isClient && customers.length > 0 && <th className={th}>Dueño</th>}
                <th className={`${th} text-right`}>Existencia</th>
                <th className={`${th} text-right`}>Mínimo</th>
                <th className={`${th} text-right`}>Valor</th>
                <th className={`${th} text-right`}>Días inv.</th>
                <th className={th}>Último mov.</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.productId} onClick={() => setSelected(r)} className="cursor-pointer">
                  <td className={td}>
                    <p className="font-semibold leading-relaxed text-slate-900">{r.name}</p>
                    <p className="mt-1 break-all font-mono text-xs leading-relaxed text-slate-500">{r.sku}</p>
                  </td>
                  {!isClient && customers.length > 0 && <td className={td}>{r.customer ? <Badge variant="info">{r.customer.code}</Badge> : <span className="text-xs text-slate-500">Propio</span>}</td>}
                  <td className={`${td} tabular text-right font-semibold text-slate-900`}>{fmtNumber(r.onHand)} <span className="text-xs font-normal text-slate-400">{r.unit}</span></td>
                  <td className={`${td} tabular text-right`}>{fmtNumber(r.threshold)}</td>
                  <td className={`${td} tabular text-right`}>{fmtMoney(r.value)}</td>
                  <td className={`${td} tabular text-right`}>{r.daysOfSupply == null ? "—" : fmtNumber(r.daysOfSupply, 1)}</td>
                  <td className={td}>{fmtDate(r.lastMovementAt)}</td>
                  <td className={td}><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {selected && <ProductDetail row={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function ProductDetail({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const { data: warehouses } = useWarehouses();
  const { warehouseId } = useWarehouseFilter();
  const query = useQuery({
    queryKey: ["product", row.productId],
    queryFn: () => api.get<{ product: Product; balances: Balance[]; recentMovements: Movement[] }>(`/products/${row.productId}`),
  });
  const warehouseName = (id: string) => warehouses?.find(w => w._id === id)?.name ?? "—";
  const balances = (query.data?.balances ?? []).filter(b => b.available !== 0 && (!warehouseId || b.locationId?.warehouseId === warehouseId));

  return (
    <Modal open title={row.name} onClose={onClose} wide>
      <div className="mb-5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 pb-5 text-sm leading-relaxed text-slate-600">
        <span className="break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700">{row.sku}</span>·<span>{TRACKING_LABEL[row.tracking]}</span>
        {row.customer && <Badge variant="info">{row.customer.name}</Badge>}
        <StatusBadge status={row.status} />
      </div>
      <dl className="mb-6 grid min-w-0 grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {[["Existencia", `${fmtNumber(row.onHand)} ${row.unit}`], ["Mínimo", fmtNumber(row.threshold)], ["Valor", fmtMoney(row.value)], ["Salidas 30 días", fmtNumber(row.outboundUnits)]].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 [container-type:inline-size]"><dt className="text-xs font-medium text-slate-500">{k}</dt><dd className="tabular mt-2 max-w-full overflow-x-auto whitespace-nowrap text-[clamp(1rem,7cqi,1.25rem)] font-semibold tracking-tight text-slate-900">{v}</dd></div>
        ))}
      </dl>
      {query.isPending ? <Loading /> : query.isError ? <ErrorBox message={errorMessage(query.error)} /> : (
        <div className="grid min-w-0 grid-cols-1 items-start gap-5 md:grid-cols-2 [&>div]:min-w-0">
          <div>
            <h3 className="mb-3 border-l-2 border-indigo-600 pl-3 text-sm font-semibold text-slate-900">Por ubicación</h3>
            {balances.length === 0 ? <p className="text-sm text-slate-500">Sin existencias.</p> : (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {balances.map(b => (
                  <li key={b._id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3.5 text-sm [&>span:first-child]:min-w-0 [&>span:first-child]:break-words">
                    <span><span className="break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700">{b.locationId.code}</span> <span className="text-xs text-slate-500">· {warehouseName(b.locationId.warehouseId)}</span></span>
                    <span className="tabular shrink-0 whitespace-nowrap font-semibold text-slate-900">{fmtNumber(b.available)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-3 border-l-2 border-indigo-600 pl-3 text-sm font-semibold text-slate-900">Últimos movimientos</h3>
            {query.data.recentMovements.length === 0 ? <p className="text-sm text-slate-500">Sin movimientos.</p> : (
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {query.data.recentMovements.map(m => (
                  <li key={m._id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3.5 text-sm [&>span:first-child]:min-w-0 [&>span:first-child]:break-words">
                    <span><span className="break-all font-mono text-xs font-medium text-slate-800">{m.folio}</span> <span className="text-xs text-slate-500">· {MOVEMENT_LABEL[m.type]}</span></span>
                    <span className="text-xs text-slate-500">{fmtDateTime(m.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <div className="mt-6 flex justify-end border-t border-slate-200 pt-5">
        <Link to={`/reportes?reporte=kardex&producto=${row.productId}`} className="inline-flex min-h-11 items-center rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100">Ver kardex completo →</Link>
      </div>
    </Modal>
  );
}
