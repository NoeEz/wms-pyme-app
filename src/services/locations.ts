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
  return { id: l._id, zone: l.zone, aisle: l.aisle, rack: l.rack, position: l.position };
}

export async function fetchLocations(token: string, warehouseId: string): Promise<Location[]> {
  const data = await cachedGet<{ locations: ApiLocation[] }>(`/inventory/locations?warehouseId=${warehouseId}`, token);
  return data.locations.map(mapLocation);
}
