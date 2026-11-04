import { useMemo, useState } from "react";
import { errorMessage } from "../lib/api";
import { numberOrNull, useSave } from "../lib/crud";
import { useCustomers, useModuleSetting, useProducts } from "../lib/data";
import { fmtMoney, fmtNumber, TRACKING_LABEL } from "../lib/format";
import type { Product, Tracking } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Loading, Modal, PageHeader, SearchInput, Select, Table, Toggle, td, th } from "../components/ui";

export default function ProductsPage() {
  const products = useProducts(true);
  const customers = useCustomers();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const customerCode = (id?: string) => customers.data?.find(c => c._id === id)?.code;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter(p =>
      (showInactive || p.active !== false)
      && (!q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.barcodeValues.some(b => b.toLowerCase().includes(q))));
  }, [products.data, search, showInactive]);

  return (
    <>
      <PageHeader title="Productos" description="Catálogo de la empresa y de sus clientes 3PL." actions={<Button icon="plus" onClick={() => setEditing("new")}>Nuevo producto</Button>} />
      <Card padded={false} className="overflow-hidden [&_th]:whitespace-nowrap [&_td.tabular]:whitespace-nowrap [&_td:first-child]:font-medium">
        <div className="flex min-w-0 flex-col items-stretch gap-3 border-b border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="SKU, nombre o código de barras" className="w-full min-w-0 sm:min-w-60 sm:flex-1" />
          <label className="flex items-center gap-2 text-sm text-slate-600"><Toggle checked={showInactive} onChange={setShowInactive} label="Mostrar inactivos" /> Mostrar inactivos</label>
        </div>
        {products.isPending ? <Loading /> : products.isError ? <div className="p-4"><ErrorBox message={errorMessage(products.error)} /></div> : !filtered.length ? (
          <EmptyState icon="catalog" title="Sin productos" description="Da de alta el primero con «Nuevo producto»." />
        ) : (
          <Table>
            <thead><tr><th className={th}>SKU</th><th className={th}>Nombre</th><th className={th}>Seguimiento</th><th className={th}>Dueño</th><th className={`${th} text-right`}>Mínimo</th><th className={`${th} text-right`}>Costo</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p._id} onClick={() => setEditing(p)} className="cursor-pointer">
                  <td className={`${td} whitespace-nowrap font-mono text-xs font-medium text-slate-700`}>{p.sku}</td>
                  <td className={td}>{p.name} <span className="text-xs text-slate-500">({p.unit})</span></td>
                  <td className={td}>{TRACKING_LABEL[p.tracking]}</td>
                  <td className={td}>{p.customerId ? <Badge variant="info">{customerCode(p.customerId) ?? "Cliente"}</Badge> : <span className="text-xs text-slate-500">Propio</span>}</td>
                  <td className={`${td} tabular text-right`}>{fmtNumber(p.lowStockThreshold)}</td>
                  <td className={`${td} tabular text-right`}>{fmtMoney(p.cost)}</td>
                  <td className={td}>{p.active === false ? <Badge>Inactivo</Badge> : <Badge variant="success">Activo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <ProductForm product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const customers = useCustomers();
  const costRequired = useModuleSetting("products", "requireCost") === true;
  const barcodeRequired = useModuleSetting("products", "requireBarcode") === true;
  const defaultMinimum = Number(useModuleSetting("products", "defaultLowStockThreshold")) || 0;
  const [form, setForm] = useState({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    unit: product?.unit ?? "pza",
    tracking: (product?.tracking ?? "none") as Tracking,
    lowStockThreshold: product ? String(product.lowStockThreshold ?? 0) : "",
    cost: product?.cost != null ? String(product.cost) : "",
    customerId: product?.customerId ?? "",
    barcodes: (product?.barcodeValues ?? []).join(", "),
    active: product?.active !== false,
  });
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));
  const save = useSave("products", ["products"], onClose);

  function submit() {
    save.mutate({
      id: product?._id,
      body: {
        sku: form.sku.trim(),
        name: form.name.trim(),
        unit: form.unit.trim() || "pza",
        tracking: form.tracking,
        // Empty on a new product → the server applies the module's default minimum.
        ...(form.lowStockThreshold.trim() !== "" || product ? { lowStockThreshold: Number(form.lowStockThreshold) || 0 } : {}),
        cost: numberOrNull(form.cost),
        customerId: form.customerId || null,
        barcodeValues: form.barcodes.split(",").map(s => s.trim()).filter(Boolean),
        ...(product ? { active: form.active } : {}),
      },
    });
  }

  return (
    <Modal
      open title={product ? `Editar ${product.sku}` : "Nuevo producto"} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!form.sku.trim() || !form.name.trim()} onClick={submit}>Guardar</Button></>}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>label]:min-w-0">
        <Field label="SKU"><Input value={form.sku} onChange={e => set({ sku: e.target.value })} autoFocus={!product} /></Field>
        <Field label="Unidad"><Input value={form.unit} onChange={e => set({ unit: e.target.value })} placeholder="pza, caja, kg…" /></Field>
        <Field label="Nombre" className="sm:col-span-2"><Input value={form.name} onChange={e => set({ name: e.target.value })} /></Field>
        <Field label="Seguimiento" hint={product ? "Solo se puede cambiar sin existencias." : undefined}>
          <Select value={form.tracking} onChange={e => set({ tracking: e.target.value as Tracking })}>
            {(Object.keys(TRACKING_LABEL) as Tracking[]).map(t => <option key={t} value={t}>{TRACKING_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Dueño (3PL)">
          <Select value={form.customerId} onChange={e => set({ customerId: e.target.value })}>
            <option value="">Mercancía propia</option>
            {customers.data?.filter(c => c.active !== false || c._id === form.customerId).map(c => <option key={c._id} value={c._id}>{c.code} · {c.name}</option>)}
          </Select>
        </Field>
        <Field label="Stock mínimo" hint={product ? "Alerta de stock bajo al llegar a este nivel." : `Vacío = ${defaultMinimum} (valor por omisión de la empresa).`}><Input type="number" min={0} value={form.lowStockThreshold} placeholder={String(defaultMinimum)} onChange={e => set({ lowStockThreshold: e.target.value })} /></Field>
        <Field label={costRequired ? "Costo unitario (MXN) · obligatorio" : "Costo unitario (MXN)"} hint={costRequired ? "Tu empresa lo exige para valuar el inventario." : "Opcional, para valuar el inventario."}><Input type="number" min={0} step="0.01" value={form.cost} onChange={e => set({ cost: e.target.value })} /></Field>
        <Field label={barcodeRequired ? "Códigos de barras del proveedor · al menos uno" : "Códigos de barras del proveedor"} hint="Separados por coma. El SKU también se reconoce al escanear." className="sm:col-span-2">
          <Input value={form.barcodes} onChange={e => set({ barcodes: e.target.value })} placeholder="7501234567890, ABC-123" />
        </Field>
        {product && (
          <label className="flex items-center gap-3 text-sm text-slate-700 sm:col-span-2">
            <Toggle checked={form.active} onChange={v => set({ active: v })} label="Activo" /> Activo (los inactivos no aparecen en la app)
          </label>
        )}
      </div>
      {save.isError && <div className="mt-4"><ErrorBox message={errorMessage(save.error)} /></div>}
    </Modal>
  );
}
