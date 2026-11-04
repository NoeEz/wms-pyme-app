import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { Button, Input, Icon, SelectField } from "../components/ui";
import WarehouseMap from "../components/WarehouseMap";
import type { MoveType, Location, ModuleInfo, Warehouse } from "../types";
import { fetchLocations, fetchOccupancy } from "../services/locations";
import { fetchWarehouses } from "../services/warehouses";
import { moduleSetting } from "../services/modules";
import { ApiError } from "../services/api";

interface Props {
  token: string;
  warehouse: Warehouse;
  moveType: MoveType;
  /** Raw company modules, for their settings (referencia obligatoria, transferencias entre almacenes). */
  modules: ModuleInfo[];
  /** Warehouses the user may operate; null = all. */
  allowedWarehouseIds: string[] | null;
  onStart: (origin?: Location, destination?: Location, reference?: string, destinationWarehouse?: Warehouse) => void;
}

const TYPE_MODULE: Record<MoveType, string> = { entry: "inbound", exit: "outbound", transfer: "transfer" };

const TYPE_LABELS: Record<MoveType, { title: string; desc: string; icon: string }> = {
  entry: { title: "Entrada de mercancía", desc: "Toca en el plano dónde se almacenará la mercancía.", icon: "entry" },
  exit: { title: "Salida de mercancía", desc: "Toca en el plano de dónde saldrá la mercancía.", icon: "exit" },
  transfer: { title: "Transferencia", desc: "Toca en el plano el origen y el destino del movimiento.", icon: "transfer" },
};

type Side = "origin" | "dest";
// Same colors as the movement types elsewhere in the app.
const SIDE_STYLE: Record<Side, { label: string; accent: string; tint: string }> = {
  origin: { label: "Origen", accent: "#4F46E5", tint: "#EEF2FF" },
  dest: { label: "Destino", accent: "#059669", tint: "#ECFDF5" },
};

const locationText = (l: Location) => l.code ?? `${l.zone} / ${l.aisle} / ${l.rack} / ${l.position}`;

/** Card that shows what is picked for one side and makes that side the active one on the plan. */
function SideCard({ side, location, active, onPress }: { side: Side; location?: Location; active: boolean; onPress: () => void }) {
  const { label, accent, tint } = SIDE_STYLE[side];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{ borderColor: active ? accent : "#E2E8F0", borderWidth: active ? 2 : 1, backgroundColor: active ? tint : "#FFFFFF" }}
      className="flex-1 rounded-2xl px-3.5 py-3"
    >
      <View className="flex-row items-center justify-between">
        <Text style={{ color: accent }} className="text-[11px] font-bold uppercase tracking-wider">{label}</Text>
        <Icon name={location ? "check" : "location"} size={14} color={location ? accent : "#94A3B8"} />
      </View>
      {location ? (
        <>
          <Text className="text-sm font-bold font-mono text-[#0F172A] mt-1" numberOfLines={1}>{locationText(location)}</Text>
          <Text className="text-[11px] text-[#64748B]" numberOfLines={1}>{location.zone} · {location.aisle}</Text>
        </>
      ) : (
        <Text className="text-sm text-[#94A3B8] mt-1">{active ? "Elige en el plano" : "Sin elegir"}</Text>
      )}
    </Pressable>
  );
}

export default function MoveConfigScreen({ token, warehouse, moveType, modules, allowedWarehouseIds, onStart }: Props) {
  const warehouseId = warehouse.id;
  const { title, desc, icon } = TYPE_LABELS[moveType];
  const referenceRequired = moduleSetting(modules, TYPE_MODULE[moveType], "requireReference") === true;
  const interWarehouse = moveType === "transfer" && moduleSetting(modules, "transfer", "allowInterWarehouse") !== false;
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [occupancy, setOccupancy] = useState<Map<string, number>>(new Map());
  const [loadError, setLoadError] = useState('');
  const [origin, setOrigin] = useState<Location | undefined>();
  const [dest, setDest] = useState<Location | undefined>();
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  // Transfer between warehouses (§4.5.6): destination warehouse and its locations.
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [destWarehouse, setDestWarehouse] = useState<Warehouse>(warehouse);
  const [destLocations, setDestLocations] = useState<Location[] | null>(null);

  const needsOrigin = moveType === "exit" || moveType === "transfer";
  const needsDest = moveType === "entry" || moveType === "transfer";
  const [active, setActive] = useState<Side>(needsOrigin ? "origin" : "dest");

  useEffect(() => {
    let cancelled = false;
    fetchLocations(token, warehouseId)
      .then(locs => { if (!cancelled) setLocations(locs); })
      .catch(err => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "No se pudieron cargar las ubicaciones."); });
    // Occupancy is a nicety: without it every position simply shows as empty.
    fetchOccupancy(token)
      .then(units => { if (!cancelled) setOccupancy(units); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, warehouseId]);

  useEffect(() => {
    if (!interWarehouse) return;
    fetchWarehouses(token)
      .then(list => setWarehouses(list.filter(w => w.state === "active" && (!allowedWarehouseIds || allowedWarehouseIds.includes(w.id)))))
      .catch(() => {});
  }, [token, interWarehouse, allowedWarehouseIds]);

  useEffect(() => {
    if (destWarehouse.id === warehouseId) { setDestLocations(null); return; }
    let cancelled = false;
    setDestLocations(null);
    fetchLocations(token, destWarehouse.id)
      .then(locs => { if (!cancelled) setDestLocations(locs); })
      .catch(err => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "No se pudieron cargar las ubicaciones del almacén destino."); });
    return () => { cancelled = true; };
  }, [token, destWarehouse, warehouseId]);

  function handleSelect(location: Location) {
    setError("");
    if (active === "origin") {
      setOrigin(location);
      // Transfer: after the origin, go straight to picking the destination.
      if (needsDest && !dest) setActive("dest");
    } else {
      setDest(location);
      if (needsOrigin && !origin) setActive("origin");
    }
  }

  function handleStart() {
    if (needsOrigin && !origin?.id) {
      setError("Elige en el plano la ubicación de origen.");
      setActive("origin");
      return;
    }
    if (needsDest && !dest?.id) {
      setError("Elige en el plano la ubicación de destino.");
      setActive("dest");
      return;
    }
    if (moveType === "transfer" && origin?.id === dest?.id) {
      setError("El origen y destino no pueden ser la misma ubicación.");
      return;
    }
    if (referenceRequired && !reference.trim()) {
      setError("Tu empresa exige una referencia (documento o motivo) para este movimiento.");
      return;
    }
    setError("");
    onStart(
      needsOrigin ? origin : undefined,
      needsDest ? dest : undefined,
      reference.trim() || undefined,
      moveType === "transfer" ? destWarehouse : undefined,
    );
  }

  const style = SIDE_STYLE[active];
  const other = active === "origin" ? dest : origin;
  // Transfer between warehouses: the plan follows the side being picked.
  const mapWarehouse = active === "dest" ? destWarehouse : warehouse;
  const mapLocations = mapWarehouse.id === warehouseId ? locations : destLocations;
  const mapTitle = !(needsOrigin && needsDest)
    ? "Plano del almacén"
    : `Plano · eligiendo ${style.label.toLowerCase()}${destWarehouse.id !== warehouseId ? ` en ${mapWarehouse.name}` : ""}`;

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* Header */}
      <View className="bg-white px-5 pt-5 pb-4 border-b border-[#E2E8F0]">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 bg-[#EEF2FF] rounded-[8px] items-center justify-center">
            <Icon name={icon} size={20} color="#4F46E5" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-[#0F172A]">{title}</Text>
            <Text className="text-xs text-[#64748B]">{desc}</Text>
          </View>
        </View>
      </View>

      <View className="flex-1 px-4 py-4 gap-4">
        {!locations && !loadError && (
          <View className="items-center py-10">
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text className="text-sm text-[#64748B] mt-3">Cargando plano del almacén...</Text>
          </View>
        )}

        {!!loadError && (
          <View className="flex-row items-center gap-2 bg-[#FEE2E2] px-4 py-3 rounded-[10px]">
            <Icon name="warning" size={16} color="#7F1D1D" />
            <Text className="text-sm text-[#7F1D1D] flex-1">{loadError}</Text>
          </View>
        )}

        {locations && (
          <>
            <View className="flex-row gap-3">
              {needsOrigin && <SideCard side="origin" location={origin} active={active === "origin"} onPress={() => setActive("origin")} />}
              {needsDest && <SideCard side="dest" location={dest} active={active === "dest"} onPress={() => setActive("dest")} />}
            </View>

            {interWarehouse && warehouses.length > 1 && (
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-2">
                  Almacén destino
                </Text>
                <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 flex-row items-center px-4 py-2.5">
                  <SelectField
                    value={destWarehouse.name}
                    placeholder="Elige almacén"
                    options={warehouses.map(w => w.name)}
                    onSelect={name => {
                      const next = warehouses.find(w => w.name === name);
                      if (next && next.id !== destWarehouse.id) { setDestWarehouse(next); setDest(undefined); setActive("dest"); }
                    }}
                  />
                  <Icon name="chevron_down" size={14} color="#94A3B8" />
                </View>
              </View>
            )}

            <View>
              <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-2">
                {mapTitle}
              </Text>
              {mapLocations ? (
                <WarehouseMap
                  key={mapWarehouse.id}
                  locations={mapLocations}
                  occupancy={occupancy}
                  selectedId={(active === "origin" ? origin : dest)?.id}
                  blockedId={moveType === "transfer" ? other?.id : undefined}
                  blockedLabel={active === "origin" ? "Destino" : "Origen"}
                  accent={style.accent}
                  onSelect={handleSelect}
                />
              ) : (
                <ActivityIndicator size="small" color="#4F46E5" />
              )}
            </View>

            <Input
              label={referenceRequired ? "Referencia (obligatoria)" : "Referencia (opcional)"}
              placeholder="Ej. OC-4421, REQ-0912..."
              value={reference}
              onChange={setReference}
              hint="Número de orden, pedido u otro identificador"
            />
          </>
        )}

        {!!error && (
          <View className="flex-row items-center gap-2 bg-[#FEE2E2] px-4 py-3 rounded-[10px]">
            <Icon name="warning" size={16} color="#7F1D1D" />
            <Text className="text-sm text-[#7F1D1D] flex-1">{error}</Text>
          </View>
        )}
      </View>

      {/* Sticky CTA */}
      <View className="p-4 bg-white border-t border-[#E2E8F0]">
        <Button fullWidth size="lg" icon="scan" onClick={handleStart} disabled={!locations}>
          Comenzar a escanear
        </Button>
      </View>
    </View>
  );
}
