import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Icon, Badge, LocationPill, Button } from "../components/ui";
import { fetchProductDetail, type ProductDetail } from "../services/products";
import { ApiError } from "../services/api";

interface Props {
  token: string;
  productId: string;
  onBack: () => void;
}

const TYPE_ICON: Record<string, string> = { inbound: 'entry', outbound: 'exit', transfer: 'transfer' };
const TYPE_BG: Record<string, string> = { inbound: 'bg-[#E0E7FF]', outbound: 'bg-[#D1FAE5]', transfer: 'bg-[#FEF3C7]' };
const TYPE_COLOR: Record<string, string> = { inbound: '#4F46E5', outbound: '#059669', transfer: '#B45309' };

export default function InventoryDetailScreen({ token, productId, onBack }: Props) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    setError('');
    fetchProductDetail(token, productId)
      .then(setDetail)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el producto.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token, productId]);

  if (loading || !detail) {
    return (
      <View className="flex-1 bg-[#F8FAFC]">
        <View className="flex-1 items-center justify-center gap-3 px-6">
          {loading && <ActivityIndicator size="small" color="#4F46E5" />}
          {error && (
            <>
              <Icon name="wifi_off" size={28} color="#DC2626" />
              <Text className="text-sm text-[#7F1D1D] text-center">{error}</Text>
              <Button variant="secondary" onClick={load}>Reintentar</Button>
            </>
          )}
        </View>
      </View>
    );
  }

  const { product, locationStocks, recentMovements } = detail;

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* Product summary bar */}
      <View className="bg-white border-b border-[#E2E8F0] px-4 py-3 flex-row items-center gap-3">
        <View className="flex-1 min-w-0">
          <Text className="text-base font-semibold text-[#0F172A]" numberOfLines={1}>{product.name}</Text>
          <Text className="text-xs font-mono text-[#94A3B8]">{product.sku}</Text>
        </View>
        <View className="items-end">
          <Text className={`text-xl font-bold ${product.lowStock ? 'text-[#B45309]' : 'text-[#4F46E5]'}`}>
            {product.stock}
          </Text>
          <Text className="text-[10px] text-[#94A3B8]">total</Text>
        </View>
      </View>

      <View className="flex-1 px-4 py-4 flex flex-col gap-4">
        {/* Attributes */}
        <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-4">
          <View className="flex-row flex-wrap gap-2 mb-3">
            {product.serialized && <Badge variant="info">Serializado</Badge>}
            {product.lotTracked && <Badge variant="muted">Por lote</Badge>}
            {product.lowStock && <Badge variant="warning" icon="warning">Stock bajo</Badge>}
          </View>
          <View className="flex-row flex-wrap gap-3">
            <View className="flex-1">
              <Text className="text-xs text-[#94A3B8]">SKU</Text>
              <Text className="text-sm font-mono font-semibold text-[#475569]">{product.sku}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-xs text-[#94A3B8]">Existencia total</Text>
              <Text className="text-sm font-semibold text-[#475569]">{product.stock} unidades</Text>
            </View>
          </View>
        </View>

        {/* Locations */}
        <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
          <View className="px-4 py-3 border-b border-[#F1F5F9]">
            <Text className="text-sm font-semibold text-[#475569]">Existencias por ubicación</Text>
          </View>
          {locationStocks.length === 0 && (
            <Text className="text-sm text-[#94A3B8] px-4 py-4">Sin existencias registradas.</Text>
          )}
          {locationStocks.map((ls, i) => (
            <View key={i} className={`px-4 py-3 flex-row items-center gap-3 ${i > 0 ? 'border-t border-[#F1F5F9]' : ''}`}>
              <Icon name="location" size={16} color="#94A3B8" />
              <View className="flex-1">
                <LocationPill zone={ls.location.zone} aisle={ls.location.aisle} rack={ls.location.rack} position={ls.location.position} />
              </View>
              <Text className="text-sm font-bold text-[#475569]">{ls.quantity}</Text>
            </View>
          ))}
        </View>

        {/* Movement history */}
        <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
          <View className="px-4 py-3 border-b border-[#F1F5F9]">
            <Text className="text-sm font-semibold text-[#475569]">Últimos movimientos</Text>
          </View>
          {recentMovements.length === 0 && (
            <Text className="text-sm text-[#94A3B8] px-4 py-4">Sin movimientos registrados.</Text>
          )}
          {recentMovements.map((h, i) => (
            <View key={i} className={`px-4 py-3 flex-row items-center gap-3 ${i > 0 ? 'border-t border-[#F1F5F9]' : ''}`}>
              <View className={`w-8 h-8 rounded-full items-center justify-center ${TYPE_BG[h.type]}`}>
                <Icon name={TYPE_ICON[h.type]} size={14} color={TYPE_COLOR[h.type]} />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-mono text-[#475569]">{h.folio ?? '—'}</Text>
                <Text className="text-xs text-[#94A3B8]">
                  {new Date(h.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  {h.serial ? ` · Serie ${h.serial}` : ''}
                </Text>
              </View>
              <Text className={`text-sm font-semibold ${h.type === 'outbound' ? 'text-[#059669]' : 'text-[#4F46E5]'}`}>
                {h.type === 'outbound' ? '-' : '+'}{h.quantity}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
