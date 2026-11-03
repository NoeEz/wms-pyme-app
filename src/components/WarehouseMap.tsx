import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { Icon } from "./ui";
import { buildLayout, shortLabel, type AisleNode, type ZoneNode } from "../services/warehouseLayout";
import type { Location } from "../types";

// Floor plan of a warehouse: zones as areas, aisles as columns inside them
// (each rack a little bar that fills with stock). Tapping an aisle opens a
// sheet where every rack is drawn as a shelf with its positions; tapping a
// position selects that location.

const OCCUPIED = { bg: "#D1FAE5", border: "#34D399", text: "#065F46" };
const EMPTY = { bg: "#FFFFFF", border: "#CBD5E1", text: "#64748B" };

interface Props {
  locations: Location[];
  /** Units on hand per location id; locations missing from the map are empty. */
  occupancy: Map<string, number>;
  selectedId?: string;
  /** A location that can't be chosen here, e.g. the origin while picking the destination. */
  blockedId?: string;
  blockedLabel?: string;
  accent?: string;
  onSelect: (location: Location) => void;
}

const containsId = (aisle: AisleNode, id?: string) => !!id && aisle.racks.some(r => r.positions.some(p => p.location.id === id));

function AisleTile({ aisle, selected, accent, onPress }: { aisle: AisleNode; selected: boolean; accent: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${aisle.name}, ${aisle.occupied} de ${aisle.total} posiciones ocupadas`}
      style={({ pressed }) => ({
        width: 62,
        minHeight: 96,
        borderWidth: selected ? 2.5 : 1,
        borderColor: selected ? accent : "#CBD5E1",
        backgroundColor: selected ? "#FFFFFF" : "#FAFAFA",
        opacity: pressed ? 0.75 : 1,
      })}
      className="rounded-lg items-center pt-1.5 pb-1.5 overflow-hidden"
    >
      <Text className="text-[10px] font-bold text-[#475569]">{shortLabel(aisle.name)}</Text>
      <View className="flex-1 w-full px-1.5 py-1.5 gap-[5px] justify-center">
        {aisle.racks.map(rack => (
          <View key={rack.name} className="h-2.5 rounded-sm bg-[#E2E8F0] overflow-hidden">
            <View style={{ width: `${rack.positions.length ? (rack.occupied / rack.positions.length) * 100 : 0}%`, backgroundColor: "#34D399" }} className="h-full" />
          </View>
        ))}
      </View>
      <Text className="text-[9px] text-[#64748B]">{aisle.occupied}/{aisle.total}</Text>
      {selected && (
        <View style={{ backgroundColor: accent }} className="absolute top-0 right-0 w-4 h-4 rounded-bl-lg items-center justify-center">
          <Icon name="check" size={10} color="#FFFFFF" />
        </View>
      )}
    </Pressable>
  );
}

function Legend() {
  const items = [
    { label: "Ocupada", bg: OCCUPIED.bg, border: OCCUPIED.border },
    { label: "Vacía", bg: EMPTY.bg, border: EMPTY.border },
  ];
  return (
    <View className="flex-row items-center gap-4">
      {items.map(i => (
        <View key={i.label} className="flex-row items-center gap-1.5">
          <View style={{ backgroundColor: i.bg, borderColor: i.border }} className="w-3.5 h-3.5 rounded border" />
          <Text className="text-[11px] text-[#64748B]">{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

function AisleSheet({ zone, aisle, selectedId, blockedId, blockedLabel, accent, onPick, onClose }: {
  zone: ZoneNode;
  aisle: AisleNode;
  selectedId?: string;
  blockedId?: string;
  blockedLabel: string;
  accent: string;
  onPick: (location: Location) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} accessibilityLabel="Cerrar" />
        <View className="bg-white rounded-t-[22px] pt-4" style={{ maxHeight: "82%" }}>
          <View className="flex-row items-start justify-between px-5 pb-3">
            <View className="flex-1">
              <Text className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase">{zone.name}</Text>
              <Text className="text-lg font-semibold text-[#0F172A]">{aisle.name}</Text>
              <Text className="text-xs text-[#64748B] mt-0.5">Toca la posición donde se trabajará</Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Cerrar" className="w-9 h-9 rounded-full bg-[#F1F5F9] items-center justify-center">
              <Icon name="x" size={16} color="#475569" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 16 }}>
            {aisle.racks.map(rack => (
              <View key={rack.name}>
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-xs font-bold text-[#334155] uppercase tracking-wide">{rack.name}</Text>
                  <Text className="text-[11px] text-[#64748B]">{rack.occupied} de {rack.positions.length} ocupadas</Text>
                </View>
                {/* The shelf: frame, positions, bottom plank */}
                <View className="rounded-md border-2 border-[#94A3B8] bg-[#F1F5F9] p-1.5">
                  <View className="flex-row flex-wrap gap-1.5">
                    {rack.positions.map(p => {
                      const selected = p.location.id === selectedId;
                      const blocked = p.location.id === blockedId;
                      const palette = p.units > 0 ? OCCUPIED : EMPTY;
                      return (
                        <Pressable
                          key={p.location.id}
                          disabled={blocked}
                          onPress={() => onPick(p.location)}
                          accessibilityRole="button"
                          accessibilityState={{ selected, disabled: blocked }}
                          accessibilityLabel={`${p.location.position}, ${p.units > 0 ? `${p.units} unidades` : "vacía"}${blocked ? `, ${blockedLabel}` : ""}`}
                          style={({ pressed }) => ({
                            width: 62,
                            height: 58,
                            backgroundColor: selected ? accent : palette.bg,
                            borderColor: selected ? accent : palette.border,
                            borderWidth: 1.5,
                            borderStyle: p.units > 0 || selected ? "solid" : "dashed",
                            opacity: blocked ? 0.4 : pressed ? 0.7 : 1,
                          })}
                          className="rounded-md items-center justify-center"
                        >
                          {selected
                            ? <Icon name="check" size={16} color="#FFFFFF" />
                            : <Icon name="package" size={16} color={palette.text} />}
                          <Text style={{ color: selected ? "#FFFFFF" : palette.text }} className="text-xs font-bold mt-0.5">{p.label}</Text>
                          <Text style={{ color: selected ? "#E0E7FF" : palette.text }} className="text-[9px]">
                            {blocked ? blockedLabel : p.units > 0 ? `${p.units} ud.` : "vacía"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View className="h-1.5 rounded-b bg-[#94A3B8] mx-1" />
              </View>
            ))}
            <Legend />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function WarehouseMap({ locations, occupancy, selectedId, blockedId, blockedLabel = "Origen", accent = "#4F46E5", onSelect }: Props) {
  const zones = useMemo(() => buildLayout(locations, occupancy), [locations, occupancy]);
  const [open, setOpen] = useState<{ zone: ZoneNode; aisle: AisleNode } | null>(null);

  if (!zones.length) {
    return (
      <View className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-4 py-8 items-center">
        <Icon name="location" size={22} color="#94A3B8" />
        <Text className="text-sm text-[#64748B] mt-2 text-center">Este almacén aún no tiene ubicaciones.</Text>
      </View>
    );
  }

  return (
    <View>
      {/* The floor: a dashed outline with the access strip at the bottom */}
      <View style={{ borderStyle: "dashed" }} className="rounded-2xl border-2 border-[#94A3B8] bg-[#E2E8F0]/50 p-2.5 gap-2.5">
        {zones.map(zone => (
          <View key={zone.name} className="rounded-xl border border-[#CBD5E1] bg-[#F1F5F9] p-2.5">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-[11px] font-bold tracking-wider text-[#475569] uppercase">{zone.name}</Text>
              <Text className="text-[10px] text-[#64748B]">{zone.occupied}/{zone.total} ocupadas</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {zone.aisles.map(aisle => (
                <AisleTile
                  key={aisle.name}
                  aisle={aisle}
                  accent={accent}
                  selected={containsId(aisle, selectedId)}
                  onPress={() => setOpen({ zone, aisle })}
                />
              ))}
            </View>
          </View>
        ))}
        <View className="self-center flex-row items-center gap-1.5 bg-[#CBD5E1] rounded-t-lg px-4 py-1 -mb-2.5">
          <Icon name="entry" size={12} color="#475569" />
          <Text className="text-[10px] font-bold tracking-widest text-[#475569] uppercase">Acceso / andén</Text>
        </View>
      </View>
      <View className="mt-4 items-center"><Legend /></View>

      {open && (
        <AisleSheet
          zone={open.zone}
          aisle={open.aisle}
          selectedId={selectedId}
          blockedId={blockedId}
          blockedLabel={blockedLabel}
          accent={accent}
          onPick={loc => { setOpen(null); onSelect(loc); }}
          onClose={() => setOpen(null)}
        />
      )}
    </View>
  );
}
