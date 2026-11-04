import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage, qs } from "../lib/api";
import { useSession } from "../lib/auth";
import { useModuleSetting, useWarehouseFilter } from "../lib/data";
import { fmtDuration, fmtMoney, fmtNumber, fmtPct, MOVEMENT_COLOR, MOVEMENT_LABEL, startOfDayAgo } from "../lib/format";
import type { MovementType, Overview } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Loading, PageHeader, Stat, Table, td, th } from "../components/ui";
import { MovementsByDayChart, UnitsFlowChart } from "../components/charts";
import { Icon } from "../components/Icon";

const RANGES = [
  { days: 1, label: "Hoy" },
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
];
const REFRESH_MS = 60_000;

export default function DashboardPage() {
  const session = useSession();
  const isClient = session.user.role === "client";
  const { warehouseId } = useWarehouseFilter();
  // Until the user picks a range, use the reports module's default period.
  const defaultDays = Number(useModuleSetting("reports", "defaultPeriodDays")) || 30;
  const [picked, setDays] = useState<number | null>(null);
  const days = picked ?? defaultDays;
  const ranges = RANGES.some(r => r.days === defaultDays)
    ? RANGES
    : [...RANGES, { days: defaultDays, label: `${defaultDays} días` }].sort((a, b) => a.days - b.days);

  const query = useQuery({
    queryKey: ["dashboard", "overview", { warehouseId, days }],
    queryFn: () => api.get<Overview>(`/dashboard/overview${qs({
      warehouseId,
      from: startOfDayAgo(days - 1).toISOString(),
      to: new Date().toISOString(),
      tzOffset: new Date().getTimezoneOffset(),
    })}`),
    refetchInterval: REFRESH_MS, // live monitoring
  });
  const data = query.data;

  return (
    <>
      <PageHeader
        title={isClient ? `Tablero · ${session.customer?.name ?? ""}` : "Tablero"}
        description={isClient ? "Tu inventario resguardado en el almacén." : "Indicadores de inventario y operación del almacén."}
        actions={
          <>
            <div className="flex rounded-xl border border-slate-300 bg-white p-0.5" role="group" aria-label="Periodo">
              {ranges.map(r => (
                <button
                  key={r.days} onClick={() => setDays(r.days)} aria-pressed={days === r.days}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${days === r.days ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >{r.label}</button>
              ))}
            </div>
            <Button variant="secondary" size="sm" icon="refresh" loading={query.isFetching} onClick={() => query.refetch()}>
              {query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "Actualizar"}
            </Button>
          </>
        }
      />

      {query.isError && !data && <ErrorBox message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      {query.isPending && <Loading />}

      {data && (
        <div className="flex flex-col gap-6">
          <KpiRow data={data} isClient={isClient} />
          <TodayStrip data={data} days={days} />

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Movimientos por día"><MovementsByDayChart series={data.movements.series} /></Card>
            <Card title="Unidades que entran y salen"><UnitsFlowChart series={data.movements.series} /></Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <AlertsCard data={data} />
            {data.operators && <OperatorsCard data={data} />}
            <SyncCard data={data} />
          </div>
        </div>
      )}
    </>
  );
}

function KpiRow({ data, isClient }: { data: Overview; isClient: boolean }) {
  const { stock, flow, accuracy } = data;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Stat label="Existencias" icon="inventory" value={fmtNumber(stock.units)} hint={`${fmtNumber(stock.skus)} producto${stock.skus === 1 ? "" : "s"} con stock`} />
      <Stat
        label="Valor del inventario" icon="reports" value={fmtMoney(stock.value)}
        hint={stock.valuedUnitsPct != null && stock.valuedUnitsPct < 1 ? `${fmtPct(stock.valuedUnitsPct, 0)} de las unidades tiene costo` : "Al costo unitario"}
      />
      <Stat
        label="Alertas de stock" icon="warning"
        value={<>{stock.stockouts + stock.lowStock}</>}
        tone={stock.stockouts ? "bad" : stock.lowStock ? "warn" : "good"}
        hint={`${stock.stockouts} agotados · ${stock.lowStock} en stock bajo`}
      />
      <Stat
        label="Días de inventario" icon="audit"
        value={flow.daysOfSupply == null ? "—" : fmtNumber(flow.daysOfSupply, 1)}
        hint={flow.daysOfSupply == null ? "Sin salidas en el periodo" : `Salida promedio ${fmtNumber(flow.avgDailyOutbound, 1)} u/día`}
      />
      <Stat
        label="Rotación" icon="movements"
        value={flow.turnover == null ? "—" : `${fmtNumber(flow.turnover, 2)}×`}
        hint={flow.turnoverBasis === "value" ? "Salidas ÷ inventario, en dinero" : "Salidas ÷ inventario, en piezas"}
      />
      {isClient ? (
        <Stat label="Ubicaciones" icon="location" value={fmtNumber(stock.locationsInUse)} hint="Con mercancía tuya" />
      ) : (
        <Stat
          label="Precisión de inventario" icon="count"
          value={accuracy?.locationAccuracy == null ? "—" : fmtPct(accuracy.locationAccuracy)}
          tone={accuracy?.locationAccuracy == null ? "default" : accuracy.locationAccuracy >= 0.97 ? "good" : accuracy.locationAccuracy >= 0.9 ? "warn" : "bad"}
          hint={accuracy?.counts ? `${accuracy.accurateCounts} de ${accuracy.counts} ubicaciones contadas sin diferencia` : "Sin conteos físicos en el periodo"}
        />
      )}
    </div>
  );
}

function TodayStrip({ data, days }: { data: Overview; days: number }) {
  const types: MovementType[] = ["inbound", "outbound", "transfer", "adjustment"];
  const totals = data.movements.totals;
  return (
    <Card padded={false}>
      <div className="grid grid-cols-2 divide-slate-100 sm:grid-cols-4 sm:divide-x">
        {types.map(t => (
          <div key={t} className="flex items-center gap-3 px-5 py-4">
            <span className="h-8 w-1.5 rounded-full" style={{ background: MOVEMENT_COLOR[t] }} aria-hidden="true" />
            <div>
              <p className="text-xs text-slate-500">{MOVEMENT_LABEL[t]}s {days === 1 ? "hoy" : `en ${days} días`}</p>
              <p className="tabular text-lg font-semibold text-slate-900">
                {fmtNumber(totals[t].movements)}
                <span className="ml-1 text-xs font-normal text-slate-500">· {fmtNumber(totals[t].units)} u</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AlertsCard({ data }: { data: Overview }) {
  return (
    <Card title="Alertas de inventario" actions={<Link to="/inventario" className="text-xs font-medium text-indigo-600 hover:underline">Ver inventario</Link>} padded={false}>
      {data.alerts.length === 0 ? (
        <EmptyState icon="check" title="Sin alertas" description="Ningún producto está agotado ni por debajo de su mínimo." />
      ) : (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {data.alerts.slice(0, 12).map(a => (
            <li key={a.productId} className="flex items-center gap-3 px-5 py-3">
              <Icon name="warning" size={18} className={a.type === "stockout" ? "text-red-600" : "text-amber-600"} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{a.name}</p>
                <p className="font-mono text-xs text-slate-500">{a.sku}</p>
              </div>
              <div className="text-right">
                <Badge variant={a.type === "stockout" ? "danger" : "warning"}>{a.type === "stockout" ? "Agotado" : "Stock bajo"}</Badge>
                <p className="tabular mt-1 text-xs text-slate-500">{fmtNumber(a.onHand)} / mín. {fmtNumber(a.threshold)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function OperatorsCard({ data }: { data: Overview }) {
  const operators = data.operators ?? [];
  const max = Math.max(1, ...operators.map(o => o.lines));
  return (
    <Card title="Productividad por usuario" padded={false}>
      {operators.length === 0 ? (
        <EmptyState icon="users" title="Sin movimientos en el periodo" />
      ) : (
        <Table>
          <thead><tr><th className={th}>Usuario</th><th className={`${th} text-right`}>Líneas</th><th className={`${th} text-right`}>Unidades</th></tr></thead>
          <tbody>
            {operators.map(o => (
              <tr key={o.userId}>
                <td className={td}>
                  <p className="font-medium text-slate-800">{o.name}</p>
                  <p className="text-xs text-slate-500">{fmtNumber(o.movements)} movimientos</p>
                  <div className="mt-1 h-1.5 w-28 rounded-full bg-slate-100" aria-hidden="true">
                    <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${(o.lines / max) * 100}%` }} />
                  </div>
                </td>
                <td className={`${td} tabular text-right`}>{fmtNumber(o.lines)}</td>
                <td className={`${td} tabular text-right`}>{fmtNumber(o.units)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function SyncCard({ data }: { data: Overview }) {
  const { sync } = data;
  const lateShare = sync.captured ? sync.late / sync.captured : 0;
  return (
    <Card title="Sincronización de la app">
      {sync.captured === 0 ? (
        <p className="text-sm text-slate-500">Aún no hay movimientos capturados desde la app en el periodo.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">Tiempo entre que el operador captura un movimiento y llega al servidor (más alto = trabajo sin señal).</p>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[["Promedio", sync.avgSeconds], ["95 % llega en", sync.p95Seconds], ["Máximo", sync.maxSeconds]].map(([label, v]) => (
              <div key={label as string} className="rounded-xl bg-slate-50 px-2 py-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-slate-900">{fmtDuration(v as number | null)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-2 text-sm">
            {sync.late > 0 ? <Icon name="warning" size={18} className="text-amber-600" /> : <Icon name="check" size={18} className="text-emerald-600" />}
            <span className="text-slate-700">
              {sync.late > 0
                ? `${sync.late} de ${sync.captured} (${fmtPct(lateShare, 0)}) llegaron con más de ${fmtDuration(sync.lateThresholdSeconds)} de retraso.`
                : `Todos los ${sync.captured} movimientos llegaron en menos de ${fmtDuration(sync.lateThresholdSeconds)}.`}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
