export type Role = 'operator' | 'supervisor' | 'admin';
export type ConnectionStatus = 'online' | 'offline' | 'pending';
export type MoveType = 'entry' | 'exit' | 'transfer';
export type ScanState = 'idle' | 'receiving' | 'processing' | 'added' | 'duplicate' | 'invalid_format' | 'not_found' | 'needs_serial';

export interface User {
  id?: string;
  name: string;
  email: string;
  role: Role;
  companyName?: string;
  /** Effective permissions from the API (roles, groups, exceptions, enabled modules). Absent in sessions saved by older versions. */
  permissions?: string[];
  /** Warehouses the user may operate; null = all. */
  warehouseIds?: string[] | null;
}

export interface Warehouse {
  id: string;
  name: string;
  city: string;
  state: 'active' | 'inactive';
}

export interface Location {
  id?: string;
  code?: string;
  zone: string;
  aisle: string;
  rack: string;
  position: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  serialized: boolean;
  stock: number;
  lotTracked: boolean;
  lowStock?: boolean;
}

export interface LocationStock {
  location: Location;
  quantity: number;
}

export interface ModuleInfo {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  /** Core modules (catalog, warehouses, traceability, administration) can't be turned off. */
  core?: boolean;
  dependsOn?: string[];
  dependsOnAny?: string[];
  /** Per-company options set by the admin, e.g. requireReference, allowInterWarehouse. */
  settings?: Record<string, boolean | number>;
}

export interface MovementSummary {
  id: string;
  folio?: string;
  createdAt: string;
  type: MoveType;
  status: 'draft' | 'local_pending' | 'syncing' | 'completed' | 'failed';
  date: string;
  user: string;
  origin?: Location;
  destination?: Location;
  reference?: string;
  itemCount: number;
}

export interface ScanResult {
  productId: string;
  sku: string;
  lot?: string;
  serial?: string;
  version: string;
  raw: string;
}

export interface MovementItem {
  id: string;
  product: Product;
  lot?: string;
  serials: string[];
  quantity: number;
  scannedAt: Date;
}

/** How the last confirmed movement ended: applied on the server, or saved in the offline queue. */
export type MoveOutcome = { kind: 'synced'; folio: string } | { kind: 'queued'; id: string };

export type Screen =
  | 'login'
  | 'warehouse-select'
  | 'home'
  | 'move-select'
  | 'move-config'
  | 'scan-handheld'
  | 'scan-camera'
  | 'manual-capture'
  | 'movement-draft'
  | 'movement-review'
  | 'movement-result'
  | 'inventory'
  | 'inventory-detail'
  | 'pending'
  | 'history'
  | 'history-detail'
  | 'more'
  | 'modules'
  | 'components';
