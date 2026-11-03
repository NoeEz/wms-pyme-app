import { useState } from "react";
import { errorMessage } from "../lib/api";
import { useSave } from "../lib/crud";
import { useCustomers, useProducts } from "../lib/data";
import type { Customer } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, Table, Toggle, td, th } from "../components/ui";

export default function CustomersPage() {
  const customers = useCustomers();
  const products = useProducts(true);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const productCount = (id: string) => products.data?.filter(p => p.customerId === id).length ?? 0;

  return (
    <>
      <PageHeader
        title="Clientes 3PL"
        description="Empresas cuya mercancía resguardas. Asigna sus productos en Productos y dales acceso con un usuario de rol «Cliente 3PL»."
        actions={<Button icon="plus" onClick={() => setEditing("new")}>Nuevo cliente</Button>}
      />
      <Card padded={false}>
        {customers.isPending ? <Loading /> : customers.isError ? <div className="p-4"><ErrorBox message={errorMessage(customers.error)} /></div> : !customers.data.length ? (
          <EmptyState icon="customers" title="Sin clientes 3PL" description="Si solo almacenas mercancía propia, no necesitas dar de alta clientes." />
        ) : (
          <Table>
            <thead><tr><th className={th}>Código</th><th className={th}>Nombre</th><th className={th}>Contacto</th><th className={`${th} text-right`}>Productos</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {customers.data.map(c => (
                <tr key={c._id} onClick={() => setEditing(c)} className="cursor-pointer hover:bg-slate-50">
                  <td className={`${td} font-mono text-xs font-medium`}>{c.code}</td>
                  <td className={td}>{c.name}</td>
                  <td className={td}>{c.contactEmail ?? <span className="text-slate-400">—</span>}</td>
                  <td className={`${td} tabular text-right`}>{productCount(c._id)}</td>
                  <td className={td}>{c.active === false ? <Badge>Suspendido</Badge> : <Badge variant="success">Activo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <CustomerForm customer={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function CustomerForm({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const [code, setCode] = useState(customer?.code ?? "");
  const [name, setName] = useState(customer?.name ?? "");
  const [contactEmail, setContactEmail] = useState(customer?.contactEmail ?? "");
  const [active, setActive] = useState(customer?.active !== false);
  const save = useSave("customers", ["customers", "users"], onClose);
  return (
    <Modal
      open title={customer ? `Editar ${customer.code}` : "Nuevo cliente 3PL"} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!code.trim() || !name.trim()} onClick={() => save.mutate({
        id: customer?._id,
        body: { code, name, contactEmail: contactEmail.trim() || (customer ? null : undefined), ...(customer ? { active } : {}) },
      })}>Guardar</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Código"><Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="font-mono" autoFocus={!customer} /></Field>
        <Field label="Nombre" className="sm:col-span-2"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Correo de contacto" className="sm:col-span-3"><Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} /></Field>
        {customer && (
          <label className="flex items-center gap-3 text-sm text-slate-700 sm:col-span-3">
            <Toggle checked={active} onChange={setActive} label="Activo" /> Activo (suspenderlo bloquea el acceso de sus usuarios al portal)
          </label>
        )}
      </div>
      {save.isError && <div className="mt-4"><ErrorBox message={errorMessage(save.error)} /></div>}
    </Modal>
  );
}
