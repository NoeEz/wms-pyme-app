import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, qs } from "../lib/api";
import { useCan, useSession } from "../lib/auth";
import { useLocations, useModuleSetting, useOccupancy, useProducts, useWarehouseFilter, useWarehouses } from "../lib/data";
import { fmtDateTime, fmtNumber } from "../lib/format";
import type { Balance, InventoryCount, Movement } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Select, Table, td, th } from "../components/ui";
import { Icon } from "../components/Icon";
import { WarehouseMap } from "../components/WarehouseMap";

interface CountLine { productId: string; sku: string; name: string; unit: string; expected: number; counted: string }

export default function CountsPage() {
  const canCount = useCan("inventory.count");
  const canApprove = useCan("inventory.approve");
  const requireApproval = useModuleSetting("inventory", "requireApproval");
  const threshold = useModuleSetting("inventory", "approvalThreshold");
  const { warehouseId: filterWarehouse } = useWarehouseFilter();
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState(filterWarehouse);
  const [locationId, setLocationId] = useState("");
  const blindDefault = useModuleSetting("inventory", "blindCountDefault");
  const notesRequired = useModuleSetting("inventory", "requireCountNotes") === true;
  const [blindPicked, setBlind] = useState<boolean | null>(null);
  const blind = blindPicked ?? blindDefault !== false;
  const [lines, setLines] = useState<CountLine[]>([]);
  const [addProduct, setAddProduct] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ count: InventoryCount; adjustment: Movement | null } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => { if (filterWarehouse) setWarehouseId(filterWarehouse); }, [filterWarehouse]);
  const { data: locations } = useLocations(warehouseId);
  const { data: occupancy } = useOccupancy(warehouseId);
  const { data: products } = useProducts();
  const location = locations?.find(l => l._id === locationId);

  // What the system has at the location — the starting list of the count.
  const stock = useQuery({
    queryKey: ["inventory", { warehouseId, locationId }],
    queryFn: () => api.get<{ balances: Balance[] }>(`/inventory${qs({ warehouseId, locationId })}`).then(r => r.balances),
    enabled: !!warehouseId && !!locationId,
  });
  useEffect(() => {
    setLines((stock.data ?? []).filter(b => b.productId).map(b => ({
      productId: b.productId._id, sku: b.productId.sku, name: b.productId.name, unit: b.productId.unit, expected: b.available, counted: "",
    })));
  }, [stock.data]);

  const addable = useMemo(() => (products ?? []).filter(p => !lines.some(l => l.productId === p._id)), [products, lines]);
  const ready = lines.length > 0 && lines.every(l => l.counted.trim() !== "" && Number(l.counted) >= 0);

  const submit = useMutation({
    mutationFn: () => api.post<{ count: InventoryCount; adjustment: Movement | null }>("/counts", {
      warehouseId, locationId, notes: notes.trim() || undefined,
      lines: lines.map(l => ({ productId: l.productId, counted: Number(l.counted) })),
    }),
    onSuccess: data => {
      setResult(data);
      setNotes("");
      ["counts", "inventory", "dashboard", "movements", "product"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });

  const history = useQuery({
    queryKey: ["counts", { warehouseId: filterWarehouse }],
    queryFn: () => api.get<{ counts: InventoryCount[] }>(`/counts${qs({ warehouseId: filterWarehouse, limit: 30 })}`).then(r => r.counts),
  });

  return (
    <>
      <PageHeader title="Conteos y ajustes" description="Cuenta una ubicación y corrige el sistema. Cada diferencia queda como movimiento de ajuste (folio AJU) con saldo anterior, diferencia y saldo resultante." />
      {requireApproval === true && (
        <p className="mb-4 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          Ajustes críticos con autorización: si la diferencia total llega a {fmtNumber(Number(threshold ?? 0) || 1)} unidad(es), el ajuste espera a que otro usuario con permiso «Autorizar ajustes» lo apruebe.
        </p>
      )}
      {canApprove && <PendingApprovals />}

      <div className="grid min-w-0 grid-cols-1 items-start gap-6 2xl:grid-cols-5">
        {canCount && <Card title="Nuevo conteo" className="2xl:col-span-3 [&_th]:whitespace-nowrap [&_td.tabular]:whitespace-nowrap">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 [&>label]:min-w-0">
            <Field label="Almacén">
              <Select value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setLocationId(""); setResult(null); }}>
                <option value="">Selecciona…</option>
                {warehouses?.filter(w => w.state === "active").map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </Select>
            </Field>
            <Field label="Ubicación a contar">
              <div className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm leading-relaxed [&>span]:min-w-0 [&>span]:break-words">
                {location
                  ? <span><span className="break-all font-mono font-semibold text-slate-900">{location.code}</span> <span className="text-slate-500">· {location.zone} / {location.aisle}</span></span>
                  : <span className="text-slate-500">{warehouseId ? "Elígela en el plano" : "Elige primero un almacén"}</span>}
                {location && <button type="button" onClick={() => { setLocationId(""); setResult(null); }} className="inline-flex min-h-8 shrink-0 items-center rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Cambiar</button>}
              </div>
            </Field>
          </div>

          {warehouseId && !locationId && (
            <div className="mt-6 min-w-0">
              {locations && occupancy
                ? <WarehouseMap locations={locations} occupancy={occupancy} onSelect={l => { setLocationId(l._id); setResult(null); }} prompt="Haz clic en la posición que vas a contar." />
                : <Loading label="Cargando plano…" />}
            </div>
          )}

          {locationId && (
            <div className="mt-6 min-w-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                <label className="flex items-start gap-3 text-sm font-medium leading-relaxed text-slate-700">
                  <input type="checkbox" checked={blind} onChange={e => setBlind(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />
                  Conteo a ciegas (no mostrar la existencia del sistema)
                </label>
              </div>
              {stock.isPending ? <Loading /> : (
                <>
                  {lines.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-600">El sistema no tiene productos en esta ubicación. Agrega los que encuentres.</p>
                  ) : (
                    <Table>
                      <thead><tr><th className={th}>Producto</th>{!blind && <th className={`${th} text-right`}>Sistema</th>}<th className={`${th} w-36 text-right`}>Contado</th><th className={th} /></tr></thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={l.productId}>
                            <td className={td}><p className="min-w-48 max-w-80 whitespace-normal break-words font-semibold leading-relaxed text-slate-900">{l.name}</p><p className="mt-1 break-all font-mono text-xs leading-relaxed text-slate-500">{l.sku}</p></td>
                            {!blind && <td className={`${td} tabular text-right`}>{fmtNumber(l.expected)} {l.unit}</td>}
                            <td className={td}>
                              <Input
                                type="number" min={0} step="any" inputMode="decimal" value={l.counted} aria-label={`Cantidad contada de ${l.sku}`}
                                onChange={e => setLines(ls => ls.map((x, j) => (j === i ? { ...x, counted: e.target.value } : x)))}
                                className="min-w-28 border-indigo-200 bg-indigo-50/30 text-right font-semibold tabular-nums"
                              />
                            </td>
                            <td className={td}>
                              {l.expected === 0 && (
                                <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700" aria-label="Quitar"><Icon name="x" size={16} /></button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                  <div className="mt-5 flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
                    <Select value={addProduct} onChange={e => setAddProduct(e.target.value)} className="w-full min-w-0 sm:flex-1">
                      <option value="">Agregar un producto encontrado aquí…</option>
                      {addable.map(p => <option key={p._id} value={p._id}>{p.sku} · {p.name}</option>)}
                    </Select>
                    <Button
                      variant="secondary" icon="plus" disabled={!addProduct}
                      onClick={() => {
                        const p = products?.find(x => x._id === addProduct);
                        if (p) setLines(ls => [...ls, { productId: p._id, sku: p.sku, name: p.name, unit: p.unit, expected: 0, counted: "" }]);
                        setAddProduct("");
                      }}
                    >Agregar</Button>
                  </div>
                  <Field label={notesRequired ? "Motivo / notas (obligatorio si hay diferencias)" : "Notas (opcional)"} className="mt-5">
                    <Input value={notes} onChange={e => setNotes(e.target.value)} maxLength={200} placeholder="Conteo cíclico semanal, zona A…" />
                  </Field>
                  {submit.isError && <div className="mt-5"><ErrorBox message={errorMessage(submit.error)} /></div>}
                  <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5 [&>button]:w-full sm:[&>button]:w-auto">
                    <Button icon="check" disabled={!ready} loading={submit.isPending} onClick={() => submit.mutate()}>Guardar conteo</Button>
                  </div>
                </>
              )}
            </div>
          )}

          {result && <CountResult result={result} />}
        </Card>}

        <Card title="Conteos recientes" className={canCount ? "2xl:col-span-2" : "2xl:col-span-5"} padded={false}>
          {history.isPending ? <Loading /> : history.isError ? <div className="p-4"><ErrorBox message={errorMessage(history.error)} /></div> : !history.data.length ? (
            <EmptyState icon="count" title="Sin conteos todavía" />
          ) : (
            <ul className="max-h-[640px] divide-y divide-slate-200 overflow-y-auto">
              {history.data.map(c => (
                <li key={c._id} className="px-4 py-5 sm:px-5">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <span className="break-all font-mono text-sm font-semibold text-slate-900">{c.locationId?.code}</span>
                    {c.status === "pending" ? <Badge variant="info">Pendiente de autorización</Badge>
                      : c.status === "rejected" ? <Badge variant="danger">Rechazado</Badge>
                      : c.accurate ? <Badge variant="success">Sin diferencia</Badge> : <Badge variant="warning">{c.adjustmentId?.folio ?? "Ajustado"}</Badge>}
                  </div>
                  <p className="mt-2 break-words text-xs leading-relaxed text-slate-500">{fmtDateTime(c.createdAt)} · {c.userId?.name} · {c.lines.length} producto(s)</p>
                  {c.reviewedBy && <p className="mt-1 break-words text-xs leading-relaxed text-slate-500">{c.status === "rejected" ? "Rechazado" : "Autorizado"} por {c.reviewedBy.name}{c.reviewNote ? ` · «${c.reviewNote}»` : ""}</p>}
                  {!c.accurate && (
                    <p className="tabular mt-3 break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-900">
                      {c.lines.filter(l => l.counted !== l.expected).map(l => `${l.productId?.sku}: ${l.expected} → ${l.counted}`).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function PendingApprovals() {
  const session = useSession();
  const queryClient = useQueryClient();
  const pending = useQuery({
    queryKey: ["counts", { status: "pending" }],
    queryFn: () => api.get<{ counts: InventoryCount[] }>(`/counts${qs({ status: "pending", limit: 50 })}`).then(r => r.counts),
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
      api.post<{ count: InventoryCount; adjustment: Movement | null }>(`/counts/${id}/${decision}`, { note: notes[id]?.trim() || undefined }),
    onSuccess: () => ["counts", "inventory", "dashboard", "movements", "audit"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] })),
  });
  if (!pending.data?.length) return null;

  return (
    <Card title={`Ajustes por autorizar (${pending.data.length})`} className="mb-6" padded={false}>
      <ul className="divide-y divide-slate-100">
        {pending.data.map(c => {
          const own = c.userId?._id === session.user.id;
          const diffs = c.lines.filter(l => l.counted !== l.expected);
          const busy = (decision: string) => review.isPending && review.variables?.id === c._id && review.variables.decision === decision;
          return (
            <li key={c._id} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-medium">{c.locationId?.code}</span>
                <span className="text-slate-500">{fmtDateTime(c.createdAt)} · contado por {c.userId?.name}</span>
                {c.notes && <span className="text-xs text-slate-500">«{c.notes}»</span>}
              </div>
              <p className="text-xs text-slate-700">
                {diffs.map(l => `${l.productId?.sku}: sistema ${fmtNumber(l.expected)} → contado ${fmtNumber(l.counted)} (${l.counted - l.expected > 0 ? "+" : ""}${fmtNumber(l.counted - l.expected)})`).join(" · ")}
              </p>
              {own ? (
                <p className="text-xs text-amber-700">Lo contaste tú: debe autorizarlo otro usuario.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Input value={notes[c._id] ?? ""} onChange={e => setNotes(n => ({ ...n, [c._id]: e.target.value }))} placeholder="Comentario (obligatorio para rechazar)" className="max-w-sm" maxLength={300} />
                  <Button size="sm" icon="check" loading={busy("approve")} onClick={() => review.mutate({ id: c._id, decision: "approve" })}>Autorizar y ajustar</Button>
                  <Button size="sm" variant="secondary" disabled={(notes[c._id] ?? "").trim().length < 5} loading={busy("reject")} onClick={() => review.mutate({ id: c._id, decision: "reject" })}>Rechazar</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {review.isError && <div className="p-4"><ErrorBox message={errorMessage(review.error)} /></div>}
    </Card>
  );
}

function CountResult({ result }: { result: { count: InventoryCount; adjustment: Movement | null } }) {
  const diffs = result.count.lines.filter(l => l.counted !== l.expected);
  if (result.count.status === "pending") {
    return (
      <div className="mt-5 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900" role="status">
        <p className="flex items-center gap-2 font-medium"><Icon name="warning" size={18} /> Conteo guardado con {diffs.length} diferencia(s): ajuste crítico pendiente de autorización.</p>
        <p className="mt-1 text-xs">Las existencias no cambian hasta que otro usuario con permiso lo autorice.</p>
      </div>
    );
  }
  return (
    <div className={`mt-6 rounded-xl border px-4 py-4 text-sm leading-relaxed [&_svg]:shrink-0 ${result.count.accurate ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} role="status">
      {result.count.accurate ? (
        <p className="flex items-start gap-3"><Icon name="check" size={18} /> Conteo guardado: coincide con el sistema.</p>
      ) : (
        <>
          <p className="flex items-start gap-3 font-medium"><Icon name="warning" size={18} /> Conteo guardado con {diffs.length} diferencia(s). Ajuste {result.adjustment?.folio}.</p>
          <p className="mt-2 text-xs leading-relaxed">Las existencias de la ubicación ahora son las contadas.</p>
        </>
      )}
    </div>
  );
}
