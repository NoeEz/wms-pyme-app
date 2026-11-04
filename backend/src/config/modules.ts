// Modules of the WMS-PyME (Tesina_WMS_PyME.docx §4.5, EPIC-6 / OE5
// "Módulos Personalizables"). Each functional module from the spec is an
// entry here; only a company administrator can enable/disable them and edit
// their configuration (PATCH /api/modules, permission `admin.modules`).
//
// - `core` modules hold what the system's security and integrity depend on
//   (catalog, warehouses, traceability, administration): always on (§4.5.10
//   "las funcionalidades centrales … permanecerán protegidas").
// - `dependsOn` (all of) / `dependsOnAny` (at least one of) keep the
//   configuration consistent: a module can't be on without what it needs.
// - `settings` are the per-company options of the module, rendered
//   generically by the web portal.
// Turning a module off never deletes data or invalidates confirmed
// movements: it only hides and blocks new operations of that kind.

export interface ModuleSettingDef {
  key: string;
  label: string;
  help?: string;
  type: "boolean" | "number";
  default: boolean | number;
  min?: number;
  max?: number;
  /** Unit shown next to number inputs ("unidades", "días", "horas"…). */
  unit?: string;
}

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  section: string; // §4.5.x of the thesis
  core: boolean;
  dependsOn: readonly string[];
  dependsOnAny: readonly string[];
  settings: readonly ModuleSettingDef[];
}

export const MODULE_CATALOG = [
  {
    key: "products", label: "Productos y catálogos", section: "4.5.2", core: true, dependsOn: [], dependsOnAny: [],
    description: "Catálogo central de artículos: identificador, unidad, códigos de barras/QR, lote, serie y stock mínimo.",
    settings: [
      { key: "requireBarcode", type: "boolean", default: false, label: "Exigir al menos un código de barras o QR al registrar un producto" },
      { key: "requireCost", type: "boolean", default: false, label: "Exigir costo unitario", help: "Necesario para valuar el inventario en el tablero y los reportes." },
      {
        key: "defaultLowStockThreshold", type: "number", default: 0, min: 0, max: 1_000_000, unit: "unidades",
        label: "Stock mínimo por omisión para productos nuevos",
        help: "Se usa cuando al registrar el producto no se indica uno. 0 = sin alerta de stock bajo.",
      },
    ],
  },
  {
    key: "warehouses", label: "Almacenes y ubicaciones", section: "4.5.3", core: true, dependsOn: [], dependsOnAny: [],
    description: "Almacenes de la empresa y su estructura de zonas, pasillos, racks y posiciones.",
    settings: [
      {
        key: "blockInactiveWarehouses", type: "boolean", default: true,
        label: "Bloquear operaciones en almacenes inactivos",
        help: "No se pueden registrar movimientos ni conteos en un almacén marcado como inactivo.",
      },
    ],
  },
  {
    key: "inbound", label: "Recepción y entradas", section: "4.5.4", core: false, dependsOn: ["products", "warehouses"], dependsOnAny: [],
    description: "Registrar el ingreso de mercancía con escaneo o captura manual y actualizar existencias.",
    settings: [
      { key: "requireReference", type: "boolean", default: false, label: "Exigir referencia documental (factura, remisión, orden de compra)" },
      { key: "requireLot", type: "boolean", default: false, label: "Exigir número de lote en productos con seguimiento por lote" },
      {
        key: "maxQuantityPerLine", type: "number", default: 0, min: 0, max: 1_000_000, unit: "unidades",
        label: "Cantidad máxima por línea",
        help: "Evita errores de captura (p. ej. escanear 1000 en vez de 10). 0 = sin límite.",
      },
    ],
  },
  {
    key: "outbound", label: "Salidas y despachos", section: "4.5.5", core: false, dependsOn: ["products", "warehouses"], dependsOnAny: [],
    description: "Registrar egresos validando disponibilidad; nunca deja existencias negativas.",
    settings: [
      { key: "requireReference", type: "boolean", default: false, label: "Exigir referencia o motivo de salida" },
      {
        key: "protectMinimumStock", type: "boolean", default: false,
        label: "Impedir salidas que dejen el producto por debajo de su stock mínimo",
        help: "Considera la existencia total del producto en la empresa.",
      },
      {
        key: "maxQuantityPerLine", type: "number", default: 0, min: 0, max: 1_000_000, unit: "unidades",
        label: "Cantidad máxima por línea",
        help: "Evita errores de captura (p. ej. escanear 1000 en vez de 10). 0 = sin límite.",
      },
    ],
  },
  {
    key: "transfer", label: "Transferencias", section: "4.5.6", core: false, dependsOn: ["products", "warehouses"], dependsOnAny: [],
    description: "Mover mercancía entre ubicaciones o entre almacenes de la empresa en una sola operación atómica.",
    settings: [
      { key: "allowInterWarehouse", type: "boolean", default: true, label: "Permitir transferencias entre almacenes distintos" },
      { key: "requireReference", type: "boolean", default: false, label: "Exigir referencia de la transferencia" },
      {
        key: "maxQuantityPerLine", type: "number", default: 0, min: 0, max: 1_000_000, unit: "unidades",
        label: "Cantidad máxima por línea",
        help: "Evita errores de captura (p. ej. escanear 1000 en vez de 10). 0 = sin límite.",
      },
    ],
  },
  {
    key: "inventory", label: "Inventarios y ajustes", section: "4.5.7", core: false, dependsOn: ["products", "warehouses"], dependsOnAny: [],
    description: "Consultar existencias, registrar conteos físicos y aplicar ajustes controlados.",
    settings: [
      {
        key: "requireApproval", type: "boolean", default: false,
        label: "Los ajustes críticos requieren autorización",
        help: "La autoriza un usuario con permiso «Autorizar ajustes» distinto de quien hizo el conteo.",
      },
      {
        key: "approvalThreshold", type: "number", default: 0, min: 0, max: 1_000_000,
        label: "Unidades de diferencia a partir de las cuales un ajuste es crítico",
        help: "0 = cualquier diferencia requiere autorización.",
      },
      { key: "requireCountNotes", type: "boolean", default: false, label: "Exigir el motivo de la diferencia cuando un conteo no coincide" },
      { key: "blindCountDefault", type: "boolean", default: true, label: "Conteo a ciegas por omisión", help: "Quien cuenta no ve la existencia del sistema hasta guardar." },
    ],
  },
  {
    key: "history", label: "Trazabilidad y auditoría", section: "4.5.8", core: true, dependsOn: [], dependsOnAny: [],
    description: "Historial verificable de movimientos y bitácora de cambios de configuración y permisos.",
    settings: [
      { key: "logLogins", type: "boolean", default: true, label: "Registrar inicios de sesión en la bitácora" },
      { key: "logDenied", type: "boolean", default: true, label: "Registrar intentos de acceso denegados en la bitácora" },
    ],
  },
  {
    key: "reports", label: "Monitoreo y reportes", section: "4.5.9", core: false, dependsOn: [], dependsOnAny: [],
    description: "Tablero de indicadores, alertas de stock mínimo y reportes de entradas, salidas y existencias.",
    settings: [
      { key: "allowExport", type: "boolean", default: true, label: "Permitir exportar reportes a Excel y PDF" },
      {
        key: "defaultPeriodDays", type: "number", default: 30, min: 1, max: 365, unit: "días",
        label: "Periodo por omisión del tablero",
      },
      {
        key: "slowMovingDays", type: "number", default: 30, min: 1, max: 365, unit: "días",
        label: "Días sin salidas para marcar un producto «sin movimiento»",
      },
    ],
  },
  {
    key: "camera_scan", label: "Captura por cámara", section: "4.5.11", core: false, dependsOn: [], dependsOnAny: ["inbound", "outbound", "transfer"],
    description: "Leer códigos de barras y QR con la cámara del teléfono (los lectores de mano funcionan siempre).",
    settings: [
      {
        key: "qrOnly", type: "boolean", default: false,
        label: "Leer solo códigos QR (etiquetas WMS)",
        help: "Ignora códigos de barras del proveedor (EAN, UPC, Code 128…) para evitar lecturas equivocadas.",
      },
    ],
  },
  {
    key: "admin", label: "Administración, usuarios y permisos", section: "4.5.10", core: true, dependsOn: [], dependsOnAny: [],
    description: "Usuarios, roles, grupos, permisos individuales y configuración de módulos. Exclusivo del administrador.",
    settings: [
      { key: "minPasswordLength", type: "number", default: 8, min: 8, max: 64, unit: "caracteres", label: "Longitud mínima de contraseña" },
      {
        key: "sessionHours", type: "number", default: 8, min: 1, max: 72, unit: "horas",
        label: "Duración de la sesión",
        help: "Al terminar hay que volver a iniciar sesión. Aplica a sesiones nuevas.",
      },
    ],
  },
] as const satisfies readonly ModuleDef[];

export type ModuleKey = (typeof MODULE_CATALOG)[number]["key"];

export const ALL_MODULE_KEYS = MODULE_CATALOG.map(m => m.key) as ModuleKey[];
export const CORE_MODULE_KEYS = MODULE_CATALOG.filter(m => m.core).map(m => m.key) as ModuleKey[];

// The catalog before §4.5 was implemented. A company whose stored list was
// saved against it gets every module added since then switched on.
export const LEGACY_MODULE_KEYS = ["inbound", "outbound", "transfer", "camera_scan", "inventory", "history"];

export function isValidModuleKey(key: string): key is ModuleKey {
  return (ALL_MODULE_KEYS as string[]).includes(key);
}

export function moduleDef(key: string): ModuleDef | undefined {
  return (MODULE_CATALOG as readonly ModuleDef[]).find(m => m.key === key);
}

export const MOVEMENT_TYPE_TO_MODULE = {
  inbound: "inbound",
  outbound: "outbound",
  transfer: "transfer",
} as const satisfies Record<string, ModuleKey>;

interface CompanyModulesLike {
  enabledModules?: string[] | null;
  knownModules?: string[] | null;
  moduleSettings?: unknown;
}

/** Effective enabled set: core always, stored choice otherwise, new (never-seen) modules default on. */
export function enabledModuleSet(company: CompanyModulesLike | null | undefined): Set<ModuleKey> {
  const stored = company?.enabledModules;
  if (!stored) return new Set(ALL_MODULE_KEYS);
  const known = company?.knownModules?.length ? company.knownModules : LEGACY_MODULE_KEYS;
  return new Set(ALL_MODULE_KEYS.filter(k => moduleDef(k)!.core || stored.includes(k) || !known.includes(k)));
}

/**
 * Fixes a requested enabled set: core modules are forced on. Returns the
 * first dependency problem, if any, so the admin gets a clear message.
 */
export function validateModuleSet(requested: string[]): { keys: ModuleKey[]; problem?: string } {
  const keys = new Set<ModuleKey>([...CORE_MODULE_KEYS, ...requested.filter(isValidModuleKey)]);
  for (const key of keys) {
    const def = moduleDef(key)!;
    const missing = def.dependsOn.filter(d => !keys.has(d as ModuleKey));
    if (missing.length) {
      return { keys: [...keys], problem: `«${def.label}» requiere: ${missing.map(m => moduleDef(m)!.label).join(", ")}.` };
    }
    if (def.dependsOnAny.length && !def.dependsOnAny.some(d => keys.has(d as ModuleKey))) {
      return { keys: [...keys], problem: `«${def.label}» requiere al menos uno de: ${def.dependsOnAny.map(m => moduleDef(m)!.label).join(", ")}.` };
    }
  }
  return { keys: ALL_MODULE_KEYS.filter(k => keys.has(k)) };
}

/** A module's settings with defaults filled in. */
export function moduleSettings(company: CompanyModulesLike | null | undefined, key: ModuleKey): Record<string, boolean | number> {
  const def = moduleDef(key)!;
  const stored = ((company?.moduleSettings ?? {}) as Record<string, Record<string, unknown>>)[key] ?? {};
  const out: Record<string, boolean | number> = {};
  for (const s of def.settings) {
    const v = stored[s.key];
    out[s.key] = typeof v === typeof s.default ? (v as boolean | number) : s.default;
  }
  return out;
}

/** Validates a settings patch for one module against its definitions. */
export function parseSettingsPatch(key: ModuleKey, patch: Record<string, unknown>): { values: Record<string, boolean | number>; problem?: string } {
  const def = moduleDef(key)!;
  const values: Record<string, boolean | number> = {};
  for (const [k, v] of Object.entries(patch)) {
    const s = def.settings.find(x => x.key === k);
    if (!s) return { values, problem: `La opción «${k}» no existe en el módulo «${def.label}».` };
    if (s.type === "boolean" && typeof v !== "boolean") return { values, problem: `«${s.label}» debe ser sí o no.` };
    if (s.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) return { values, problem: `«${s.label}» debe ser un número.` };
      if ((s.min !== undefined && v < s.min) || (s.max !== undefined && v > s.max)) {
        return { values, problem: `«${s.label}» debe estar entre ${s.min ?? "-∞"} y ${s.max ?? "∞"}.` };
      }
    }
    values[k] = v as boolean | number;
  }
  return { values };
}
