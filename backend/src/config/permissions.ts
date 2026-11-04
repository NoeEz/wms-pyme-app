import type { ModuleKey } from "./modules";

// Permission catalog (RBAC, Tesina §4.5.10). Every permission belongs to a
// module: when the admin disables the module, the permission stops being
// effective for everybody (deny by default), without touching role data.
//
// `reserved` permissions are the administrator's exclusive powers — creating
// and configuring modules, roles, groups, users and permission exceptions.
// They can't be put in a custom role, a group or an individual exception;
// only the built-in "admin" role holds them.

export interface PermissionDef {
  key: string;
  module: ModuleKey | null; // null = transversal service, not tied to a toggleable module
  label: string;
  reserved?: boolean;
}

export const PERMISSIONS = [
  // 4.5.2 Productos y catálogos
  { key: "products.view", module: "products", label: "Consultar productos y su existencia" },
  { key: "products.manage", module: "products", label: "Registrar, editar y desactivar productos" },
  // 4.5.3 Almacenes y ubicaciones
  { key: "locations.manage", module: "warehouses", label: "Registrar y editar ubicaciones (zona, pasillo, rack, posición)" },
  { key: "warehouses.manage", module: "warehouses", label: "Registrar y editar almacenes" },
  // 4.5.4–4.5.6 Operación
  { key: "inbound.create", module: "inbound", label: "Registrar entradas" },
  { key: "outbound.create", module: "outbound", label: "Registrar salidas" },
  { key: "transfer.create", module: "transfer", label: "Registrar transferencias" },
  // 4.5.7 Inventarios y ajustes
  { key: "inventory.view", module: "inventory", label: "Consultar existencias por almacén y ubicación" },
  { key: "inventory.count", module: "inventory", label: "Registrar conteos físicos y solicitar ajustes" },
  { key: "inventory.approve", module: "inventory", label: "Autorizar ajustes críticos de otros usuarios" },
  // 4.5.8 Trazabilidad y auditoría
  { key: "history.view", module: "history", label: "Consultar movimientos de todos los usuarios (sin él, solo los propios)" },
  { key: "audit.view", module: "history", label: "Consultar la bitácora de auditoría" },
  // 4.5.9 Monitoreo y reportes
  { key: "reports.view", module: "reports", label: "Ver tablero de indicadores y reportes" },
  { key: "reports.export", module: "reports", label: "Exportar reportes (Excel / PDF)" },
  // 4.5.11 Captura de datos
  { key: "capture.camera", module: "camera_scan", label: "Escanear con la cámara del teléfono" },
  { key: "capture.manual", module: null, label: "Capturar productos manualmente (sin escaneo)" },
  // 4.5.10 Administración — exclusivas del administrador
  { key: "admin.modules", module: "admin", label: "Habilitar módulos y editar su configuración", reserved: true },
  { key: "admin.roles", module: "admin", label: "Crear roles y grupos y asignarles permisos", reserved: true },
  { key: "admin.users", module: "admin", label: "Administrar usuarios, sus almacenes y permisos individuales", reserved: true },
  { key: "admin.customers", module: "admin", label: "Administrar clientes 3PL", reserved: true },
  { key: "admin.company", module: "admin", label: "Editar los datos de la empresa", reserved: true },
] as const satisfies readonly PermissionDef[];

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS = PERMISSIONS.map(p => p.key) as Permission[];
export const RESERVED_PERMISSIONS = (PERMISSIONS as readonly PermissionDef[]).filter(p => p.reserved).map(p => p.key) as Permission[];
export const GRANTABLE_PERMISSIONS = ALL_PERMISSIONS.filter(p => !RESERVED_PERMISSIONS.includes(p));

export function isPermission(key: string): key is Permission {
  return (ALL_PERMISSIONS as string[]).includes(key);
}

export function permissionDef(key: string): PermissionDef | undefined {
  return (PERMISSIONS as readonly PermissionDef[]).find(p => p.key === key);
}

// Default permission sets of the predefined roles. Operator and supervisor
// are stored per company (an admin can tune them); admin is fixed (all) and
// a 3PL client is fixed (read-only, scoped to its own products).
export const DEFAULT_ROLE_PERMISSIONS: Record<"operator" | "supervisor", Permission[]> = {
  operator: [
    "products.view", "inventory.view",
    "inbound.create", "outbound.create", "transfer.create",
    "capture.camera", "capture.manual",
    "reports.view",
  ],
  supervisor: [
    "products.view", "products.manage", "locations.manage",
    "inventory.view", "inventory.count", "inventory.approve",
    "inbound.create", "outbound.create", "transfer.create",
    "capture.camera", "capture.manual",
    "history.view", "audit.view",
    "reports.view", "reports.export",
  ],
};

export const CLIENT_PERMISSIONS: Permission[] = ["products.view", "inventory.view", "history.view", "reports.view", "reports.export"];

export const SYSTEM_ROLES = [
  { key: "operator", name: "Operador", description: "Opera el almacén desde la app: entradas, salidas y transferencias." },
  { key: "supervisor", name: "Supervisor", description: "Además: catálogo, ubicaciones, conteos, autorización de ajustes, historial y bitácora." },
  { key: "admin", name: "Administrador", description: "Todo, incluidas las facultades exclusivas: módulos, roles, grupos, usuarios y permisos." },
] as const;
