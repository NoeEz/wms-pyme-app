import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage, qs } from "../lib/api";
import { useSession } from "../lib/auth";
import { useWarehouseFilter, useWarehouses } from "../lib/data";
import { exportName } from "../lib/export";
import { fmtDateTime, fmtDuration, fmtNumber, MOVEMENT_COLOR, MOVEMENT_LABEL, periodParams, toDateInput, startOfDayAgo } from "../lib/format";
import type { Location, Movement, MovementType, Product } from "../lib/types";
import { Badge, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, td, th } from "../components/ui";
import { ExportButtons } from "../components/ExportButtons";

const LIMIT = 200;

export function MovementTypeBadge({ type }: { type: MovementType }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
      <span className="h-2 w-2 rounded-full" style={{ background: MOVEMENT_COLOR[type] }} aria-hidden="true" />
      {MOVEMENT_LABEL[type]}
    </span>
  );
}

const userName = (m: Movement) => (typeof m.userId === "string" ? "—" : m.userId.name);
const units = (m: Movement) => m.lines.reduce((s, l) => s + l.quantity, 0);
const lagSeconds = (m: Movement) => (m.capturedAt ? Math.max(0, (Date.parse(m.createdAt) - Date.parse(m.capturedAt)) / 1000) : null);

export default function MovementsPage() {
  const session = useSession();
  const isClient = session.user.role === "client";
  const { warehouseId } = useWarehouseFilter();
  const { data: warehouses } = useWarehouses();
  const [type, setType] = useState<MovementType | "">("");
  const [fromDay, setFromDay] = useState(toDateInput(startOfDayAgo(6)));
  const [toDay, setToDay] = useState(toDateInput(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const period = periodParams(fromDay, toDay);
  const query = useQuery({
    queryKey: ["movements", { warehouseId, type, fromDay, toDay }],
    queryFn: () => api.get<{ movements: Movement[] }>(`/movements${qs({ warehouseId, type, from: period.from, to: period.to, limit: LIMIT })}`).then(r => r.movements),
    refetchInterval: 60_000,
  });
  const movements = query.data ?? [];
  const warehouseName = (id: string) => warehouses?.find(w => w._id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="Entradas, salidas, transferencias y ajustes registrados en el servidor."
        actions={
          <ExportButtons
            disabled={!movements.length}
            spec={() => ({
              fileName: exportName("movimientos"),
              title: "Movimientos",
              subtitle: `${session.company.name} · ${fromDay} a ${toDay}`,
              rows: movements,
              columns: [
                { header: "Folio", value: m => m.folio ?? "", width: 18 },
                { header: "Tipo", value: m => MOVEMENT_LABEL[m.type] },
                { header: "Fecha", value: m => new Date(m.createdAt), kind: "datetime", width: 18 },
                { header: "Almacén", value: m => warehouseName(m.warehouseId), width: 20 },
                ...(isClient ? [] : [{ header: "Usuario", value: (m: Movement) => userName(m), width: 20 }]),
                { header: "Referencia", value: m => m.reference ?? "", width: 24 },
                { header: "Líneas", value: m => m.lines.length, kind: "number" },
                { header: "Unidades", value: m => units(m), kind: "number" },
              ],
            })}
          />
        }
      />

      <Card padded={false} className="overflow-hidden [&_th]:whitespace-nowrap [&_td>span.inline-flex]:rounded-md [&_td>span.inline-flex]:border [&_td>span.inline-flex]:border-slate-200 [&_td>span.inline-flex]:bg-slate-50 [&_td>span.inline-flex]:px-2.5 [&_td>span.inline-flex]:py-1.5 [&_td>span.inline-flex]:font-semibold">
        <div className="grid min-w-0 grid-cols-1 items-end gap-4 border-b border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3 [&>label]:min-w-0">
          <Field label="Desde"><Input type="date" value={fromDay} max={toDay} onChange={e => setFromDay(e.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={toDay} min={fromDay} onChange={e => setToDay(e.target.value)} /></Field>
          <Field label="Tipo" className="sm:col-span-2 xl:col-span-1">
            <Select value={type} onChange={e => setType(e.target.value as MovementType | "")} className="w-full">
              <option value="">Todos</option>
              {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map(t => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
            </Select>
          </Field>
          {movements.length === LIMIT && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-800 sm:col-span-2 xl:col-span-3">Se muestran los {LIMIT} más recientes; acota el periodo o usa Reportes para el detalle completo.</p>}
        </div>
        {query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorBox message={errorMessage(query.error)} onRetry={() => query.refetch()} /></div> : movements.length === 0 ? (
          <EmptyState icon="movements" title="Sin movimientos" description="No hay movimientos con estos filtros." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={th}>Folio</th><th className={th}>Tipo</th><th className={th}>Fecha</th><th className={th}>Almacén</th>
                {!isClient && <th className={th}>Usuario</th>}
                <th className={th}>Referencia</th><th className={`${th} text-right`}>Líneas</th><th className={`${th} text-right`}>Unidades</th>
                {!isClient && <th className={`${th} text-right`}>Retraso sync</th>}
              </tr>
            </thead>
            <tbody>
              {movements.map(m => {
                const lag = lagSeconds(m);
                return (
                  <tr key={m._id} onClick={() => setSelectedId(m._id)} className="cursor-pointer">
                    <td className={`${td} whitespace-nowrap font-mono text-xs font-semibold text-slate-800`}>{m.folio}</td>
                    <td className={td}><MovementTypeBadge type={m.type} /></td>
                    <td className={td}>{fmtDateTime(m.createdAt)}</td>
                    <td className={td}>{warehouseName(m.warehouseId)}</td>
                    {!isClient && <td className={td}>{userName(m)}</td>}
                    <td className={`${td} min-w-48 max-w-72 whitespace-normal break-words leading-relaxed`}>{m.reference ?? <span className="text-slate-500">—</span>}</td>
                    <td className={`${td} tabular text-right`}>{m.lines.length}</td>
                    <td className={`${td} tabular text-right font-semibold text-slate-900`}>{fmtNumber(units(m))}</td>
                    {!isClient && <td className={`${td} tabular text-right ${lag != null && lag > 900 ? "font-medium text-amber-700" : ""}`}>{fmtDuration(lag)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {selectedId && <MovementDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}

function MovementDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({ queryKey: ["movement", id], queryFn: () => api.get<{ movement: Movement }>(`/movements/${id}`).then(r => r.movement) });
  const m = query.data;
  const loc = (l?: string | Location | null) => (l && typeof l !== "string" ? l.code : "—");
  return (
    <Modal open title={m?.folio ?? "Movimiento"} onClose={onClose} wide>
      {query.isPending ? <Loading /> : query.isError ? <ErrorBox message={errorMessage(query.error)} /> : m && (
        <div className="min-w-0 [&_th]:whitespace-nowrap">
          <div className="mb-5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-200 pb-5 text-sm leading-relaxed text-slate-600 [&>span.inline-flex]:max-w-full [&>span.inline-flex]:whitespace-normal [&>span.inline-flex]:rounded-md [&>span.inline-flex]:border [&>span.inline-flex]:border-slate-200 [&>span.inline-flex]:bg-slate-50 [&>span.inline-flex]:px-2.5 [&>span.inline-flex]:py-1.5 [&>span.inline-flex]:font-semibold">
            <MovementTypeBadge type={m.type} />
            <span>{fmtDateTime(m.createdAt)}</span>
            {typeof m.userId !== "string" && <span>· {m.userId.name}</span>}
            {m.capturedAt && <Badge>Capturado {fmtDateTime(m.capturedAt)}</Badge>}
          </div>
          {m.reference && <p className="mb-5 break-words rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700"><span className="text-slate-500">Referencia:</span> {m.reference}</p>}
          <Table>
            <thead><tr><th className={th}>Producto</th><th className={`${th} text-right`}>Cantidad</th><th className={th}>Origen</th><th className={th}>Destino</th><th className={th}>Lote / serie</th></tr></thead>
            <tbody>
              {m.lines.map((l, i) => {
                const p = typeof l.productId === "string" ? null : (l.productId as Product);
                return (
                  <tr key={i}>
                    <td className={td}><p className="min-w-48 max-w-72 whitespace-normal break-words font-semibold leading-relaxed text-slate-900">{p?.name ?? "—"}</p><p className="mt-1 break-all font-mono text-xs leading-relaxed text-slate-500">{p?.sku}</p></td>
                    <td className={`${td} tabular whitespace-nowrap text-right font-semibold text-slate-900`}>{fmtNumber(l.quantity)}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-xs font-semibold text-slate-800`}>{loc(l.sourceLocationId)}</td>
                    <td className={`${td} whitespace-nowrap font-mono text-xs font-semibold text-slate-800`}>{loc(l.destinationLocationId)}</td>
                    <td className={`${td} min-w-40 max-w-64 whitespace-normal break-all text-xs leading-relaxed`}>{[l.lot, l.serial].filter(Boolean).join(" · ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
