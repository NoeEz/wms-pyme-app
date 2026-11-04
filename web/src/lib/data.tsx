import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "./api";
import type { Balance, Customer, Location, ModuleInfo, Product, Warehouse } from "./types";

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

/** Units on hand per location id in a warehouse (locations without stock are absent). */
export function useOccupancy(warehouseId: string) {
  return useQuery({
    queryKey: ["inventory", "occupancy", { warehouseId }],
    queryFn: async () => {
      const { balances } = await api.get<{ balances: Balance[] }>(`/inventory${qs({ warehouseId })}`);
      const units = new Map<string, number>();
      for (const b of balances) {
        if (b.available > 0 && b.locationId) units.set(b.locationId._id, (units.get(b.locationId._id) ?? 0) + b.available);
      }
      return units;
    },
    enabled: !!warehouseId,
    staleTime: 15_000,
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
