import { cachedGet } from "./api";
import type { Location } from "../types";

interface ApiLocation {
  _id: string;
  warehouseId: string;
  zone: string;
  aisle: string;
  rack: string;
  position: string;
  code: string;
}

function mapLocation(l: ApiLocation): Location {
  return { id: l._id, code: l.code, zone: l.zone, aisle: l.aisle, rack: l.rack, position: l.position };
}

export async function fetchLocations(token: string, warehouseId: string): Promise<Location[]> {
  const data = await cachedGet<{ locations: ApiLocation[] }>(`/inventory/locations?warehouseId=${warehouseId}`, token);
  return data.locations.map(mapLocation);
}

interface ApiBalance { locationId: string | { _id: string }; available: number }

/**
 * Units on hand per location (only locations with stock appear), from the
 * company-wide inventory the device already caches — so the map's
 * occupied/empty view also works without signal.
 */
export async function fetchOccupancy(token: string): Promise<Map<string, number>> {
  const { balances } = await cachedGet<{ balances: ApiBalance[] }>("/inventory", token);
  const units = new Map<string, number>();
  for (const b of balances) {
    if (b.available <= 0) continue;
    const id = typeof b.locationId === "string" ? b.locationId : b.locationId?._id;
    if (id) units.set(id, (units.get(id) ?? 0) + b.available);
  }
  return units;
}
