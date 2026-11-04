import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Icon, Badge, Button } from "../components/ui";
import type { Warehouse } from "../types";
import { fetchWarehouses } from "../services/warehouses";
import { ApiError } from "../services/api";

interface Props {
  token: string;
  lastWarehouseId?: string;
  onSelect: (w: Warehouse) => void;
}

export default function WarehouseSelectScreen({ token, lastWarehouseId, onSelect }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setWarehouses(await fetchWarehouses(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los almacenes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="bg-[#0F172A] px-5 pt-6 pb-6">
        <Text className="text-white text-lg font-semibold">Seleccionar almacén</Text>
        <Text className="text-[#94A3B8] text-sm mt-1">Elige el almacén donde trabajarás</Text>
      </View>

      <View className="flex-1 px-4 py-5 flex flex-col gap-3">
        {loading && (
          <View className="items-center py-12">
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text className="text-sm text-[#64748B] mt-3">Cargando almacenes...</Text>
          </View>
        )}

        {!loading && !!error && (
          <View className="items-center py-12 px-4 gap-3">
            <Icon name="wifi_off" size={28} color="#DC2626" />
            <Text className="text-sm text-[#7F1D1D] text-center">{error}</Text>
            <Button variant="secondary" onClick={load}>Reintentar</Button>
          </View>
        )}

        {!loading && !error && warehouses?.map(w => {
          const isLast = w.id === lastWarehouseId;
          return (
            <Pressable
              key={w.id}
              onPress={() => onSelect(w)}
              className={`w-full bg-white rounded-2xl border-2 shadow-sm shadow-slate-900/5 p-4 active:scale-[0.98]
                ${isLast ? 'border-[#4F46E5]' : 'border-[#E2E8F0]'}`}
            >
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-0.5">
                    <Text className="text-base font-semibold text-[#0F172A]">{w.name}</Text>
                    {isLast && (
                      <Text className="text-[10px] font-medium bg-[#EEF2FF] text-[#4F46E5] px-1.5 py-0.5 rounded-full">
                        Último usado
                      </Text>
                    )}
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Icon name="location" size={13} color="#64748B" />
                    <Text className="text-sm text-[#64748B]">{w.city}</Text>
                  </View>
                </View>
                <View className="items-end gap-2">
                  <Badge variant={w.state === 'active' ? 'success' : 'danger'}>
                    {w.state === 'active' ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Icon name="chevron_right" size={18} color="#94A3B8" />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
