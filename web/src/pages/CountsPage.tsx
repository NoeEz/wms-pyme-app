import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, qs } from "../lib/api";
import { useLocations, useProducts, useWarehouseFilter, useWarehouses } from "../lib/data";
import { fmtDateTime, fmtNumber } from "../lib/format";
import type { Balance, InventoryCount, Movement } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, PageHeader, Select, Table, td, th } from "../components/ui";
import { Icon } from "../components/Icon";

interface CountLine { productId: string; sku: string; name: string; unit: string; expected: number; counted: string }

export default function CountsPage() {
  const { warehouseId: filterWarehouse } = useWarehouseFilter();
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState(filterWarehouse);
  const [locationId, setLocationId] = useState("");
  const [blind, setBlind] = useState(true);
  const [lines, setLines] = useState<CountLine[]>([]);
  const [addProduct, setAddProduct] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<{ count: InventoryCount; adjustment: Movement | null } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => { if (filterWarehouse) setWarehouseId(filterWarehouse); }, [filterWarehouse]);
  const { data: locations } = useLocations(warehouseId);
  const { data: products } = useProducts();

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
      <PageHeader title="Conteos físicos" description="Cuenta una ubicación y corrige el sistema. Cada diferencia queda como movimiento de ajuste (folio AJU) y alimenta el KPI de precisión de inventario." />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Nuevo conteo" className="xl:col-span-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Almacén">
              <Select value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setLocationId(""); setResult(null); }}>
                <option value="">Selecciona…</option>
                {warehouses?.filter(w => w.state === "active").map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </Select>
            </Field>
            <Field label="Ubicación">
              <Select value={locationId} onChange={e => { setLocationId(e.target.value); setResult(null); }} disabled={!warehouseId}>
                <option value="">Selecciona…</option>
                {locations?.map(l => <option key={l._id} value={l._id}>{l.code} · {l.zone} / {l.aisle}</option>)}
              </Select>
            </Field>
          </div>

          {locationId && (
            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={blind} onChange={e => setBlind(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                  Conteo a ciegas (no mostrar la existencia del sistema)
                </label>
              </div>
              {stock.isPending ? <Loading /> : (
                <>
                  {lines.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">El sistema no tiene productos en esta ubicación. Agrega los que encuentres.</p>
                  ) : (
                    <Table>
                      <thead><tr><th className={th}>Producto</th>{!blind && <th className={`${th} text-right`}>Sistema</th>}<th className={`${th} w-36 text-right`}>Contado</th><th className={th} /></tr></thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={l.productId}>
                            <td className={td}><p className="font-medium text-slate-800">{l.name}</p><p className="font-mono text-xs text-slate-500">{l.sku}</p></td>
                            {!blind && <td className={`${td} tabular text-right`}>{fmtNumber(l.expected)} {l.unit}</td>}
                            <td className={td}>
                              <Input
                                type="number" min={0} step="any" inputMode="decimal" value={l.counted} aria-label={`Cantidad contada de ${l.sku}`}
                                onChange={e => setLines(ls => ls.map((x, j) => (j === i ? { ...x, counted: e.target.value } : x)))}
                                className="text-right"
                              />
                            </td>
                            <td className={td}>
                              {l.expected === 0 && (
                                <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Quitar"><Icon name="x" size={16} /></button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Select value={addProduct} onChange={e => setAddProduct(e.target.value)} className="max-w-sm flex-1">
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
                  <Field label="Notas (opcional)" className="mt-4">
                    <Input value={notes} onChange={e => setNotes(e.target.value)} maxLength={200} placeholder="Conteo cíclico semanal, zona A…" />
                  </Field>
                  {submit.isError && <div className="mt-4"><ErrorBox message={errorMessage(submit.error)} /></div>}
                  <div className="mt-4 flex justify-end">
                    <Button icon="check" disabled={!ready} loading={submit.isPending} onClick={() => submit.mutate()}>Guardar conteo</Button>
                  </div>
                </>
              )}
            </div>
          )}

          {result && <CountResult result={result} />}
        </Card>

        <Card title="Conteos recientes" className="xl:col-span-2" padded={false}>
          {history.isPending ? <Loading /> : history.isError ? <div className="p-4"><ErrorBox message={errorMessage(history.error)} /></div> : !history.data.length ? (
            <EmptyState icon="count" title="Sin conteos todavía" />
          ) : (
            <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
              {history.data.map(c => (
                <li key={c._id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-medium">{c.locationId?.code}</span>
                    {c.accurate ? <Badge variant="success">Sin diferencia</Badge> : <Badge variant="warning">{c.adjustmentId?.folio ?? "Ajustado"}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{fmtDateTime(c.createdAt)} · {c.userId?.name} · {c.lines.length} producto(s)</p>
                  {!c.accurate && (
                    <p className="mt-1 text-xs text-slate-600">
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

function CountResult({ result }: { result: { count: InventoryCount; adjustment: Movement | null } }) {
  const diffs = result.count.lines.filter(l => l.counted !== l.expected);
  return (
    <div className={`mt-5 rounded-xl px-4 py-3 text-sm ${result.count.accurate ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`} role="status">
      {result.count.accurate ? (
        <p className="flex items-center gap-2"><Icon name="check" size={18} /> Conteo guardado: coincide con el sistema.</p>
      ) : (
        <>
          <p className="flex items-center gap-2 font-medium"><Icon name="warning" size={18} /> Conteo guardado con {diffs.length} diferencia(s). Ajuste {result.adjustment?.folio}.</p>
          <p className="mt-1 text-xs">Las existencias de la ubicación ahora son las contadas.</p>
        </>
      )}
    </div>
  );
}
