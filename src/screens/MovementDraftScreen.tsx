import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Button, Icon, Badge, QuantityStepper, Dialog } from "../components/ui";
import type { MovementItem, MoveType, Location } from "../types";

interface Props {
  moveType: MoveType;
  items: MovementItem[];
  origin?: Location;
  destination?: Location;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemoveItem: (id: string) => void;
  onContinueScan: () => void;
  onReview: () => void;
}

export default function MovementDraftScreen({
  moveType, items, origin, destination,
  onUpdateQuantity, onRemoveItem, onContinueScan, onReview,
}: Props) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalUnits = items.reduce((s, i) => s + (i.product.serialized ? i.serials.length : i.quantity), 0);
  const moveLabel = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' }[moveType];

  // Group items by product+lot
  const grouped = items.reduce<Record<string, MovementItem[]>>((acc, item) => {
    const key = `${item.product.id}_${item.lot ?? ''}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  function formatLoc(loc?: Location) {
    if (!loc) return '—';
    return `${loc.zone.replace('Zona ', '')}-${loc.aisle.replace('Pasillo ', '')}-R${loc.rack.replace('Rack ', '')}-P${loc.position.replace('Posición ', '')}`;
  }

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* Header */}
      <View className="bg-white border-b border-[#E2E8F0] px-4 py-3">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-base font-semibold text-[#0F172A]">{moveLabel} en preparación</Text>
          <Badge variant={moveType === 'entry' ? 'info' : moveType === 'exit' ? 'success' : 'warning'}>
            Borrador
          </Badge>
        </View>
        <View className="flex-row gap-4">
          {origin && <Text className="text-xs text-[#64748B]">Origen: <Text className="font-mono text-[#4F46E5]">{formatLoc(origin)}</Text></Text>}
          {destination && <Text className="text-xs text-[#64748B]">Destino: <Text className="font-mono text-[#4F46E5]">{formatLoc(destination)}</Text></Text>}
        </View>
      </View>

      {/* Summary bar */}
      <View className="bg-[#EEF2FF] border-b border-[#C7D2FE] px-4 py-2.5 flex-row items-center justify-between">
        <View className="flex-row gap-4">
          <Text className="text-xs text-[#4F46E5]"><Text className="font-bold">{items.length}</Text> producto(s)</Text>
          <Text className="text-xs text-[#4F46E5]"><Text className="font-bold">{totalUnits}</Text> unidad(es)</Text>
        </View>
        <Pressable
          onPress={onContinueScan}
          className="flex-row items-center gap-1"
        >
          <Icon name="scan" size={14} color="#4F46E5" />
          <Text className="text-xs font-semibold text-[#4F46E5]">Seguir escaneando</Text>
        </Pressable>
      </View>

      {/* Items list */}
      <View className="flex-1 px-4 py-3 flex flex-col gap-3">
        {items.length === 0 && (
          <View className="items-center justify-center py-12">
            <View className="w-14 h-14 bg-[#F1F5F9] rounded-full items-center justify-center mb-3">
              <Icon name="package" size={24} color="#94A3B8" />
            </View>
            <Text className="text-sm text-[#64748B]">No hay artículos aún</Text>
            <Pressable onPress={onContinueScan}>
              <Text className="text-sm font-semibold text-[#4F46E5] mt-2">Comenzar a escanear</Text>
            </Pressable>
          </View>
        )}

        {Object.entries(grouped).map(([key, groupItems]) => {
          const first = groupItems[0];
          const isSerial = first.product.serialized;
          const totalQty = isSerial
            ? groupItems.reduce((s, i) => s + i.serials.length, 0)
            : groupItems.reduce((s, i) => s + i.quantity, 0);

          return (
            <View key={key} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
              {/* Product header */}
              <View className="px-4 py-3 border-b border-[#F1F5F9]">
                <View className="flex-row items-start gap-2">
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-semibold text-[#0F172A]" numberOfLines={1}>{first.product.name}</Text>
                    <Text className="text-xs font-mono text-[#64748B]">{first.product.sku}</Text>
                    {first.lot && <Text className="text-xs text-[#64748B]">Lote: {first.lot}</Text>}
                  </View>
                  <View className="items-end">
                    <Text className="text-lg font-bold text-[#4F46E5]">{totalQty}</Text>
                    <Text className="text-[10px] text-[#94A3B8]">unidades</Text>
                  </View>
                </View>
              </View>

              {/* Serials or quantity editor */}
              {isSerial ? (
                <View className="px-4 py-2 flex flex-col gap-1.5">
                  {groupItems.map(item =>
                    item.serials.map(s => (
                      <View key={s} className="flex-row items-center gap-2 bg-[#F8FAFC] rounded-[8px] px-3 py-2">
                        <Icon name="scan" size={12} color="#94A3B8" />
                        <Text className="text-xs font-mono text-[#475569] flex-1">{s}</Text>
                        <Pressable onPress={() => setDeleteId(item.id)}>
                          <Icon name="x" size={14} color="#94A3B8" />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              ) : (
                <View className="px-4 py-3 flex-row items-center justify-between">
                  <Text className="text-sm text-[#64748B]">Cantidad</Text>
                  <View className="flex-row items-center gap-2">
                    <QuantityStepper
                      value={totalQty}
                      onChange={qty => {
                        if (groupItems[0]) onUpdateQuantity(groupItems[0].id, qty);
                      }}
                    />
                    <Pressable
                      onPress={() => setDeleteId(groupItems[0].id)}
                      className="w-9 h-9 items-center justify-center border border-[#E2E8F0] rounded-[8px]"
                    >
                      <Icon name="trash" size={16} color="#94A3B8" />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* CTA */}
      <View className="bg-white border-t border-[#E2E8F0] px-4 py-3 flex flex-col gap-2">
        <Button
          fullWidth
          size="lg"
          onClick={onReview}
          disabled={items.length === 0}
          icon="chevron_right"
        >
          Revisar y confirmar
        </Button>
      </View>

      <Dialog
        open={!!deleteId}
        title="Eliminar artículo"
        message="¿Deseas eliminar este artículo del movimiento? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => { if (deleteId) { onRemoveItem(deleteId); setDeleteId(null); } }}
        onCancel={() => setDeleteId(null)}
      />
    </View>
  );
}
