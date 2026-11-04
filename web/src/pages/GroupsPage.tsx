import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useSave } from "../lib/crud";
import { useWarehouses } from "../lib/data";
import type { Group, User } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Table, Toggle, td, th } from "../components/ui";
import { useRoles } from "./RolesPage";

// Work groups (Tesina §4.5.10): give several users the same roles at once
// and, optionally, restrict them to some warehouses. Administrator only.

export function useGroups() {
  return useQuery({ queryKey: ["groups"], queryFn: () => api.get<{ groups: Group[] }>("/groups").then(r => r.groups) });
}

function useStaff() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: User[] }>("/users").then(r => r.users),
    select: users => users.filter(u => u.role !== "client"),
  });
}

export default function GroupsPage() {
  const groups = useGroups();
  const roles = useRoles();
  const { data: warehouses } = useWarehouses();
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const roleName = (id: string) => roles.data?.find(r => r._id === id)?.name ?? "—";
  const warehouseName = (id: string) => warehouses?.find(w => w._id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Grupos"
        description="Los miembros de un grupo reciben los permisos de sus roles. Si el grupo limita almacenes, sus miembros solo operan y consultan esos almacenes (también en reportes)."
        actions={<Button icon="plus" onClick={() => setEditing("new")}>Nuevo grupo</Button>}
      />
      <Card padded={false}>
        {groups.isPending ? <Loading /> : groups.isError ? <div className="p-4"><ErrorBox message={errorMessage(groups.error)} /></div> : !groups.data.length ? (
          <EmptyState icon="customers" title="Sin grupos" description="Crea un grupo para asignar roles y almacenes a varias personas a la vez." />
        ) : (
          <Table>
            <thead><tr><th className={th}>Grupo</th><th className={th}>Roles</th><th className={th}>Almacenes</th><th className={`${th} text-right`}>Miembros</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {groups.data.map(g => (
                <tr key={g._id} onClick={() => setEditing(g)} className="cursor-pointer hover:bg-slate-50">
                  <td className={td}>
                    <p className="font-medium text-slate-800">{g.name}</p>
                    {g.description && <p className="max-w-md truncate text-xs text-slate-500">{g.description}</p>}
                  </td>
                  <td className={td}>{g.roleIds.length ? g.roleIds.map(roleName).join(", ") : <span className="text-slate-400">—</span>}</td>
                  <td className={td}>{g.warehouseIds.length ? g.warehouseIds.map(warehouseName).join(", ") : <span className="text-slate-400">Sin límite</span>}</td>
                  <td className={`${td} tabular text-right`}>{g.memberIds.length}</td>
                  <td className={td}>{g.active ? <Badge variant="success">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <GroupForm group={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CheckList<T extends { _id: string }>({ items, value, onChange, render, empty }: {
  items: T[] | undefined; value: string[]; onChange: (v: string[]) => void; render: (item: T) => ReactNode; empty: string;
}) {
  if (!items) return <Loading />;
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto rounded-xl border border-slate-200 px-3 py-2">
      {items.map(item => (
        <label key={item._id} className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox" className="h-4 w-4 accent-indigo-600" checked={value.includes(item._id)}
            onChange={e => onChange(e.target.checked ? [...value, item._id] : value.filter(id => id !== item._id))}
          />
          {render(item)}
        </label>
      ))}
    </div>
  );
}

function GroupForm({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const roles = useRoles();
  const staff = useStaff();
  const { data: warehouses } = useWarehouses();
  const [form, setForm] = useState({
    name: group?.name ?? "", description: group?.description ?? "",
    memberIds: group?.memberIds ?? [], roleIds: group?.roleIds ?? [], warehouseIds: group?.warehouseIds ?? [],
    active: group?.active !== false,
  });
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));
  const save = useSave("groups", ["groups", "roles"], onClose);
  // The admin role can't go to a group; predefined operator/supervisor can.
  const assignable = roles.data?.filter(r => r.key !== "admin" && r.active);

  return (
    <Modal
      open wide title={group ? `Editar ${group.name}` : "Nuevo grupo"} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={form.name.trim().length < 2} onClick={() => save.mutate({ id: group?._id, body: group ? form : { ...form, active: undefined } })}>Guardar</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre"><Input value={form.name} onChange={e => set({ name: e.target.value })} autoFocus={!group} /></Field>
        <Field label="Descripción"><Input value={form.description} onChange={e => set({ description: e.target.value })} maxLength={240} /></Field>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-600">Roles del grupo</span>
          <CheckList items={assignable} value={form.roleIds} onChange={roleIds => set({ roleIds })} empty="No hay roles asignables." render={r => <>{r.name}{r.system && <Badge variant="info">Predeterminado</Badge>}</>} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-600">Limitar a estos almacenes</span>
          <CheckList items={warehouses} value={form.warehouseIds} onChange={warehouseIds => set({ warehouseIds })} empty="No hay almacenes." render={w => w.name} />
          <span className="text-xs text-slate-500">Sin marcar ninguno = el grupo no limita almacenes.</span>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-slate-600">Miembros</span>
          <CheckList
            items={staff.data} value={form.memberIds} onChange={memberIds => set({ memberIds })} empty="No hay usuarios del personal."
            render={u => <><span className="flex-1">{u.name}</span><span className="text-xs text-slate-400">{u.email}</span>{u.role === "admin" && <Badge variant="info">Admin</Badge>}</>}
          />
          <span className="text-xs text-slate-500">Los administradores conservan todos sus permisos y almacenes aunque estén en un grupo.</span>
        </div>
        {group && (
          <label className="flex items-center gap-3 text-sm text-slate-700 sm:col-span-2">
            <Toggle checked={form.active} onChange={v => set({ active: v })} label="Activo" /> Activo (inactivo = sus miembros dejan de recibir sus roles y límites)
          </label>
        )}
      </div>
      {save.isError && <div className="mt-4"><ErrorBox message={errorMessage(save.error)} /></div>}
    </Modal>
  );
}
