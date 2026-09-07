import React, { useState, useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Button, Icon, Badge } from "../components/ui";
import type { MoveType, MovementItem, ConnectionStatus } from "../types";

interface Props {
  moveType: MoveType;
  items: MovementItem[];
  connection: ConnectionStatus;
  folio?: string;
  onNewMovement: () => void;
  onViewDetail: () => void;
}

export default function MovementResultScreen({ moveType, items, connection, folio: realFolio, onNewMovement, onViewDetail }: Props) {
  // Online: the movement was already confirmed for real before reaching this
  // screen, so it's synced from the start. Offline/pending stays a local
  // simulation — real offline queueing isn't implemented yet (see backend/README.md).
  const [syncState, setSyncState] = useState<'saving' | 'saved' | 'syncing' | 'synced' | 'error'>(
    connection === 'online' ? 'synced' : 'saved'
  );

  const totalUnits = items.reduce((s, i) => s + (i.product.serialized ? i.serials.length : i.quantity), 0);
  const moveLabel = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' }[moveType];
  const now = new Date();
  const folio = realFolio || `${moveType === 'entry' ? 'ENT' : moveType === 'exit' ? 'SAL' : 'TRA'}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 100)).padStart(4, '0')}`;
  const nowLabel = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    if (connection === 'online') return;
    // Simulate sync recovery
    const t1 = setTimeout(() => setSyncState('syncing'), 2500);
    const t2 = setTimeout(() => setSyncState('synced'), 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [connection]);

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 items-center justify-start px-4 py-8 gap-5">
        {/* Success icon */}
        <View className="w-20 h-20 bg-[#D1FAE5] rounded-full items-center justify-center">
          <Icon name="check" size={36} color="#059669" />
        </View>

        <View className="items-center">
          <Text className="text-xl font-bold text-[#0F172A] mb-1">{moveLabel} registrada</Text>
          <Text className="text-sm text-[#64748B]">El movimiento se registró correctamente</Text>
        </View>

        {/* Folio card */}
        <View className="w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs text-[#94A3B8] uppercase tracking-wide">Folio</Text>
            <Badge variant={moveType === 'entry' ? 'info' : moveType === 'exit' ? 'success' : 'warning'}>
              {moveLabel}
            </Badge>
          </View>
          <Text className="text-lg font-bold font-mono text-[#4F46E5] mb-1">{folio}</Text>
          <Text className="text-xs text-[#94A3B8]">{nowLabel} · hoy</Text>

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
          <View>
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
          </View>
        </View>

        {syncState === 'error' && (
          <View className="w-full flex-row gap-2">
            <Button variant="primary" fullWidth onClick={() => setSyncState('syncing')}>
              Reintentar
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setSyncState('saved')}>
              Guardar como pendiente
            </Button>
          </View>
        )}
      </View>

      {/* Bottom actions */}
      <View className="bg-white border-t border-[#E2E8F0] px-4 py-3 flex flex-col gap-2">
        <Button fullWidth size="lg" onClick={onNewMovement} icon="plus">
          Nuevo movimiento
        </Button>
        <Button fullWidth variant="ghost" onClick={onViewDetail}>
          Ver detalle
        </Button>
      </View>
    </View>
  );
}
