import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Input, Icon, Badge, EmptyState, Button } from "../components/ui";
import type { Product, Screen, ModuleInfo } from "../types";
import { fetchProductsWithStock } from "../services/products";
import { ApiError } from "../services/api";
import { isModuleEnabled } from "../services/modules";

interface Props {
  token: string;
  modules: ModuleInfo[];
  onViewDetail: (product: Product) => void;
  onNavigate: (s: Screen) => void;
}

const FILTER_OPTIONS = ['Todos', 'Stock bajo', 'Serializados', 'Por lote'];

export default function InventoryScreen({ token, modules, onViewDetail }: Props) {
  const enabled = isModuleEnabled(modules, 'inventory');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    setError('');
    fetchProductsWithStock(token)
      .then(setProducts)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el inventario.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (enabled) load(); }, [token, enabled]);

  if (!enabled) {
    return (
      <View className="flex-1 bg-[#F8FAFC]">
        <EmptyState
          icon="inventory"
          title="Módulo no habilitado"
          description="Un administrador de tu empresa desactivó la consulta de inventario."
        />
      </View>
    );
  }

  const filtered = (products ?? []).filter(p => {
    const matchQuery = !query ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase());
    const matchFilter =
      filter === 'Todos' ? true :
      filter === 'Stock bajo' ? !!p.lowStock :
      filter === 'Serializados' ? p.serialized :
      filter === 'Por lote' ? p.lotTracked : true;
    return matchQuery && matchFilter;
  });

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* Search + filters */}
      <View className="bg-white border-b border-[#E2E8F0] px-4 pt-4 pb-3">
        <Input
          placeholder="Buscar por nombre, SKU, lote o serie..."
          value={query}
          onChange={setQuery}
          icon="search"
        />
        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
          <View className="flex-row gap-2 pb-0.5">
            {FILTER_OPTIONS.map(f => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full
                  ${filter === f
                    ? 'bg-[#4F46E5]'
                    : 'bg-[#F1F5F9]'}`}
              >
                <Text className={`text-xs font-medium ${filter === f ? 'text-white' : 'text-[#475569]'}`}>
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Scan access buttons */}
      <View className="px-4 py-3 flex-row gap-2 bg-white border-b border-[#E2E8F0]">
        <Pressable className="flex-1 flex-row items-center justify-center gap-1.5 border border-[#CBD5E1] py-2 rounded-[8px]">
          <Icon name="scan" size={14} color="#475569" />
          <Text className="text-[#475569] text-xs font-medium">Lector</Text>
        </Pressable>
        <Pressable className="flex-1 flex-row items-center justify-center gap-1.5 border border-[#CBD5E1] py-2 rounded-[8px]">
          <Icon name="camera" size={14} color="#475569" />
          <Text className="text-[#475569] text-xs font-medium">Cámara</Text>
        </Pressable>
        <Pressable className="flex-1 flex-row items-center justify-center gap-1.5 border border-[#CBD5E1] py-2 rounded-[8px]">
          <Icon name="edit" size={14} color="#475569" />
          <Text className="text-[#475569] text-xs font-medium">Manual</Text>
        </Pressable>
      </View>

      {/* Results */}
      <View className="flex-1">
        {loading && (
          <View className="items-center py-12">
            <ActivityIndicator size="small" color="#4F46E5" />
          </View>
        )}

        {!loading && !!error && (
          <View className="items-center py-12 px-4 gap-3">
            <Icon name="wifi_off" size={28} color="#DC2626" />
            <Text className="text-sm text-[#7F1D1D] text-center">{error}</Text>
            <Button variant="secondary" onClick={load}>Reintentar</Button>
          </View>
        )}

        {!loading && !error && filtered.length === 0 ? (
          <EmptyState
            icon="package"
            title="Sin resultados"
            description="Prueba con otro término de búsqueda o cambia los filtros"
          />
        ) : !loading && !error && (
          <View className="flex flex-col">
            <View className="px-4 py-2 bg-[#F8FAFC]">
              <Text className="text-xs text-[#94A3B8]">{filtered.length} producto(s) encontrado(s)</Text>
            </View>
            {filtered.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => onViewDetail(p)}
                className={`w-full bg-white px-4 py-3.5 flex-row items-center gap-3 active:bg-[#F8FAFC]
                  ${i > 0 ? 'border-t border-[#F1F5F9]' : ''}`}
              >
                <View className="w-10 h-10 bg-[#EEF2FF] rounded-[8px] items-center justify-center">
                  <Icon name="package" size={18} color="#4F46E5" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-sm font-medium text-[#0F172A]" numberOfLines={1}>{p.name}</Text>
                  <Text className="text-xs font-mono text-[#94A3B8]">{p.sku}</Text>
                  <View className="flex-row items-center gap-1.5 mt-1 flex-wrap">
                    {p.serialized && <Badge variant="muted">Serializado</Badge>}
                    {p.lotTracked && <Badge variant="muted">Por lote</Badge>}
                  </View>
                </View>
                <View className="items-end">
                  <Text className={`text-base font-bold ${p.lowStock ? 'text-[#B45309]' : 'text-[#475569]'}`}>
                    {p.stock}
                  </Text>
                  <Text className="text-[10px] text-[#94A3B8]">en stock</Text>
                  {p.lowStock && (
                    <Text className="text-[10px] text-[#B45309] font-semibold">⚠ Bajo</Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
