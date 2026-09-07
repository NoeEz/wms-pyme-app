import type { Product, Warehouse, PendingSync, HistoryMovement } from './types';

export const WAREHOUSES: Warehouse[] = [
  { id: 'wh1', name: 'Planta Norte', city: 'Monterrey, NL', state: 'active' },
  { id: 'wh2', name: 'Centro de distribución', city: 'CDMX', state: 'active' },
];

export const PRODUCTS: Product[] = [
  {
    id: 'prd_6204',
    sku: 'BAL-6204',
    name: 'Balero industrial 6204',
    serialized: true,
    stock: 128,
    lotTracked: true,
  },
  {
    id: 'prd_ban2m',
    sku: 'BAN-2M',
    name: 'Banda transportadora 2 m',
    serialized: false,
    stock: 7,
    lotTracked: true,
    lowStock: true,
  },
  {
    id: 'prd_mot15',
    sku: 'MOT-15HP',
    name: 'Motor eléctrico 15HP',
    serialized: true,
    stock: 3,
    lotTracked: false,
  },
  {
    id: 'prd_rod22',
    sku: 'ROD-2200',
    name: 'Rodamiento 2200',
    serialized: false,
    stock: 245,
    lotTracked: true,
  },
];

export const PENDING_SYNCS: PendingSync[] = [
  {
    id: 'loc_001',
    type: 'entry',
    status: 'pending',
    createdAt: '2024-08-15 14:32',
    itemCount: 12,
    reference: 'OC-4421',
  },
  {
    id: 'loc_002',
    type: 'transfer',
    status: 'error',
    createdAt: '2024-08-15 13:10',
    itemCount: 3,
  },
  {
    id: 'loc_003',
    type: 'exit',
    status: 'synced',
    createdAt: '2024-08-15 11:45',
    itemCount: 8,
    reference: 'REQ-0912',
  },
];

export const HISTORY: HistoryMovement[] = [
  {
    folio: 'ENT-20240815-0041',
    type: 'entry',
    status: 'confirmed',
    date: '15 ago 2024, 14:32',
    user: 'María López',
    destination: 'A-03-R02-P04',
    items: [],
    reference: 'OC-4421',
  },
  {
    folio: 'SAL-20240815-0038',
    type: 'exit',
    status: 'confirmed',
    date: '15 ago 2024, 11:45',
    user: 'Carlos Ruiz',
    origin: 'A-03-R02-P04',
    items: [],
    reference: 'REQ-0912',
  },
  {
    folio: 'TRA-20240814-0027',
    type: 'transfer',
    status: 'pending',
    date: '14 ago 2024, 16:20',
    user: 'María López',
    origin: 'A-01-R01-P02',
    destination: 'B-02-R03-P01',
    items: [],
  },
];

export const ZONES = ['Zona A', 'Zona B', 'Zona C'];
export const AISLES = ['Pasillo 01', 'Pasillo 02', 'Pasillo 03', 'Pasillo 04'];
export const RACKS = ['Rack 01', 'Rack 02', 'Rack 03'];
export const POSITIONS = ['Posición 01', 'Posición 02', 'Posición 03', 'Posición 04'];

export function parseQR(raw: string): { valid: boolean; data?: Record<string, string>; error?: string } {
  const parts = raw.trim().split('|');
  if (parts.length < 2 || parts[0] !== 'WMSPYME') {
    return { valid: false, error: 'Formato no reconocido' };
  }
  const data: Record<string, string> = { version: parts[1] || 'v1' };
  for (let i = 2; i < parts.length; i++) {
    const [k, v] = parts[i].split('=');
    if (k && v) data[k] = v;
  }
  if (!data.productId && !data.sku) {
    return { valid: false, error: 'Código sin producto identificado' };
  }
  return { valid: true, data };
}

export function findProduct(data: Record<string, string>): Product | undefined {
  return PRODUCTS.find(p => p.id === data.productId || p.sku === data.sku);
}
