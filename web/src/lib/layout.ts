import type { Location } from "./types";

// Zone → aisle → rack → position tree for the warehouse map, with the stock
// each position holds. Same logic as the mobile app's
// src/services/warehouseLayout.ts.

export interface PositionNode { location: Location; label: string; units: number }
export interface RackNode { name: string; positions: PositionNode[]; occupied: number }
export interface AisleNode { name: string; racks: RackNode[]; occupied: number; total: number }
export interface ZoneNode { name: string; aisles: AisleNode[]; occupied: number; total: number }

/** "Pasillo 03" → "03", "Zona A" → "A": the short label drawn on the map. */
export function shortLabel(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

/** Natural order, so "Pasillo 2" comes before "Pasillo 10". */
export function natural(a: string, b: string): number {
  const ax = a.match(/\d+|\D+/g) ?? [];
  const bx = b.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === y) continue;
    if (/^\d/.test(x) && /^\d/.test(y)) return Number(x) - Number(y) || x.length - y.length;
    return x < y ? -1 : 1;
  }
  return ax.length - bx.length;
}

export function buildLayout(locations: Location[], occupancy: Map<string, number>): ZoneNode[] {
  const tree = new Map<string, Map<string, Map<string, PositionNode[]>>>();
  for (const location of locations) {
    const aisles = tree.get(location.zone) ?? new Map<string, Map<string, PositionNode[]>>();
    tree.set(location.zone, aisles);
    const racks = aisles.get(location.aisle) ?? new Map<string, PositionNode[]>();
    aisles.set(location.aisle, racks);
    const positions = racks.get(location.rack) ?? [];
    racks.set(location.rack, positions);
    positions.push({ location, label: shortLabel(location.position), units: occupancy.get(location._id) ?? 0 });
  }

  return [...tree].sort(([a], [b]) => natural(a, b)).map(([zoneName, aisleMap]) => {
    const aisles: AisleNode[] = [...aisleMap].sort(([a], [b]) => natural(a, b)).map(([aisleName, rackMap]) => {
      const racks: RackNode[] = [...rackMap].sort(([a], [b]) => natural(a, b)).map(([rackName, positions]) => {
        const sorted = [...positions].sort((a, b) => natural(a.location.position, b.location.position));
        return { name: rackName, positions: sorted, occupied: sorted.filter(p => p.units > 0).length };
      });
      return {
        name: aisleName,
        racks,
        occupied: racks.reduce((s, r) => s + r.occupied, 0),
        total: racks.reduce((s, r) => s + r.positions.length, 0),
      };
    });
    return {
      name: zoneName,
      aisles,
      occupied: aisles.reduce((s, a) => s + a.occupied, 0),
      total: aisles.reduce((s, a) => s + a.total, 0),
    };
  });
}
