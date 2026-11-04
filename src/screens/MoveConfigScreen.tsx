import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Button, Input, Icon, SelectField } from "../components/ui";
import type { MoveType, Location, ModuleInfo, Warehouse } from "../types";
import { fetchLocations } from "../services/locations";
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
  entry: { title: "Entrada de mercancía", desc: "Selecciona la ubicación donde se almacenará la mercancía.", icon: "entry" },
  exit: { title: "Salida de mercancía", desc: "Selecciona la ubicación de donde saldrá la mercancía.", icon: "exit" },
  transfer: { title: "Transferencia", desc: "Selecciona origen y destino del movimiento.", icon: "transfer" },
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function LocationPicker({ label, locations, value, onChange }: {
  label: string;
  locations: Location[];
  value: Partial<Location>;
  onChange: (v: Partial<Location>) => void;
}) {
  const zoneOptions = uniqueSorted(locations.map(l => l.zone));
  const aisleOptions = value.zone ? uniqueSorted(locations.filter(l => l.zone === value.zone).map(l => l.aisle)) : [];
  const rackOptions = value.zone && value.aisle
    ? uniqueSorted(locations.filter(l => l.zone === value.zone && l.aisle === value.aisle).map(l => l.rack))
    : [];
  const positionOptions = value.zone && value.aisle && value.rack
    ? uniqueSorted(locations.filter(l => l.zone === value.zone && l.aisle === value.aisle && l.rack === value.rack).map(l => l.position))
    : [];

  const levels = [
    { key: "zone" as const, label: "Zona", options: zoneOptions, dep: null },
    { key: "aisle" as const, label: "Pasillo", options: aisleOptions, dep: "zone" as const },
    { key: "rack" as const, label: "Rack", options: rackOptions, dep: "aisle" as const },
    { key: "position" as const, label: "Posición", options: positionOptions, dep: "rack" as const },
  ];

  return (
    <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
      <View className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0]">
        <Text className="text-sm font-semibold text-[#475569]">{label}</Text>
        {value.zone && value.aisle && value.rack && value.position && (
          <Text className="text-xs font-mono text-[#4F46E5] mt-0.5">
            {`${value.zone} / ${value.aisle} / ${value.rack} / ${value.position}`}
          </Text>
        )}
      </View>
      <View className="flex-col">
        {levels.map(({ key, label: l, options, dep }, i) => {
          const locked = dep !== null && !value[dep];
          return (
            <View key={key} className={`flex-row items-center px-4 py-2.5 ${i > 0 ? "border-t border-[#F1F5F9]" : ""}`}>
              <Text className="text-sm text-[#475569] w-20">{l}</Text>
              <SelectField
                disabled={locked}
                value={value[key] ?? ""}
                placeholder={locked ? `Selecciona ${dep ?? ""}` : `Elige ${l.toLowerCase()}`}
                options={options}
                onSelect={v => {
                  const newVal = { ...value, [key]: v };
                  if (key === "zone") { delete newVal.aisle; delete newVal.rack; delete newVal.position; }
                  if (key === "aisle") { delete newVal.rack; delete newVal.position; }
                  if (key === "rack") { delete newVal.position; }
                  // Resolve the concrete backend location once all 4 levels match.
                  const complete = newVal.zone && newVal.aisle && newVal.rack && newVal.position;
                  const resolved = complete
                    ? locations.find(loc => loc.zone === newVal.zone && loc.aisle === newVal.aisle && loc.rack === newVal.rack && loc.position === newVal.position)
                    : undefined;
                  onChange(resolved ?? newVal);
                }}
              />
              <Icon name="chevron_down" size={14} color="#94A3B8" />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function MoveConfigScreen({ token, warehouse, moveType, modules, allowedWarehouseIds, onStart }: Props) {
  const warehouseId = warehouse.id;
  const { title, desc, icon } = TYPE_LABELS[moveType];
  const referenceRequired = moduleSetting(modules, TYPE_MODULE[moveType], "requireReference") === true;
  const interWarehouse = moveType === "transfer" && moduleSetting(modules, "transfer", "allowInterWarehouse") !== false;
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [origin, setOrigin] = useState<Partial<Location>>({});
  const [dest, setDest] = useState<Partial<Location>>({});
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  // Transfer between warehouses (§4.5.6): destination warehouse and its locations.
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [destWarehouse, setDestWarehouse] = useState<Warehouse>(warehouse);
  const [destLocations, setDestLocations] = useState<Location[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLocations(token, warehouseId)
      .then(locs => { if (!cancelled) setLocations(locs); })
      .catch(err => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "No se pudieron cargar las ubicaciones."); });
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

  const isLocComplete = (l: Partial<Location>) =>
    !!(l.zone && l.aisle && l.rack && l.position && l.id);

  const needsOrigin = moveType === "exit" || moveType === "transfer";
  const needsDest = moveType === "entry" || moveType === "transfer";

  function handleStart() {
    if (needsOrigin && !isLocComplete(origin)) {
      setError("Selecciona la ubicación de origen completa.");
      return;
    }
    if (needsDest && !isLocComplete(dest)) {
      setError("Selecciona la ubicación de destino completa.");
      return;
    }
    if (moveType === "transfer" && origin.id === dest.id) {
      setError("El origen y destino no pueden ser la misma ubicación.");
      return;
    }
    if (referenceRequired && !reference.trim()) {
      setError("Tu empresa exige una referencia (documento o motivo) para este movimiento.");
      return;
    }
    setError("");
    onStart(
      needsOrigin ? origin as Location : undefined,
      needsDest ? dest as Location : undefined,
      reference.trim() || undefined,
      moveType === "transfer" ? destWarehouse : undefined,
    );
  }

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
            <Text className="text-sm text-[#64748B] mt-3">Cargando ubicaciones...</Text>
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
            {needsOrigin && (
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-2">
                  Ubicación de origen
                </Text>
                <LocationPicker label="Origen" locations={locations} value={origin} onChange={setOrigin} />
              </View>
            )}

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
                      if (next && next.id !== destWarehouse.id) { setDestWarehouse(next); setDest({}); }
                    }}
                  />
                  <Icon name="chevron_down" size={14} color="#94A3B8" />
                </View>
              </View>
            )}

            {needsDest && (
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-2">
                  {destWarehouse.id !== warehouseId ? `Ubicación de destino en ${destWarehouse.name}` : "Ubicación de destino"}
                </Text>
                {destWarehouse.id !== warehouseId && !destLocations ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <LocationPicker
                    label="Destino"
                    locations={destWarehouse.id !== warehouseId ? destLocations ?? [] : locations}
                    value={dest}
                    onChange={setDest}
                  />
                )}
              </View>
            )}

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
