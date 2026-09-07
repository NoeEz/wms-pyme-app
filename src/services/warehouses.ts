import { api } from "./api";
import type { Warehouse } from "../types";

interface ApiWarehouse {
  _id: string;
  name: string;
  city: string;
  state: "active" | "inactive";
}

export async function fetchWarehouses(token: string): Promise<Warehouse[]> {
  const data = await api.get<{ warehouses: ApiWarehouse[] }>("/warehouses", token);
  return data.warehouses.map(w => ({ id: w._id, name: w.name, city: w.city, state: w.state }));
}
