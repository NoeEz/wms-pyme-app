import React, { useState } from "react";
import { View, Text } from "react-native";
import { Button, Icon, Badge } from "../components/ui";
import type { MovementItem, MoveType, Location, ConnectionStatus, Warehouse } from "../types";
import { ApiError } from "../services/api";

interface Props {
  moveType: MoveType;
  items: MovementItem[];
  warehouse: Warehouse;
  origin?: Location;
  destination?: Location;
  reference?: string;
  user: string;
  connection: ConnectionStatus;
  onConfirm: () => Promise<void>;
  onEdit: () => void;
}

export default function MovementReviewScreen({
  moveType, items, warehouse, origin, destination, reference, user, connection, onConfirm, onEdit,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const totalUnits = items.reduce((s, i) => s + (i.product.serialized ? i.serials.length : i.quantity), 0);

  async function handleConfirmPress() {
    setSubmitting(true);
    setSubmitError('');
    try {
      await onConfirm();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'No se pudo confirmar el movimiento. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }
  const moveLabel = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' }[moveType];
  const moveIcon = { entry: 'entry', exit: 'exit', transfer: 'transfer' }[moveType];
  const moveBadge = { entry: 'info', exit: 'success', transfer: 'warning' } as const;

  function formatLoc(loc?: Location) {
    if (!loc) return '—';
    return `${loc.zone} / ${loc.aisle} / ${loc.rack} / ${loc.position}`;
  }

  const now = new Date();
  const dateStr = now.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="bg-white border-b border-[#E2E8F0] px-4 py-3">
        <Text className="text-base font-semibold text-[#0F172A]">Revisar movimiento</Text>
        <Text className="text-xs text-[#64748B]">Verifica los detalles antes de confirmar</Text>
      </View>

      <View className="flex-1 px-4 py-4 flex flex-col gap-4">
        {/* Type card */}
        <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-4">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-10 h-10 bg-[#EEF2FF] rounded-[8px] items-center justify-center">
              <Icon name={moveIcon} size={20} color="#4F46E5" />
            </View>
            <View>
              <Text className="text-base font-semibold text-[#0F172A]">{moveLabel}</Text>
              <Badge variant={moveBadge[moveType]}>Pendiente de confirmar</Badge>
            </View>
          </View>
          <View className="flex flex-col gap-2">
            <Row label="Almacén" value={warehouse.name} />
            {origin && <Row label="Origen" value={formatLoc(origin)} mono />}
            {destination && <Row label="Destino" value={formatLoc(destination)} mono />}
            <Row label="Usuario" value={user} />
            <Row label="Fecha y hora" value={dateStr} />
            {reference && <Row label="Referencia" value={reference} />}
          </View>
        </View>

        {/* Items */}
        <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
          <View className="px-4 py-3 border-b border-[#F1F5F9] flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-[#475569]">Artículos</Text>
            <Text className="text-sm font-bold text-[#4F46E5]">{totalUnits} ud. · {items.length} producto(s)</Text>
          </View>
          {items.map((item, i) => (
            <View key={item.id} className={`px-4 py-3 ${i > 0 ? 'border-t border-[#F1F5F9]' : ''}`}>
              <View className="flex-row items-start justify-between">
                <View className="flex-1 min-w-0">
                  <Text className="text-sm font-medium text-[#0F172A]" numberOfLines={1}>{item.product.name}</Text>
                  <Text className="text-xs font-mono text-[#94A3B8]">{item.product.sku}</Text>
                  {item.lot && <Text className="text-xs text-[#64748B]">Lote: {item.lot}</Text>}
                  {item.serials.length > 0 && (
                    <Text className="text-xs font-mono text-[#64748B]">
                      Serie(s): {item.serials.join(', ')}
                    </Text>
                  )}
                </View>
                <Text className="text-sm font-bold text-[#475569] ml-2">
                  ×{item.product.serialized ? item.serials.length : item.quantity}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Offline notice */}
        {connection !== 'online' && (
          <View className="flex-row items-start gap-3 bg-[#FEF3C7] border border-[#FDE68A] rounded-[12px] px-4 py-3">
            <Icon name="wifi_off" size={18} color="#B45309" />
            <View>
              <Text className="text-sm font-semibold text-[#78350F]">Sin conexión</Text>
              <Text className="text-xs text-[#92400E]">El movimiento se guardará en este dispositivo y se sincronizará cuando recuperes la conexión.</Text>
            </View>
          </View>
        )}

        {/* Warning */}
        <View className="flex-row items-center gap-2 bg-[#F1F5F9] rounded-[10px] px-3 py-3">
          <Icon name="info" size={15} color="#64748B" />
          <Text className="text-xs text-[#64748B] flex-1">
            Al confirmar se actualizará el inventario. Esta acción no se puede deshacer.
          </Text>
        </View>

        {submitError && (
          <View className="flex-row items-start gap-2 bg-[#FEE2E2] rounded-[10px] px-4 py-3">
            <Icon name="warning" size={16} color="#7F1D1D" />
            <Text className="text-sm text-[#7F1D1D] flex-1">{submitError}</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View className="bg-white border-t border-[#E2E8F0] px-4 py-3 flex flex-col gap-2">
        <Button fullWidth size="lg" variant="primary" loading={submitting} onClick={handleConfirmPress} icon="check">
          Confirmar movimiento
        </Button>
        <Button fullWidth variant="ghost" onClick={onEdit} disabled={submitting} icon="edit">
          Volver a editar
        </Button>
      </View>
    </View>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row items-start gap-2 justify-between">
      <Text className="text-sm text-[#94A3B8]">{label}</Text>
      <Text className={`text-right text-[#475569] ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</Text>
    </View>
  );
}
