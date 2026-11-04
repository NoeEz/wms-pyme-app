// Shapes of what the API returns (see backend/README.md). Mongo documents
// come with `_id`; computed rows (dashboard, reports) use plain ids.

export type Role = "operator" | "supervisor" | "admin" | "client";
export type MovementType = "inbound" | "outbound" | "transfer" | "adjustment";
export type Tracking = "none" | "lot" | "serial";
export type StockStatus = "stockout" | "low" | "slow" | "ok";

export interface SessionUser { id: string; name: string; email: string; role: Role }
export interface SessionCompany { id: string; name: string; slug: string }
export interface SessionCustomer { id: string; code: string; name: string }
/** Effective access computed by the API (permissions after modules; null warehouses = all). */
export interface SessionAccess { permissions: string[]; warehouseIds: string[] | null; modules: string[] }

export interface Warehouse { _id: string; name: string; city: string; state: "active" | "inactive" }

export interface Location {
  _id: string;
  warehouseId: string;
  zone: string;
  aisle: string;
  rack: string;
  position: string;
  code: string;
  active?: boolean;
}

export interface Customer { _id: string; code: string; name: string; contactEmail?: string; active?: boolean }

export interface Product {
  _id: string;
  sku: string;
  name: string;
  barcodeValues: string[];
  unit: string;
  tracking: Tracking;
  lowStockThreshold: number;
  cost?: number;
  customerId?: string;
  active?: boolean;
}

export interface PermissionOverride {
  permission: string;
  effect: "allow" | "deny";
  reason: string;
  grantedByName?: string;
  grantedAt?: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  customerId?: { _id: string; code: string; name: string } | null;
  active?: boolean;
  roleIds?: string[];
  warehouseIds?: string[];
  permissionOverrides?: PermissionOverride[];
}

export interface PermissionDef { key: string; module: string | null; label: string; reserved?: boolean }
export interface CatalogModule { key: string; label: string; section: string; core: boolean }

export interface AccessRole {
  _id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  system: boolean;
  active: boolean;
  users: number;
  groups: number;
}

export interface Group {
  _id: string;
  name: string;
  description: string;
  memberIds: string[];
  roleIds: string[];
  warehouseIds: string[];
  active: boolean;
}

export interface PermissionSource { kind: "role" | "custom_role" | "group" | "allow" | "deny" | "admin" | "client"; name: string }

export interface UserAccess {
  permissions: string[];
  blockedByModule: string[];
  sources: Record<string, PermissionSource[]>;
  warehouseIds: string[] | null;
  groups: { _id: string; name: string; active: boolean }[];
}

export interface MovementLine {
  productId: string | Product;
  quantity: number;
  sourceLocationId?: string | Location | null;
  destinationLocationId?: string | Location | null;
  lot?: string;
  serial?: string;
}

export interface Movement {
  _id: string;
  folio?: string;
  type: MovementType;
  status: string;
  warehouseId: string;
  destinationWarehouseId?: string;
  userId: { _id: string; name: string; role: Role } | string;
  reference?: string;
  lines: MovementLine[];
  createdAt: string;
  capturedAt?: string;
}

export interface Balance {
  _id: string;
  productId: Product;
  locationId: Location;
  available: number;
  reserved: number;
}

export interface TypeTotals { movements: number; lines: number; units: number }

export interface Overview {
  period: { from: string; to: string; days: number };
  stock: {
    units: number;
    skus: number;
    value: number;
    valuedUnitsPct: number | null;
    lowStock: number;
    stockouts: number;
    locationsInUse: number;
    locations: number;
  };
  movements: {
    totals: Record<MovementType, TypeTotals>;
    series: ({ day: string; unitsIn: number; unitsOut: number } & Record<MovementType, number>)[];
  };
  operators: { userId: string; name: string; movements: number; lines: number; units: number }[] | null;
  sync: {
    captured: number;
    avgSeconds: number | null;
    p95Seconds: number | null;
    maxSeconds: number | null;
    late: number;
    lateThresholdSeconds: number;
  };
  accuracy: {
    counts: number;
    accurateCounts: number;
    locationAccuracy: number | null;
    lines: number;
    lineAccuracy: number | null;
    unitsDiscrepancy: number;
  } | null;
  flow: {
    outboundUnits: number;
    outboundValue: number;
    avgDailyOutbound: number;
    daysOfSupply: number | null;
    turnover: number | null;
    turnoverBasis: "value" | "units";
  };
  alerts: { type: "stockout" | "low_stock"; productId: string; sku: string; name: string; onHand: number; threshold: number }[];
}

export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  tracking: Tracking;
  customer: { id: string; code: string; name: string } | null;
  onHand: number;
  threshold: number;
  cost: number | null;
  value: number | null;
  outboundUnits: number;
  avgDailyOut: number;
  daysOfSupply: number | null;
  lastMovementAt: string | null;
  status: StockStatus;
}

export interface InventoryCount {
  _id: string;
  status?: "applied" | "pending" | "rejected";
  reviewedBy?: { _id: string; name: string } | null;
  reviewNote?: string;
  locationId: { _id: string; code: string };
  userId: { _id: string; name: string };
  lines: { productId: { _id: string; sku: string; name: string; unit: string }; expected: number; counted: number; before?: number }[];
  accurate: boolean;
  adjustmentId?: { _id: string; folio: string } | null;
  notes?: string;
  createdAt: string;
}

export interface AuditEntry {
  _id: string;
  userName: string;
  action: "create" | "update" | "deactivate" | "activate" | "count" | "grant" | "revoke" | "approve" | "reject" | "login" | "denied";
  reason?: string;
  entity: string;
  entityId?: string;
  label?: string;
  changes: { field: string; from: unknown; to: unknown }[];
  createdAt: string;
}

export interface ModuleSettingDef {
  key: string;
  label: string;
  help?: string;
  type: "boolean" | "number";
  default: boolean | number;
  min?: number;
  max?: number;
  unit?: string;
}

export interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  section: string;
  core: boolean;
  dependsOn: string[];
  dependsOnAny: string[];
  enabled: boolean;
  settingsSchema: ModuleSettingDef[];
  settings: Record<string, boolean | number>;
  permissions: string[];
}
