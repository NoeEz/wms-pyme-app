import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useSave } from "../lib/crud";
import { useModules } from "../lib/data";
import type { AccessRole, CatalogModule, PermissionDef } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Table, Toggle, td, th } from "../components/ui";
import { Icon } from "../components/Icon";

// RBAC roles (Tesina §4.5.10). Only the administrator creates roles and
// decides which permissions each carries. The administrator's own powers
// (modules, roles, users, clients, company) are never delegable.

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => api.get<{ roles: AccessRole[] }>("/roles").then(r => r.roles) });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["permission-catalog"],
    queryFn: () => api.get<{ modules: CatalogModule[]; permissions: PermissionDef[] }>("/roles/catalog"),
    staleTime: Infinity,
  });
}

export default function RolesPage() {
  const roles = useRoles();
  const [editing, setEditing] = useState<AccessRole | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Un rol es un conjunto de permisos por módulo. Asígnalos a usuarios (rol base o roles adicionales) o a grupos. Las facultades de administración son exclusivas del administrador."
        actions={<Button icon="plus" onClick={() => setEditing("new")}>Nuevo rol</Button>}
      />
      <Card padded={false}>
        {roles.isPending ? <Loading /> : roles.isError ? <div className="p-4"><ErrorBox message={errorMessage(roles.error)} /></div> : !roles.data.length ? (
          <EmptyState icon="shield" title="Sin roles" />
        ) : (
          <Table>
            <thead><tr><th className={th}>Rol</th><th className={th}>Tipo</th><th className={`${th} text-right`}>Permisos</th><th className={`${th} text-right`}>Usuarios</th><th className={`${th} text-right`}>Grupos</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {roles.data.map(r => (
                <tr key={r._id} onClick={() => setEditing(r)} className="cursor-pointer hover:bg-slate-50">
                  <td className={td}>
                    <p className="font-medium text-slate-800">{r.name}</p>
                    {r.description && <p className="max-w-md truncate text-xs text-slate-500">{r.description}</p>}
                  </td>
                  <td className={td}>{r.system ? <Badge variant="info">Predeterminado</Badge> : <Badge>Personalizado</Badge>}</td>
                  <td className={`${td} tabular text-right`}>{r.permissions.length}</td>
                  <td className={`${td} tabular text-right`}>{r.users}</td>
                  <td className={`${td} tabular text-right`}>{r.system ? "—" : r.groups}</td>
                  <td className={td}>{r.active ? <Badge variant="success">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <RoleForm role={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Permission checkboxes grouped by module; reserved ones locked, disabled modules flagged. */
export function PermissionMatrix({ value, onChange, readOnly }: { value: string[]; onChange: (v: string[]) => void; readOnly?: boolean }) {
  const catalog = usePermissionCatalog();
  const modules = useModules();
  if (catalog.isPending) return <Loading />;
  if (catalog.isError) return <ErrorBox message={errorMessage(catalog.error)} />;
  const enabled = new Set((modules.data ?? []).filter(m => m.enabled).map(m => m.key));
  const groups: { key: string; label: string; section?: string; perms: PermissionDef[] }[] = [
    ...catalog.data.modules.map(m => ({ key: m.key, label: m.label, section: m.section, perms: catalog.data.permissions.filter(p => p.module === m.key) })),
    { key: "transversal", label: "Servicios transversales", perms: catalog.data.permissions.filter(p => p.module === null) },
  ].filter(g => g.perms.length);
  const set = new Set(value);
  const toggle = (key: string, on: boolean) => onChange(on ? [...value, key] : value.filter(k => k !== key));

  return (
    <div className="flex flex-col gap-3">
      {groups.map(g => {
        const off = g.key !== "transversal" && modules.data && !enabled.has(g.key);
        return (
          <fieldset key={g.key} className="rounded-xl border border-slate-200 px-4 py-3">
            <legend className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {g.section && <span className="font-mono font-normal text-slate-400">§{g.section}</span>} {g.label}
              {off && <Badge>Módulo inactivo</Badge>}
            </legend>
            <div className="flex flex-col gap-1.5">
              {g.perms.map(p => (
                <label key={p.key} className={`flex items-start gap-2 text-sm ${p.reserved || readOnly ? "text-slate-500" : "text-slate-700"}`}>
                  <input
                    type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600"
                    checked={set.has(p.key)} disabled={readOnly || p.reserved}
                    onChange={e => toggle(p.key, e.target.checked)}
                  />
                  <span className="flex-1">{p.label} <span className="font-mono text-[11px] text-slate-400">{p.key}</span></span>
                  {p.reserved && <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-400"><Icon name="lock" size={12} /> Solo administrador</span>}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function RoleForm({ role, onClose }: { role: AccessRole | null; onClose: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const [active, setActive] = useState(role?.active !== false);
  const save = useSave("roles", ["roles"], onClose);
  const locked = role?.key === "admin";

  return (
    <Modal
      open wide title={role ? (locked ? role.name : `Editar ${role.name}`) : "Nuevo rol"} onClose={onClose}
      footer={locked ? <Button variant="secondary" onClick={onClose}>Cerrar</Button> : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={save.isPending} disabled={name.trim().length < 2} onClick={() => save.mutate({
            id: role?._id,
            body: role?.system ? { description, permissions } : { name, description, permissions, ...(role ? { active } : {}) },
          })}>Guardar</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        {locked && (
          <p className="flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <Icon name="lock" size={16} /> El administrador siempre tiene todos los permisos, incluidas las facultades exclusivas. No se puede modificar.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" hint={role?.system ? "Los roles predeterminados no se renombran." : undefined}>
            <Input value={name} onChange={e => setName(e.target.value)} disabled={role?.system} autoFocus={!role} />
          </Field>
          <Field label="Descripción">
            <Input value={description} onChange={e => setDescription(e.target.value)} disabled={locked} maxLength={240} />
          </Field>
        </div>
        {role && !role.system && (
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <Toggle checked={active} onChange={setActive} label="Activo" /> Activo (inactivo = sus usuarios y grupos dejan de recibir estos permisos)
          </label>
        )}
        <PermissionMatrix value={permissions} onChange={setPermissions} readOnly={locked} />
      </div>
      {save.isError && <div className="mt-4"><ErrorBox message={errorMessage(save.error)} /></div>}
    </Modal>
  );
}
