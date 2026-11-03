import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../lib/api";
import { useSave } from "../lib/crud";
import { useLocations, useWarehouseFilter, useWarehouses } from "../lib/data";
import type { Location } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, SearchInput, Select, Table, Toggle, td, th } from "../components/ui";

// "Zona A" + "Pasillo 03" + "Rack 02" + "Posición 04" → "A-03-R02-P04", the
// compact code format the demo data and printed labels use.
function suggestCode(zone: string, aisle: string, rack: string, position: string): string {
  const last = (s: string) => s.trim().split(/\s+/).pop() ?? "";
  const parts = [last(zone), last(aisle), rack.trim() && `R${last(rack).replace(/^R/i, "")}`, position.trim() && `P${last(position).replace(/^P/i, "")}`];
  return parts.filter(Boolean).join("-").toUpperCase();
}

export default function LocationsPage() {
  const { warehouseId: filterWarehouse } = useWarehouseFilter();
  const { data: warehouses } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState(filterWarehouse);
  useEffect(() => { if (filterWarehouse) setWarehouseId(filterWarehouse); }, [filterWarehouse]);
  useEffect(() => { if (!warehouseId && warehouses?.length) setWarehouseId(warehouses[0]._id); }, [warehouses, warehouseId]);

  const locations = useLocations(warehouseId, true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Location | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (locations.data ?? []).filter(l =>
      (showInactive || l.active !== false)
      && (!q || [l.code, l.zone, l.aisle, l.rack, l.position].some(s => s.toLowerCase().includes(q))));
  }, [locations.data, search, showInactive]);

  return (
    <>
      <PageHeader
        title="Ubicaciones"
        description="Zona / pasillo / rack / posición de cada almacén. El código es lo que se imprime en la etiqueta."
        actions={<Button icon="plus" disabled={!warehouseId} onClick={() => setEditing("new")}>Nueva ubicación</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 p-4">
          <Select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-60" aria-label="Almacén">
            {warehouses?.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
          </Select>
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar código, zona, pasillo…" className="min-w-60 flex-1" />
          <label className="flex items-center gap-2 text-sm text-slate-600"><Toggle checked={showInactive} onChange={setShowInactive} label="Mostrar inactivas" /> Mostrar inactivas</label>
        </div>
        {locations.isPending ? <Loading /> : locations.isError ? <div className="p-4"><ErrorBox message={errorMessage(locations.error)} /></div> : !filtered.length ? (
          <EmptyState icon="location" title="Sin ubicaciones" description="Crea la primera ubicación de este almacén." />
        ) : (
          <Table>
            <thead><tr><th className={th}>Código</th><th className={th}>Zona</th><th className={th}>Pasillo</th><th className={th}>Rack</th><th className={th}>Posición</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l._id} onClick={() => setEditing(l)} className="cursor-pointer hover:bg-slate-50">
                  <td className={`${td} font-mono text-xs font-medium`}>{l.code}</td>
                  <td className={td}>{l.zone}</td><td className={td}>{l.aisle}</td><td className={td}>{l.rack}</td><td className={td}>{l.position}</td>
                  <td className={td}>{l.active === false ? <Badge>Inactiva</Badge> : <Badge variant="success">Activa</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <LocationForm warehouseId={warehouseId} location={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function LocationForm({ warehouseId, location, onClose }: { warehouseId: string; location: Location | null; onClose: () => void }) {
  const [form, setForm] = useState({
    zone: location?.zone ?? "", aisle: location?.aisle ?? "", rack: location?.rack ?? "", position: location?.position ?? "",
    code: location?.code ?? "", active: location?.active !== false,
  });
  const [codeTouched, setCodeTouched] = useState(!!location);
  const set = (patch: Partial<typeof form>) => setForm(f => {
    const next = { ...f, ...patch };
    return codeTouched ? next : { ...next, code: suggestCode(next.zone, next.aisle, next.rack, next.position) };
  });
  const save = useSave("locations", ["locations", "inventory"], onClose);
  const valid = form.zone.trim() && form.aisle.trim() && form.rack.trim() && form.position.trim() && form.code.trim();

  return (
    <Modal
      open title={location ? `Editar ${location.code}` : "Nueva ubicación"} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate({
        id: location?._id,
        body: { zone: form.zone, aisle: form.aisle, rack: form.rack, position: form.position, code: form.code, ...(location ? { active: form.active } : { warehouseId }) },
      })}>Guardar</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Zona"><Input value={form.zone} onChange={e => set({ zone: e.target.value })} placeholder="Zona A" autoFocus={!location} /></Field>
        <Field label="Pasillo"><Input value={form.aisle} onChange={e => set({ aisle: e.target.value })} placeholder="Pasillo 03" /></Field>
        <Field label="Rack"><Input value={form.rack} onChange={e => set({ rack: e.target.value })} placeholder="Rack 02" /></Field>
        <Field label="Posición"><Input value={form.position} onChange={e => set({ position: e.target.value })} placeholder="Posición 04" /></Field>
        <Field label="Código" hint="Único en el almacén. Se sugiere a partir de los campos." className="sm:col-span-2">
          <Input value={form.code} onChange={e => { setCodeTouched(true); setForm(f => ({ ...f, code: e.target.value.toUpperCase() })); }} className="font-mono" />
        </Field>
        {location && (
          <label className="flex items-center gap-3 text-sm text-slate-700 sm:col-span-2">
            <Toggle checked={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} label="Activa" /> Activa (solo se puede desactivar sin existencias)
          </label>
        )}
      </div>
      {save.isError && <div className="mt-4"><ErrorBox message={errorMessage(save.error)} /></div>}
    </Modal>
  );
}
