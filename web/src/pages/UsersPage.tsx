import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useSession } from "../lib/auth";
import { useSave } from "../lib/crud";
import { useCustomers } from "../lib/data";
import { ROLE_LABEL } from "../lib/format";
import type { Role, User } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Toggle, td, th } from "../components/ui";

const ROLE_HINT: Record<Role, string> = {
  operator: "App móvil: entradas, salidas, transferencias. Portal: solo consulta.",
  supervisor: "Además: catálogo de productos y ubicaciones, conteos y bitácora.",
  admin: "Todo, incluidos almacenes, usuarios, clientes 3PL y módulos.",
  client: "Solo portal: consulta del inventario y movimientos de su cliente 3PL.",
};

export default function UsersPage() {
  const session = useSession();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: User[] }>("/users").then(r => r.users) });
  const [editing, setEditing] = useState<User | "new" | null>(null);

  return (
    <>
      <PageHeader title="Usuarios" description={`Cuentas de ${session.company.name}. Inician sesión con el código de empresa «${session.company.slug}».`} actions={<Button icon="plus" onClick={() => setEditing("new")}>Nuevo usuario</Button>} />
      <Card padded={false} className="overflow-hidden [&_th]:whitespace-nowrap [&_td.tabular]:whitespace-nowrap [&_td:first-child]:font-medium">
        {users.isPending ? <Loading /> : users.isError ? <div className="p-4"><ErrorBox message={errorMessage(users.error)} /></div> : !users.data.length ? (
          <EmptyState icon="users" title="Sin usuarios" />
        ) : (
          <Table>
            <thead><tr><th className={th}>Nombre</th><th className={th}>Correo</th><th className={th}>Rol</th><th className={th}>Cliente 3PL</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {users.data.map(u => (
                <tr key={u._id} onClick={() => setEditing(u)} className="cursor-pointer">
                  <td className={`${td} font-medium`}>{u.name}{u._id === session.user.id && <span className="ml-2 text-xs text-slate-500">(tú)</span>}</td>
                  <td className={td}>{u.email}</td>
                  <td className={td}><Badge variant={u.role === "admin" ? "info" : u.role === "client" ? "warning" : "neutral"}>{ROLE_LABEL[u.role]}</Badge></td>
                  <td className={td}>{u.customerId ? `${u.customerId.code} · ${u.customerId.name}` : <span className="text-slate-500">—</span>}</td>
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
  const [form, setForm] = useState({
    name: user?.name ?? "", email: user?.email ?? "", role: (user?.role ?? "operator") as Role,
    customerId: user?.customerId?._id ?? "", password: "", active: user?.active !== false,
  });
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));
  const save = useSave("users", ["users"], onClose);
  const passwordOk = user ? form.password === "" || form.password.length >= 8 : form.password.length >= 8;
  const valid = form.name.trim() && form.email.trim() && passwordOk && (form.role !== "client" || form.customerId);

  return (
    <Modal
      open title={user ? `Editar ${user.name}` : "Nuevo usuario"} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate({
        id: user?._id,
        body: {
          name: form.name, email: form.email, role: form.role,
          customerId: form.role === "client" ? form.customerId : null,
          ...(form.password ? { password: form.password } : {}),
          ...(user ? { active: form.active } : {}),
        },
      })}>Guardar</Button></>}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>label]:min-w-0">
        <Field label="Nombre" className="sm:col-span-2"><Input value={form.name} onChange={e => set({ name: e.target.value })} autoFocus={!user} /></Field>
        <Field label="Correo" className="sm:col-span-2"><Input type="email" value={form.email} onChange={e => set({ email: e.target.value })} autoComplete="off" /></Field>
        <Field label="Rol" hint={ROLE_HINT[form.role]} className="sm:col-span-2">
          <Select value={form.role} onChange={e => set({ role: e.target.value as Role })} disabled={isSelf}>
            {(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        {form.role === "client" && (
          <Field label="Cliente 3PL" className="sm:col-span-2">
            <Select value={form.customerId} onChange={e => set({ customerId: e.target.value })}>
              <option value="">Selecciona…</option>
              {customers.data?.map(c => <option key={c._id} value={c._id}>{c.code} · {c.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={user ? "Nueva contraseña (opcional)" : "Contraseña"} hint="Mínimo 8 caracteres." error={!passwordOk && form.password ? "Muy corta." : undefined} className="sm:col-span-2">
          <Input type="password" value={form.password} onChange={e => set({ password: e.target.value })} autoComplete="new-password" />
        </Field>
        {user && !isSelf && (
          <label className="flex items-center gap-3 text-sm text-slate-700 sm:col-span-2">
            <Toggle checked={form.active} onChange={v => set({ active: v })} label="Activo" /> Activo (inactivo = no puede iniciar sesión)
          </label>
        )}
        {isSelf && <p className="text-xs text-slate-500 sm:col-span-2">No puedes cambiar tu propio rol ni desactivar tu cuenta.</p>}
      </div>
      {save.isError && <div className="mt-4"><ErrorBox message={errorMessage(save.error)} /></div>}
    </Modal>
  );
}
