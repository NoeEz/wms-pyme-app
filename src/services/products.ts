import { api, cachedGet, isTransientError } from "./api";
import type { Location, LocationStock, Product } from "../types";

interface ApiProduct {
  _id: string;
  sku: string;
  name: string;
  barcodeValues: string[];
  unit: string;
  tracking: "none" | "lot" | "serial";
  lowStockThreshold: number;
}

interface ApiLocation {
  _id: string;
  zone: string;
  aisle: string;
  rack: string;
  position: string;
}

interface ApiBalance {
  _id: string;
  productId: ApiProduct | string;
  locationId: ApiLocation | string;
  available: number;
}

function mapProduct(p: ApiProduct, stock: number): Product {
  return {
    id: p._id,
    sku: p.sku,
    name: p.name,
    serialized: p.tracking === "serial",
    lotTracked: p.tracking === "lot",
    stock,
    lowStock: stock <= p.lowStockThreshold,
  };
}

function matchesQuery(p: ApiProduct, query: string): boolean {
  const q = query.toLowerCase();
  return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcodeValues.some(b => b.toLowerCase() === q);
}

function matchesCode(p: ApiProduct, code: string): boolean {
  const c = code.toLowerCase();
  return p.sku.toLowerCase() === c || p.barcodeValues.some(b => b.toLowerCase() === c);
}

/** Full catalog, cached on the device so scans and manual capture keep working offline. */
async function fetchCatalog(token: string): Promise<ApiProduct[]> {
  const { products } = await cachedGet<{ products: ApiProduct[] }>("/products", token);
  return products;
}

/** Downloads the catalog and this warehouse's locations ahead of time, so going offline mid-shift is a non-event. */
export async function warmOfflineCache(token: string, warehouseId: string): Promise<void> {
  await Promise.all([
    fetchCatalog(token),
    cachedGet("/inventory", token),
    cachedGet(`/inventory/locations?warehouseId=${warehouseId}`, token),
  ]);
}

/** Product catalog joined with company-wide stock (summed across every warehouse/location). */
export async function fetchProductsWithStock(token: string, query = ""): Promise<Product[]> {
  // Filtering the cached full catalog locally keeps search working offline;
  // an SME catalog is small enough that this costs nothing.
  const [catalog, { balances }] = await Promise.all([
    fetchCatalog(token),
    cachedGet<{ balances: ApiBalance[] }>("/inventory", token),
  ]);
  const products = query ? catalog.filter(p => matchesQuery(p, query)) : catalog;

  const stockByProductId = new Map<string, number>();
  for (const b of balances) {
    const id = typeof b.productId === "string" ? b.productId : b.productId._id;
    stockByProductId.set(id, (stockByProductId.get(id) ?? 0) + b.available);
  }

  return products.map(p => mapProduct(p, stockByProductId.get(p._id) ?? 0));
}

/** Exact lookup by SKU/barcode — used when a scan resolves to a code. */
export async function findProductByCode(token: string, code: string): Promise<Product | null> {
  let products: ApiProduct[];
  try {
    ({ products } = await api.get<{ products: ApiProduct[] }>(`/products?q=${encodeURIComponent(code)}`, token));
  } catch (err) {
    if (!isTransientError(err)) throw err;
    products = await fetchCatalog(token); // offline: resolve against the cached catalog
  }
  const match = products.find(p => matchesCode(p, code));
  if (!match) return null;
  return mapProduct(match, 0);
}

export interface ProductDetail {
  product: Product;
  locationStocks: LocationStock[];
  recentMovements: {
    folio?: string;
    type: "inbound" | "outbound" | "transfer";
    createdAt: string;
    quantity: number;
    serial?: string;
  }[];
}

export async function fetchProductDetail(token: string, productId: string): Promise<ProductDetail> {
  const data = await api.get<{
    product: ApiProduct;
    balances: ApiBalance[];
    recentMovements: {
      folio?: string;
      type: "inbound" | "outbound" | "transfer";
      createdAt: string;
      lines: { productId: string; quantity: number; serial?: string }[];
    }[];
  }>(`/products/${productId}`, token);

  const stock = data.balances.reduce((s, b) => s + b.available, 0);

  const locationStocks: LocationStock[] = data.balances
    .filter(b => typeof b.locationId !== "string" && b.available > 0)
    .map(b => {
      const loc = b.locationId as ApiLocation;
      const location: Location = { id: loc._id, zone: loc.zone, aisle: loc.aisle, rack: loc.rack, position: loc.position };
      return { location, quantity: b.available };
    });

  const recentMovements = data.recentMovements.flatMap(m =>
    m.lines
      .filter(l => l.productId === data.product._id)
      .map(l => ({ folio: m.folio, type: m.type, createdAt: m.createdAt, quantity: l.quantity, serial: l.serial })),
  );

  return { product: mapProduct(data.product, stock), locationStocks, recentMovements };
}
