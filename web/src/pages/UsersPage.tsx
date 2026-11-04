import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/auth";
import { useSave } from "../lib/crud";
import { useCustomers, useModuleSetting, useWarehouses } from "../lib/data";
import { ROLE_LABEL, fmtDateTime } from "../lib/format";
import type { PermissionSource, Role, User, UserAccess } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Toggle, td, th } from "../components/ui";
import { usePermissionCatalog, useRoles } from "./RolesPage";
import { useGroups } from "./GroupsPage";

// Users (Tesina §4.5.10 "Administración de usuarios"): only the administrator
// creates accounts and decides their base role, extra roles, warehouses and
// individual permission exceptions (each one justified and audited).

const ROLE_HINT: Record<Role, string> = {
  operator: "Rol base. Sus permisos se ajustan en «Roles y permisos».",
  supervisor: "Rol base. Sus permisos se ajustan en «Roles y permisos».",
  admin: "Todo, en todos los almacenes, incluidas las facultades exclusivas: módulos, roles, grupos, usuarios y permisos.",
  client: "Solo portal: consulta del inventario y movimientos de su cliente 3PL.",
};

const SOURCE_LABEL: Record<PermissionSource["kind"], string> = {
  role: "Rol base", custom_role: "Rol adicional", group: "Grupo", allow: "Excepción", deny: "Denegado", admin: "Administrador", client: "Cliente 3PL",
};

export default function UsersPage() {
  const session = useSession();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: User[] }>("/users").then(r => r.users) });
  const roles = useRoles();
  const { data: warehouses } = useWarehouses();
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const roleName = (id: string) => roles.data?.find(r => r._id === id)?.name;
  const warehouseName = (id: string) => warehouses?.find(w => w._id === id)?.name;

  return (
    <>
      <PageHeader title="Usuarios" description={`Cuentas de ${session.company.name}. Inician sesión con el código de empresa «${session.company.slug}».`} actions={<Button icon="plus" onClick={() => setEditing("new")}>Nuevo usuario</Button>} />
      <Card padded={false}>
        {users.isPending ? <Loading /> : users.isError ? <div className="p-4"><ErrorBox message={errorMessage(users.error)} /></div> : !users.data.length ? (
          <EmptyState icon="users" title="Sin usuarios" />
        ) : (
          <Table>
            <thead><tr><th className={th}>Nombre</th><th className={th}>Correo</th><th className={th}>Rol</th><th className={th}>Almacenes</th><th className={th}>Excepciones</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {users.data.map(u => (
                <tr key={u._id} onClick={() => setEditing(u)} className="cursor-pointer hover:bg-slate-50">
                  <td className={`${td} font-medium`}>{u.name}{u._id === session.user.id && <span className="ml-2 text-xs text-slate-400">(tú)</span>}</td>
                  <td className={td}>{u.email}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={u.role === "admin" ? "info" : u.role === "client" ? "warning" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
                      {u.roleIds?.map(id => roleName(id) && <Badge key={id}>{roleName(id)}</Badge>)}
                    </div>
                    {u.customerId && <p className="mt-0.5 text-xs text-slate-500">{u.customerId.code} · {u.customerId.name}</p>}
                  </td>
                  <td className={td}>{u.role === "admin" || !u.warehouseIds?.length ? <span className="text-slate-400">Todos</span> : u.warehouseIds.map(warehouseName).filter(Boolean).join(", ")}</td>
                  <td className={td}>{u.permissionOverrides?.length ? <Badge variant="warning">{u.permissionOverrides.length}</Badge> : <span className="text-slate-400">—</span>}</td>
                  <td className={td}>{u.active === false ? <Badge>Inactivo</Badge> : <Badge variant="success">Activo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <UserForm user={editing === "new" ? null : editing} isSelf={editing !== "new" && editing._id === session.user.id} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserForm({ user, isSelf, onClose }: { user: User | null; isSelf: boolean; onClose: () => void }) {
  const customers = useCustomers();
  const roles = useRoles();
  const { data: warehouses } = useWarehouses();
  const [form, setForm] = useState({
    name: user?.name ?? "", email: user?.email ?? "", role: (user?.role ?? "operator") as Role,
    customerId: user?.customerId?._id ?? "", password: "", active: user?.active !== false,
    roleIds: user?.roleIds ?? [], warehouseIds: user?.warehouseIds ?? [],
  });
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));
  const save = useSave("users", ["users", "user-access", "roles"], onClose);
  const minPassword = Math.max(8, Number(useModuleSetting("admin", "minPasswordLength")) || 8);
  const passwordOk = user ? form.password === "" || form.password.length >= minPassword : form.password.length >= minPassword;
  const valid = form.name.trim() && form.email.trim() && passwordOk && (form.role !== "client" || form.customerId);
  const staff = form.role === "operator" || form.role === "supervisor";
  const customRoles = roles.data?.filter(r => !r.system && r.active) ?? [];

  return (
    <Modal
      open wide title={user ? `Editar ${user.name}` : "Nuevo usuario"} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate({
        id: user?._id,
        body: {
          name: form.name, email: form.email, role: form.role,
          customerId: form.role === "client" ? form.customerId : null,
          roleIds: staff ? form.roleIds : [],
          warehouseIds: form.role === "admin" ? [] : form.warehouseIds,
          ...(form.password ? { password: form.password } : {}),
          ...(user ? { active: form.active } : {}),
        },
      })}>Guardar</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre"><Input value={form.name} onChange={e => set({ name: e.target.value })} autoFocus={!user} /></Field>
        <Field label="Correo"><Input type="email" value={form.email} onChange={e => set({ email: e.target.value })} autoComplete="off" /></Field>
        <Field label="Rol base" hint={ROLE_HINT[form.role]}>
          <Select value={form.role} onChange={e => set({ role: e.target.value as Role })} disabled={isSelf}>
            {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        <Field label={user ? "Nueva contraseña (opcional)" : "Contraseña"} hint={`Mínimo ${minPassword} caracteres.`} error={!passwordOk && form.password ? "Muy corta." : undefined}>
          <Input type="password" value={form.password} onChange={e => set({ password: e.target.value })} autoComplete="new-password" />
        </Field>
        {form.role === "client" && (
          <Field label="Cliente 3PL" className="sm:col-span-2">
            <Select value={form.customerId} onChange={e => set({ customerId: e.target.value })}>
              <option value="">Selecciona…</option>
              {customers.data?.map(c => <option key={c._id} value={c._id}>{c.code} · {c.name}</option>)}
            </Select>
          </Field>
        )}
        {staff && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-600">Roles adicionales</span>
            {customRoles.length ? (
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-xl border border-slate-200 px-3 py-2">
                {customRoles.map(r => (
                  <label key={r._id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.roleIds.includes(r._id)}
                      onChange={e => set({ roleIds: e.target.checked ? [...form.roleIds, r._id] : form.roleIds.filter(id => id !== r._id) })} />
                    {r.name}
                  </label>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">No hay roles personalizados. Créalos en «Roles y permisos».</p>}
          </div>
        )}
        {form.role !== "admin" && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-600">Almacenes permitidos</span>
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-xl border border-slate-200 px-3 py-2">
              {warehouses?.map(w => (
                <label key={w._id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.warehouseIds.includes(w._id)}
                    onChange={e => set({ warehouseIds: e.target.checked ? [...form.warehouseIds, w._id] : form.warehouseIds.filter(id => id !== w._id) })} />
                  {w.name}
                </label>
              ))}
            </div>
            <span className="text-xs text-slate-500">Sin marcar = todos (salvo que un grupo lo limite).</span>
          </div>
        )}
        {user && !isSelf && (
          <label className="flex items-center gap-3 text-sm text-slate-700 sm:col-span-2">
            <Toggle checked={form.active} onChange={v => set({ active: v })} label="Activo" /> Activo (inactivo = pierde el acceso de inmediato, también con la sesión abierta)
          </label>
        )}
        {isSelf && <p className="text-xs text-slate-500 sm:col-span-2">No puedes cambiar tu propio rol ni desactivar tu cuenta.</p>}
      </div>
      {save.isError && <div className="mt-4"><ErrorBox message={errorMessage(save.error)} /></div>}
      {user && (user.role === "operator" || user.role === "supervisor") && user.role === form.role && <UserPermissions user={user} />}
    </Modal>
  );
}

/** Effective permissions (with where each comes from) and individual exceptions. */
function UserPermissions({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const catalog = usePermissionCatalog();
  const groups = useGroups();
  const access = useQuery({
    queryKey: ["user-access", user._id],
    queryFn: () => api.get<UserAccess>(`/users/${user._id}/access`),
  });
  const [overrides, setOverrides] = useState(user.permissionOverrides ?? []);
  const [draft, setDraft] = useState({ permission: "", effect: "deny" as "allow" | "deny", reason: "" });
  const [removing, setRemoving] = useState<{ permission: string; reason: string } | null>(null);

  const done = (data: { user: User }) => {
    setOverrides(data.user.permissionOverrides ?? []);
    ["users", "user-access", "audit"].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  };
  const add = useMutation({
    mutationFn: () => api.post<{ user: User }>(`/users/${user._id}/overrides`, draft),
    onSuccess: data => { done(data); setDraft({ permission: "", effect: "deny", reason: "" }); },
  });
  const remove = useMutation({
    mutationFn: (body: { permission: string; reason: string }) => api.post<{ user: User }>(`/users/${user._id}/overrides/remove`, body),
    onSuccess: data => { done(data); setRemoving(null); },
  });

  const label = (key: string) => catalog.data?.permissions.find(p => p.key === key)?.label ?? key;
  const grantable = catalog.data?.permissions.filter(p => !p.reserved) ?? [];
  const memberOf = (groups.data ?? []).filter(g => g.memberIds.includes(user._id));

  return (
    <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Permisos efectivos</h3>
        <p className="text-xs text-slate-500">
          Resultado de su rol base, roles adicionales{memberOf.length ? `, grupos (${memberOf.map(g => g.name).join(", ")})` : ""} y excepciones, menos lo que pertenece a módulos inactivos. Se guardan los cambios de arriba primero.
        </p>
      </div>
      {access.isPending ? <Loading /> : access.isError ? <ErrorBox message={errorMessage(access.error)} /> : (
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {Object.entries(access.data.sources).sort(([a], [b]) => a.localeCompare(b)).map(([perm, sources]) => {
            const denied = sources.some(s => s.kind === "deny");
            const blocked = access.data.blockedByModule.includes(perm);
            return (
              <li key={perm} className={`rounded-lg px-2 py-1 ${denied ? "bg-red-50 text-red-800 line-through" : blocked ? "bg-slate-50 text-slate-400" : "bg-emerald-50 text-emerald-900"}`} title={sources.map(s => `${SOURCE_LABEL[s.kind]}: ${s.name}`).join("\n")}>
                {label(perm)}
                <span className="ml-1 text-[10px] no-underline opacity-70">({blocked ? "módulo inactivo" : sources.map(s => SOURCE_LABEL[s.kind]).join(", ")})</span>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-800">Excepciones individuales</h3>
        <p className="text-xs text-slate-500">Conceden o niegan un permiso solo a esta persona, sin cambiar su rol ni sus grupos. Cada una requiere justificación y queda en la bitácora.</p>
      </div>
      {overrides.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate-100 rounded-xl border border-slate-200">
          {overrides.map(o => (
            <li key={o.permission} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <Badge variant={o.effect === "allow" ? "success" : "danger"}>{o.effect === "allow" ? "Concedido" : "Denegado"}</Badge>
              <span className="flex-1">{label(o.permission)}</span>
              <span className="w-full text-xs text-slate-500">«{o.reason}» · {o.grantedByName} · {fmtDateTime(o.grantedAt)}</span>
              {removing?.permission === o.permission ? (
                <div className="flex w-full gap-2">
                  <Input value={removing.reason} onChange={e => setRemoving({ ...removing, reason: e.target.value })} placeholder="Motivo para quitar la excepción" autoFocus />
                  <Button size="sm" variant="danger" disabled={removing.reason.trim().length < 5} loading={remove.isPending} onClick={() => remove.mutate(removing)}>Quitar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancelar</Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setRemoving({ permission: o.permission, reason: "" })}>Quitar</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Select value={draft.permission} onChange={e => setDraft({ ...draft, permission: e.target.value })} aria-label="Permiso">
          <option value="">Permiso…</option>
          {grantable.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
        <Select value={draft.effect} onChange={e => setDraft({ ...draft, effect: e.target.value as "allow" | "deny" })} aria-label="Efecto">
          <option value="deny">Denegar</option>
          <option value="allow">Conceder</option>
        </Select>
        <Input value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} placeholder="Justificación (obligatoria)" maxLength={300} />
        <Button variant="secondary" icon="plus" disabled={!draft.permission || draft.reason.trim().length < 5} loading={add.isPending} onClick={() => add.mutate()}>Agregar</Button>
      </div>
      {(add.isError || remove.isError) && <ErrorBox message={errorMessage(add.error ?? remove.error)} />}
    </div>
  );
}
