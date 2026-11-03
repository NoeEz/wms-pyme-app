import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Button, Icon, Badge } from "../components/ui";
import type { MoveType, MovementItem, MoveOutcome } from "../types";
import { useQueuedMovement, retry } from "../services/syncQueue";

interface Props {
  token: string;
  moveType: MoveType;
  items: MovementItem[];
  outcome: MoveOutcome;
  onNewMovement: () => void;
  onViewDetail: () => void;
}

export default function MovementResultScreen({ token, moveType, items, outcome, onNewMovement, onViewDetail }: Props) {
  // A queued movement keeps updating live while the offline queue syncs it.
  const queued = useQueuedMovement(outcome.kind === 'queued' ? outcome.id : undefined);
  const syncState: 'saved' | 'syncing' | 'synced' | 'error' =
    outcome.kind === 'synced' ? 'synced' :
    queued?.status === 'synced' ? 'synced' :
    queued?.status === 'syncing' ? 'syncing' :
    queued?.status === 'error' ? 'error' : 'saved';
  const folio = outcome.kind === 'synced' ? outcome.folio : queued?.folio;

  const totalUnits = items.reduce((s, i) => s + (i.product.serialized ? i.serials.length : i.quantity), 0);
  const moveLabel = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' }[moveType];
  const capturedAt = queued ? new Date(queued.createdAt) : new Date();
  const timeLabel = capturedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 items-center justify-start px-4 py-8 gap-5">
        {/* Result icon */}
        <View className={`w-20 h-20 rounded-full items-center justify-center ${syncState === 'error' ? 'bg-[#FEE2E2]' : syncState === 'synced' ? 'bg-[#D1FAE5]' : 'bg-[#FEF3C7]'}`}>
          <Icon
            name={syncState === 'error' ? 'warning' : syncState === 'synced' ? 'check' : 'clock'}
            size={36}
            color={syncState === 'error' ? '#DC2626' : syncState === 'synced' ? '#059669' : '#B45309'}
          />
        </View>

        <View className="items-center">
          <Text className="text-xl font-bold text-[#0F172A] mb-1">
            {syncState === 'error' ? `${moveLabel} rechazada` : syncState === 'synced' ? `${moveLabel} registrada` : `${moveLabel} guardada`}
          </Text>
          <Text className="text-sm text-[#64748B] text-center">
            {syncState === 'error' ? 'El servidor no aceptó el movimiento al sincronizar' :
             syncState === 'synced' ? 'El movimiento se registró correctamente' :
             'Se guardó en este dispositivo y se enviará al recuperar conexión'}
          </Text>
        </View>

        {/* Folio card */}
        <View className="w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs text-[#94A3B8] uppercase tracking-wide">Folio</Text>
            <Badge variant={moveType === 'entry' ? 'info' : moveType === 'exit' ? 'success' : 'warning'}>
              {moveLabel}
            </Badge>
          </View>
          {folio ? (
            <Text className="text-lg font-bold font-mono text-[#4F46E5] mb-1">{folio}</Text>
          ) : (
            <Text className="text-sm font-medium text-[#94A3B8] mb-1">Se asignará al sincronizar</Text>
          )}
          <Text className="text-xs text-[#94A3B8]">{timeLabel} · hoy</Text>

          <View className="mt-3 pt-3 border-t border-[#F1F5F9] flex-row gap-4">
            <View>
              <Text className="text-xs text-[#94A3B8]">Productos</Text>
              <Text className="text-sm font-semibold text-[#475569]">{items.length}</Text>
            </View>
            <View>
              <Text className="text-xs text-[#94A3B8]">Unidades</Text>
              <Text className="text-sm font-semibold text-[#475569]">{totalUnits}</Text>
            </View>
          </View>
        </View>

        {/* Sync status */}
        <View className={`w-full rounded-[12px] px-4 py-3 flex-row items-center gap-3
          ${syncState === 'synced' ? 'bg-[#D1FAE5] border border-[#6EE7B7]' :
            syncState === 'error' ? 'bg-[#FEE2E2] border border-[#FCA5A5]' :
            syncState === 'syncing' ? 'bg-[#E0E7FF] border border-[#A5B4FC]' :
            'bg-[#FEF3C7] border border-[#FDE68A]'}`}>
          {syncState === 'synced' ? (
            <Icon name="check" size={18} color="#059669" />
          ) : syncState === 'syncing' ? (
            <ActivityIndicator size="small" color="#6366F1" />
          ) : syncState === 'error' ? (
            <Icon name="warning" size={18} color="#DC2626" />
          ) : (
            <Icon name="clock" size={18} color="#B45309" />
          )}
          <View className="flex-1">
            <Text className={`text-sm font-semibold
              ${syncState === 'synced' ? 'text-[#065F46]' :
                syncState === 'error' ? 'text-[#7F1D1D]' :
                syncState === 'syncing' ? 'text-[#3730A3]' :
                'text-[#78350F]'}`}>
              {syncState === 'synced' ? 'Sincronizado con el servidor' :
               syncState === 'syncing' ? 'Sincronizando...' :
               syncState === 'error' ? 'Error de sincronización' :
               'Guardado en este dispositivo'}
            </Text>
            {syncState === 'saved' && (
              <Text className="text-xs text-[#92400E]">Se sincronizará cuando recuperes conexión</Text>
            )}
            {syncState === 'error' && queued?.lastError && (
              <Text className="text-xs text-[#7F1D1D]">{queued.lastError}</Text>
            )}
          </View>
        </View>

        {syncState === 'error' && queued && (
          <Button variant="primary" fullWidth onClick={() => retry(token, queued.id)}>
            Reintentar
          </Button>
        )}
      </View>

      {/* Bottom actions */}
      <View className="bg-white border-t border-[#E2E8F0] px-4 py-3 flex flex-col gap-2">
        <Button fullWidth size="lg" onClick={onNewMovement} icon="plus">
          Nuevo movimiento
        </Button>
        <Button fullWidth variant="ghost" onClick={onViewDetail}>
          {outcome.kind === 'queued' ? 'Ver pendientes' : 'Ver historial'}
        </Button>
      </View>
    </View>
  );
}
