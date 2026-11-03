import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, errorMessage, qs } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import type { AuditEntry } from "../lib/types";
import { Badge, Button, Card, EmptyState, ErrorBox, Loading, PageHeader, Select } from "../components/ui";

const PAGE = 50;

const ENTITY_LABEL: Record<string, string> = {
  company: "Empresa", modules: "Módulos", warehouse: "Almacén", location: "Ubicación",
  product: "Producto", customer: "Cliente 3PL", user: "Usuario", count: "Conteo físico",
};
const ACTION: Record<AuditEntry["action"], { label: string; variant: "success" | "info" | "neutral" | "warning" }> = {
  create: { label: "Alta", variant: "success" },
  update: { label: "Cambio", variant: "info" },
  deactivate: { label: "Desactivación", variant: "neutral" },
  activate: { label: "Reactivación", variant: "success" },
  count: { label: "Conteo", variant: "warning" },
};
const FIELD_LABEL: Record<string, string> = {
  sku: "SKU", name: "Nombre", barcodeValues: "Códigos de barras", unit: "Unidad", tracking: "Seguimiento",
  lowStockThreshold: "Stock mínimo", cost: "Costo", customerId: "Cliente 3PL", active: "Activo", city: "Ciudad",
  state: "Estado", zone: "Zona", aisle: "Pasillo", rack: "Rack", position: "Posición", code: "Código",
  contactEmail: "Contacto", email: "Correo", role: "Rol", password: "Contraseña", slug: "Código de empresa",
  enabledModules: "Módulos activos",
};

function show(v: unknown): string {
  if (v == null || v === "") return "∅";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "∅";
  return String(v);
}

export default function AuditPage() {
  const [entity, setEntity] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["audit", { entity }],
    initialPageParam: "",
    queryFn: ({ pageParam }) => api.get<{ entries: AuditEntry[] }>(`/audit${qs({ entity, before: pageParam, limit: PAGE })}`).then(r => r.entries),
    getNextPageParam: last => (last.length === PAGE ? last[last.length - 1].createdAt : undefined),
  });
  const entries = query.data?.pages.flat() ?? [];

  return (
    <>
      <PageHeader title="Bitácora" description="Quién cambió qué y cuándo en el catálogo, usuarios y configuración. Los movimientos de stock tienen su propio historial." />
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4">
          <Select value={entity} onChange={e => setEntity(e.target.value)} className="w-60" aria-label="Tipo de registro">
            <option value="">Todo</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {query.isPending ? <Loading /> : query.isError ? <div className="p-4"><ErrorBox message={errorMessage(query.error)} /></div> : !entries.length ? (
          <EmptyState icon="audit" title="Sin registros" />
        ) : (
          <ol className="divide-y divide-slate-100">
            {entries.map(e => (
              <li key={e._id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:gap-4">
                <div className="w-44 shrink-0 text-xs text-slate-500">{fmtDateTime(e.createdAt)}</div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={ACTION[e.action].variant}>{ACTION[e.action].label}</Badge>
                    <span className="text-slate-500">{ENTITY_LABEL[e.entity] ?? e.entity}</span>
                    {e.label && <span className="font-mono text-xs font-medium text-slate-800">{e.label}</span>}
                    <span className="text-slate-400">por</span> <span className="font-medium text-slate-700">{e.userName}</span>
                  </p>
                  {e.changes.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-slate-600">
                      {e.changes.map((c, i) => (
                        <li key={i}>
                          <span className="text-slate-500">{e.entity === "count" ? c.field : FIELD_LABEL[c.field] ?? c.field}:</span>{" "}
                          <span className="line-through decoration-slate-300">{show(c.from)}</span> → <span className="font-medium text-slate-800">{show(c.to)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {query.hasNextPage && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button variant="ghost" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Cargar más</Button>
          </div>
        )}
      </Card>
    </>
  );
}
