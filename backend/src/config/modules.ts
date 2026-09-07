// EPIC-6 "Módulos Personalizables" (Tesina_WMS_PyME.docx, OE5): a fixed
// catalog of operational units the company admin can enable/disable
// independently. Kept as a static catalog (not a DB collection) since the
// MVP only needs a closed set of toggles, not admin-defined modules.
export const MODULE_CATALOG = [
  { key: "inbound", label: "Entradas", description: "Registrar recepción de mercancía." },
  { key: "outbound", label: "Salidas", description: "Registrar despacho de mercancía." },
  { key: "transfer", label: "Transferencias", description: "Mover mercancía entre ubicaciones o almacenes." },
  { key: "camera_scan", label: "Escaneo por cámara", description: "Leer códigos QR con la cámara del teléfono." },
  { key: "inventory", label: "Consultar inventario", description: "Buscar existencias y ubicaciones." },
  { key: "history", label: "Historial y trazabilidad", description: "Ver movimientos pasados y su trazabilidad." },
] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]["key"];

export const ALL_MODULE_KEYS = MODULE_CATALOG.map(m => m.key) as ModuleKey[];

export function isValidModuleKey(key: string): key is ModuleKey {
  return (ALL_MODULE_KEYS as string[]).includes(key);
}

export const MOVEMENT_TYPE_TO_MODULE = {
  inbound: "inbound",
  outbound: "outbound",
  transfer: "transfer",
} as const satisfies Record<string, ModuleKey>;
