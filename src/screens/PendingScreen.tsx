import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Icon, Badge, Dialog, EmptyState } from "../components/ui";
import type { ConnectionStatus } from "../types";
import { useSyncQueue, syncAll, retry, discard, type QueuedMovement } from "../services/syncQueue";

interface Props {
  token: string;
  userId: string;
  connection: ConnectionStatus;
}

const TYPE_LABELS: Record<string, string> = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' };

const statusConfig: Record<QueuedMovement['status'], { label: string; variant: 'warning' | 'info' | 'danger' | 'success'; icon: string }> = {
  pending: { label: 'Pendiente', variant: 'warning', icon: 'clock' },
  syncing: { label: 'Sincronizando', variant: 'info', icon: 'refresh' },
  error: { label: 'Rechazado', variant: 'danger', icon: 'warning' },
  synced: { label: 'Sincronizado', variant: 'success', icon: 'check' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PendingScreen({ token, userId, connection }: Props) {
  const items = [...useSyncQueue(userId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [discardId, setDiscardId] = useState<string | null>(null);
  const offline = connection === 'offline';
  const hasPending = items.some(i => i.status === 'pending');

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 px-4 py-4 flex flex-col gap-3">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-xs text-[#64748B] flex-1">
            {offline
              ? 'Sin conexión — se sincronizarán automáticamente al recuperar la señal.'
              : 'Los movimientos guardados en este dispositivo se envían automáticamente.'}
          </Text>
          {hasPending && !offline && (
            <Pressable
              onPress={() => syncAll(token, userId)}
              className="flex-row items-center gap-1.5 border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1.5 rounded-full"
            >
              <Icon name="refresh" size={14} color="#4F46E5" />
              <Text className="text-xs font-medium text-[#4F46E5]">Sincronizar</Text>
            </Pressable>
          )}
        </View>

        {items.length === 0 && (
          <EmptyState icon="check" title="Todo sincronizado" description="No hay movimientos pendientes" />
        )}

        {items.map(item => {
          const cfg = statusConfig[item.status];
          return (
            <View key={item.id} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
              <View className="px-4 py-3">
                <View className="flex-row items-start justify-between gap-2 mb-2">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-[#0F172A]">{TYPE_LABELS[item.moveType]} · {item.warehouseName}</Text>
                    <Text className="text-xs font-mono text-[#94A3B8]">
                      {item.folio ?? `Local ${item.id.slice(0, 8)}`}
                    </Text>
                  </View>
                  <Badge variant={cfg.variant} icon={cfg.icon}>{cfg.label}</Badge>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                  <View className="flex-row items-center gap-1">
                    <Icon name="clock" size={12} color="#64748B" />
                    <Text className="text-xs text-[#64748B]">{formatDate(item.createdAt)}</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Icon name="package" size={12} color="#64748B" />
                    <Text className="text-xs text-[#64748B]">{item.units} ud.</Text>
                  </View>
                  {item.reference && (
                    <Text className="text-xs text-[#64748B]">Ref: {item.reference}</Text>
                  )}
                  {item.attempts > 0 && item.status !== 'synced' && (
                    <Text className="text-xs text-[#94A3B8]">{item.attempts} intento(s)</Text>
                  )}
                </View>
                {item.lastError && item.status !== 'synced' && (
                  <View className={`mt-2 px-3 py-2 rounded-[8px] ${item.status === 'error' ? 'bg-[#FEE2E2]' : 'bg-[#FEF3C7]'}`}>
                    <Text className={`text-xs ${item.status === 'error' ? 'text-[#7F1D1D]' : 'text-[#78350F]'}`}>
                      {item.lastError}
                    </Text>
                  </View>
                )}
              </View>

              {item.status !== 'synced' && (
                <View className="px-4 pb-3 flex-row gap-2">
                  {item.status === 'syncing' ? (
                    <View className="flex-1 flex-row items-center justify-center gap-2 py-2">
                      <ActivityIndicator size="small" color="#6366F1" />
                      <Text className="text-xs text-[#6366F1]">Sincronizando...</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => retry(token, item.id)}
                      disabled={offline}
                      className={`flex-1 flex-row items-center justify-center gap-1.5 border border-[#C7D2FE] bg-[#EEF2FF] py-2 rounded-[8px] ${offline ? 'opacity-40' : ''}`}
                    >
                      <Icon name="refresh" size={14} color="#4F46E5" />
                      <Text className="text-xs font-medium text-[#4F46E5]">Reintentar</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setDiscardId(item.id)}
                    disabled={item.status === 'syncing'}
                    className="flex-row items-center justify-center gap-1.5 border border-[#E2E8F0] px-3 py-2 rounded-[8px]"
                  >
                    <Icon name="trash" size={14} color="#94A3B8" />
                    <Text className="text-xs font-medium text-[#94A3B8]">Descartar</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <Dialog
        open={!!discardId}
        title="Descartar movimiento"
        message="Este movimiento se eliminará permanentemente del dispositivo y no se sincronizará. ¿Continuar?"
        confirmLabel="Sí, descartar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => { if (discardId) discard(discardId); setDiscardId(null); }}
        onCancel={() => setDiscardId(null)}
      />
    </View>
  );
}
