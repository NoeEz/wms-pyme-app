import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "./api";
import type { Customer, Location, ModuleInfo, Product, Warehouse } from "./types";

// Catalog queries shared by several pages, plus the portal-wide warehouse
// filter ("" = all warehouses) shown in the top bar.

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api.get<{ warehouses: Warehouse[] }>("/warehouses").then(r => r.warehouses),
    staleTime: 60_000,
  });
}

export function useProducts(includeInactive = false) {
  return useQuery({
    queryKey: ["products", { includeInactive }],
    queryFn: () => api.get<{ products: Product[] }>(`/products${qs({ includeInactive: includeInactive || undefined })}`).then(r => r.products),
    staleTime: 30_000,
  });
}

export function useLocations(warehouseId: string, includeInactive = false) {
  return useQuery({
    queryKey: ["locations", { warehouseId, includeInactive }],
    queryFn: () => api.get<{ locations: Location[] }>(`/locations${qs({ warehouseId, includeInactive: includeInactive || undefined })}`).then(r => r.locations),
    staleTime: 30_000,
  });
}

export function useCustomers(enabled = true) {
  return useQuery({
    queryKey: ["customers"],
    queryFn: () => api.get<{ customers: Customer[] }>("/customers").then(r => r.customers),
    staleTime: 60_000,
    enabled,
  });
}

/** The company's modules with their settings (everybody may read them). */
export function useModules() {
  return useQuery({
    queryKey: ["modules"],
    queryFn: () => api.get<{ modules: ModuleInfo[] }>("/modules").then(r => r.modules),
    staleTime: 60_000,
  });
}

/** One module setting; undefined while loading. */
export function useModuleSetting(module: string, key: string): boolean | number | undefined {
  return useModules().data?.find(m => m.key === module)?.settings[key];
}

const WAREHOUSE_KEY = "wms_portal_warehouse";

interface WarehouseFilter { warehouseId: string; setWarehouseId: (id: string) => void }

const WarehouseContext = createContext<WarehouseFilter>({ warehouseId: "", setWarehouseId: () => {} });

export function WarehouseFilterProvider({ children }: { children: ReactNode }) {
  const [warehouseId, setState] = useState(() => {
    try { return localStorage.getItem(WAREHOUSE_KEY) ?? ""; } catch { return ""; }
  });
  const setWarehouseId = (id: string) => {
    setState(id);
    try { localStorage.setItem(WAREHOUSE_KEY, id); } catch { /* storage unavailable */ }
  };
  return <WarehouseContext.Provider value={{ warehouseId, setWarehouseId }}>{children}</WarehouseContext.Provider>;
}

export function useWarehouseFilter() {
  return useContext(WarehouseContext);
}
