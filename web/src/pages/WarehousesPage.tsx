import { useState } from "react";
import { errorMessage } from "../lib/api";
import { useSave } from "../lib/crud";
import { useWarehouses } from "../lib/data";
import type { Warehouse } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Table, Toggle, td, th } from "../components/ui";

export default function WarehousesPage() {
  const warehouses = useWarehouses();
  const [editing, setEditing] = useState<Warehouse | "new" | null>(null);
  return (
    <>
      <PageHeader title="Almacenes" description="Los operadores eligen el almacén al iniciar su turno en la app." actions={<Button icon="plus" onClick={() => setEditing("new")}>Nuevo almacén</Button>} />
      <Card padded={false} className="overflow-hidden [&_th]:whitespace-nowrap [&_td.tabular]:whitespace-nowrap [&_td:first-child]:font-medium">
        {warehouses.isPending ? <Loading /> : warehouses.isError ? <div className="p-4"><ErrorBox message={errorMessage(warehouses.error)} /></div> : !warehouses.data.length ? (
          <EmptyState icon="warehouse" title="Sin almacenes" />
        ) : (
          <Table>
            <thead><tr><th className={th}>Nombre</th><th className={th}>Ciudad</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {warehouses.data.map(w => (
                <tr key={w._id} onClick={() => setEditing(w)} className="cursor-pointer">
                  <td className={`${td} font-medium`}>{w.name}</td><td className={td}>{w.city}</td>
                  <td className={td}>{w.state === "active" ? <Badge variant="success">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <WarehouseForm warehouse={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function WarehouseForm({ warehouse, onClose }: { warehouse: Warehouse | null; onClose: () => void }) {
  const [name, setName] = useState(warehouse?.name ?? "");
  const [city, setCity] = useState(warehouse?.city ?? "");
  const [active, setActive] = useState(warehouse?.state !== "inactive");
  const save = useSave("warehouses", ["warehouses"], onClose);
  return (
    <Modal
      open title={warehouse ? `Editar ${warehouse.name}` : "Nuevo almacén"} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!name.trim() || !city.trim()} onClick={() => save.mutate({ id: warehouse?._id, body: { name, city, state: active ? "active" : "inactive" } })}>Guardar</Button></>}
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre"><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></Field>
        <Field label="Ciudad"><Input value={city} onChange={e => setCity(e.target.value)} placeholder="Monterrey, NL" /></Field>
        <label className="flex items-center gap-3 text-sm text-slate-700"><Toggle checked={active} onChange={setActive} label="Activo" /> Activo</label>
      </div>
      {save.isError && <div className="mt-4"><ErrorBox message={errorMessage(save.error)} /></div>}
    </Modal>
  );
}
