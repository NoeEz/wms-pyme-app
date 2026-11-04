import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import "./labels.css";
import { useLocations, useProducts, useWarehouseFilter, useWarehouses } from "../lib/data";
import { Button, Card, Field, Input, PageHeader, SearchInput, Select } from "../components/ui";

// Printable QR labels in the versioned WMS PyME format the app scans
// (src/services/scanCodes.ts in the mobile app):
//   products:  WMSPYME|v1|sku=<SKU>[|lot=<LOT>]
//   locations: WMSPYME|v1|loc=<CODE> — reserved for location scanning; the
//              app's v1 parser ignores unknown keys, so today it reports
//              "Código sin producto identificado" instead of misreading it.
interface Label { key: string; payload: string; title: string; subtitle: string }

const productPayload = (sku: string, lot: string) => `WMSPYME|v1|sku=${sku}${lot ? `|lot=${lot}` : ""}`;
const locationPayload = (code: string) => `WMSPYME|v1|loc=${code}`;

function QrImage({ payload }: { payload: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(payload, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setSrc).catch(() => setSrc(""));
  }, [payload]);
  return src ? <img src={src} alt={payload} className="h-28 w-28" /> : <div className="h-28 w-28 bg-slate-100" />;
}

export default function LabelsPage() {
  const [kind, setKind] = useState<"products" | "locations">("products");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [copies, setCopies] = useState("1");
  const [lot, setLot] = useState("");
  const { warehouseId: filterWarehouse } = useWarehouseFilter();
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState(filterWarehouse);
  useEffect(() => { if (!warehouseId && warehouses?.length) setWarehouseId(filterWarehouse || warehouses[0]._id); }, [warehouses, warehouseId, filterWarehouse]);
  const products = useProducts();
  const locations = useLocations(warehouseId);

  useEffect(() => setPicked(new Set()), [kind, warehouseId]);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = kind === "products"
      ? (products.data ?? []).map(p => ({ id: p._id, title: p.sku, subtitle: p.name }))
      : (locations.data ?? []).map(l => ({ id: l._id, title: l.code, subtitle: `${l.zone} · ${l.aisle} · ${l.rack} · ${l.position}` }));
    return all.filter(o => !q || o.title.toLowerCase().includes(q) || o.subtitle.toLowerCase().includes(q));
  }, [kind, products.data, locations.data, search]);

  const labels: Label[] = useMemo(() => {
    const n = Math.max(1, Math.min(50, Number(copies) || 1));
    const chosen = options.filter(o => picked.has(o.id));
    return chosen.flatMap(o => Array.from({ length: n }, (_, i) => ({
      key: `${o.id}-${i}`,
      payload: kind === "products" ? productPayload(o.title, lot.trim()) : locationPayload(o.title),
      title: o.title,
      subtitle: kind === "products" && lot.trim() ? `${o.subtitle} · Lote ${lot.trim()}` : o.subtitle,
    })));
  }, [options, picked, copies, lot, kind]);

  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Etiquetas QR"
          description="Genera etiquetas en el formato que lee la app (cámara o lector) y mándalas a la impresora."
          actions={<Button icon="print" disabled={!labels.length} onClick={() => window.print()}>Imprimir {labels.length || ""}</Button>}
        />
        <Card className="mb-6">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>label]:min-w-0">
            <Field label="Etiquetas de">
              <Select value={kind} onChange={e => setKind(e.target.value as "products" | "locations")}>
                <option value="products">Productos</option>
                <option value="locations">Ubicaciones</option>
              </Select>
            </Field>
            {kind === "locations" ? (
              <Field label="Almacén">
                <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                  {warehouses?.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                </Select>
              </Field>
            ) : (
              <Field label="Lote (opcional)" hint="Se incluye en el QR."><Input value={lot} onChange={e => setLot(e.target.value)} /></Field>
            )}
            <Field label="Copias de cada una"><Input type="number" min={1} max={50} value={copies} onChange={e => setCopies(e.target.value)} /></Field>
          </div>
          <div className="mt-6 flex min-w-0 flex-col items-stretch gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:flex-wrap sm:items-center [&>button]:min-h-10 [&>button]:rounded-lg [&>button]:border [&>button]:border-slate-200 [&>button]:bg-slate-50 [&>button]:px-3 [&>button]:text-slate-700 [&>button:hover]:border-indigo-200 [&>button:hover]:bg-indigo-50 [&>button:hover]:text-indigo-700">
            <SearchInput value={search} onChange={setSearch} className="w-full min-w-0 sm:min-w-60 sm:flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setPicked(new Set(options.map(o => o.id)))}>Seleccionar todo</Button>
            <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>Ninguno</Button>
          </div>
          <ul className="mt-4 grid max-h-80 min-w-0 grid-cols-1 gap-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {options.map(o => (
              <li key={o.id}>
                <label className="grid min-h-20 min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] content-center items-start gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm transition-colors hover:border-indigo-300 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                  <input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} className="row-span-2 mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />
                  <span className="min-w-0 break-all font-mono text-xs font-semibold leading-relaxed text-slate-900">{o.title}</span>
                  <span className="min-w-0 break-words text-xs leading-relaxed text-slate-600">{o.subtitle}</span>
                </label>
              </li>
            ))}
            {!options.length && <li className="col-span-full px-4 py-8 text-center text-sm text-slate-500">Sin resultados.</li>}
          </ul>
        </Card>
      </div>

      {labels.length > 0 && (
        <div className="print-area qr-label-preview rounded-2xl border border-slate-200 bg-white p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {labels.map(l => (
              <div key={l.key} className="flex break-inside-avoid items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3">
                <QrImage payload={l.payload} />
                <div className="min-w-0">
                  <p className="break-all font-mono text-base font-bold text-slate-900">{l.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{l.subtitle}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">WMS PyME</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
