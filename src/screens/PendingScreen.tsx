import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Icon, Badge, Dialog, EmptyState } from "../components/ui";
import type { PendingSync } from "../types";
import { PENDING_SYNCS } from "../data";

interface Props {
  onBack: () => void;
}

const TYPE_LABELS: Record<string, string> = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' };

export default function PendingScreen({ onBack }: Props) {
  const [items, setItems] = useState<PendingSync[]>(PENDING_SYNCS);
  const [discardId, setDiscardId] = useState<string | null>(null);

  function retrySync(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'syncing' } : i));
    setTimeout(() => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'synced' } : i));
    }, 2000);
  }

  function discard(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    setDiscardId(null);
  }

  const statusConfig = {
    pending: { label: 'Pendiente', variant: 'warning' as const, icon: 'clock' },
    syncing: { label: 'Sincronizando', variant: 'info' as const, icon: 'refresh' },
    error: { label: 'Error', variant: 'danger' as const, icon: 'warning' },
    synced: { label: 'Sincronizado', variant: 'success' as const, icon: 'check' },
  };

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 px-4 py-4 flex flex-col gap-3">
        <Text className="text-xs text-[#94A3B8]">Solo visualización — sin acceso al servidor</Text>
        {items.length === 0 && (
          <EmptyState icon="check" title="Todo sincronizado" description="No hay movimientos pendientes" />
        )}

        {items.map(item => {
          const cfg = statusConfig[item.status];
          return (
            <View key={item.id} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
              <View className="px-4 py-3">
                <View className="flex-row items-start justify-between gap-2 mb-2">
                  <View>
                    <Text className="text-sm font-semibold text-[#0F172A]">{TYPE_LABELS[item.type]}</Text>
                    <Text className="text-xs font-mono text-[#94A3B8]">{item.id}</Text>
                  </View>
                  <Badge variant={cfg.variant} icon={cfg.icon}>{cfg.label}</Badge>
                </View>
                <View className="flex-row gap-4">
                  <View className="flex-row items-center gap-1">
                    <Icon name="clock" size={12} color="#64748B" />
                    <Text className="text-xs text-[#64748B]">{item.createdAt}</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Icon name="package" size={12} color="#64748B" />
                    <Text className="text-xs text-[#64748B]">{item.itemCount} artículos</Text>
                  </View>
                  {item.reference && (
                    <Text className="text-xs text-[#64748B]">Ref: {item.reference}</Text>
                  )}
                </View>
              </View>

              {item.status !== 'synced' && (
                <View className="px-4 pb-3 flex-row gap-2">
                  {(item.status === 'error' || item.status === 'pending') && (
                    <Pressable
                      onPress={() => retrySync(item.id)}
                      className="flex-1 flex-row items-center justify-center gap-1.5 border border-[#C7D2FE] bg-[#EEF2FF] py-2 rounded-[8px]"
                    >
                      <Icon name="refresh" size={14} color="#4F46E5" />
                      <Text className="text-xs font-medium text-[#4F46E5]">Reintentar</Text>
                    </Pressable>
                  )}
                  {item.status === 'syncing' && (
                    <View className="flex-1 flex-row items-center justify-center gap-2 py-2">
                      <ActivityIndicator size="small" color="#6366F1" />
                      <Text className="text-xs text-[#6366F1]">Sincronizando...</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => setDiscardId(item.id)}
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
        onConfirm={() => discardId && discard(discardId)}
        onCancel={() => setDiscardId(null)}
      />
    </View>
  );
}
