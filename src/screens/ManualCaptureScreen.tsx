import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Button, Input, Icon, QuantityStepper } from "../components/ui";
import type { MovementItem, Product } from "../types";
import { fetchProductsWithStock } from "../services/products";
import { ApiError } from "../services/api";

interface Props {
  token: string;
  onAdd: (item: MovementItem) => void;
  onBack: () => void;
}

export default function ManualCaptureScreen({ token, onAdd, onBack }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [lot, setLot] = useState('');
  const [serial, setSerial] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.length < 2 || selected) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    setSearchError('');
    const t = setTimeout(() => {
      fetchProductsWithStock(token, query)
        .then(products => { if (!cancelled) setResults(products); })
        .catch(err => { if (!cancelled) setSearchError(err instanceof ApiError ? err.message : 'No se pudo buscar productos.'); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, selected, token]);

  function handleAdd() {
    if (!selected) return;
    if (selected.lotTracked && !lot) { setError('Este producto requiere número de lote.'); return; }
    if (selected.serialized && !serial) { setError('Este producto requiere número de serie.'); return; }
    if (quantity < 1) { setError('La cantidad debe ser mayor a cero.'); return; }
    setError('');
    onAdd({
      id: `item_${Date.now()}`,
      product: selected,
      lot: lot || undefined,
      serials: serial ? [serial] : [],
      quantity: selected.serialized ? 1 : quantity,
      scannedAt: new Date(),
    });
    onBack();
  }

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 px-4 py-4 flex flex-col gap-4">
        {/* Info banner */}
        <View className="flex-row items-start gap-3 bg-[#FEF3C7] border border-[#FDE68A] rounded-[10px] px-3 py-3">
          <Icon name="info" size={16} color="#B45309" />
          <Text className="text-xs text-[#78350F] flex-1">
            La captura manual es un método de respaldo. Para mayor velocidad y precisión, utiliza el escáner o la cámara siempre que sea posible.
          </Text>
        </View>

        {/* Search */}
        <Input
          label="Buscar producto"
          placeholder="Nombre, SKU o código..."
          value={query}
          onChange={v => { setQuery(v); if (selected) setSelected(null); }}
          icon="search"
        />

        {searching && (
          <View className="items-center py-4">
            <ActivityIndicator size="small" color="#4F46E5" />
          </View>
        )}

        {searchError && (
          <View className="flex-row items-center gap-2 bg-[#FEE2E2] px-4 py-3 rounded-[10px]">
            <Icon name="warning" size={16} color="#7F1D1D" />
            <Text className="text-[#7F1D1D] text-sm flex-1">{searchError}</Text>
          </View>
        )}

        {/* Search results */}
        {!searching && results.length > 0 && !selected && (
          <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
            {results.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => { setSelected(p); setQuery(p.name); setLot(''); setSerial(''); setQuantity(1); }}
                className={`w-full px-4 py-3 flex-row items-center gap-3 active:bg-[#F1F5F9]
                  ${i > 0 ? 'border-t border-[#F1F5F9]' : ''}`}
              >
                <View className="w-9 h-9 bg-[#EEF2FF] rounded-[8px] items-center justify-center">
                  <Icon name="package" size={18} color="#4F46E5" />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-sm font-medium text-[#0F172A]" numberOfLines={1}>{p.name}</Text>
                  <Text className="text-xs font-mono text-[#64748B]">{p.sku}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-[#475569] font-semibold">{p.stock} ud.</Text>
                  {p.lowStock && <Text className="text-[10px] text-[#B45309]">Stock bajo</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {!searching && query.length >= 2 && results.length === 0 && !selected && !searchError && (
          <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 px-4 py-6 items-center">
            <Text className="text-sm text-[#94A3B8]">No se encontraron productos para "{query}"</Text>
          </View>
        )}

        {/* Product detail form */}
        {selected && (
          <>
            <View className="bg-[#EEF2FF] border border-[#C7D2FE] rounded-[12px] px-4 py-3 flex-row items-center gap-3">
              <View className="w-10 h-10 bg-[#4F46E5] rounded-[8px] items-center justify-center">
                <Icon name="package" size={18} color="#FFFFFF" />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-semibold text-[#4F46E5]" numberOfLines={1}>{selected.name}</Text>
                <Text className="text-xs font-mono text-[#6366F1]">{selected.sku}</Text>
              </View>
              <Pressable onPress={() => { setSelected(null); setQuery(''); }}>
                <Icon name="x" size={16} color="#64748B" />
              </Pressable>
            </View>

            {selected.lotTracked && (
              <Input
                label="Número de lote"
                placeholder="Ej. L2408"
                value={lot}
                onChange={setLot}
                error={error.includes('lote') ? error : undefined}
              />
            )}

            {selected.serialized ? (
              <Input
                label="Número de serie"
                placeholder="Ej. MX000184"
                value={serial}
                onChange={setSerial}
                hint="Cada código representa una unidad"
                error={error.includes('serie') ? error : undefined}
              />
            ) : (
              <View>
                <Text className="text-sm font-medium text-[#475569] mb-2">Cantidad</Text>
                <QuantityStepper value={quantity} onChange={setQuantity} />
              </View>
            )}

            {!!error && !error.includes('lote') && !error.includes('serie') && (
              <View className="flex-row items-center gap-2 bg-[#FEE2E2] px-4 py-3 rounded-[10px]">
                <Icon name="warning" size={16} color="#7F1D1D" />
                <Text className="text-[#7F1D1D] text-sm">{error}</Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* CTA */}
      <View className="bg-white border-t border-[#E2E8F0] px-4 py-3">
        <Button fullWidth onClick={handleAdd} disabled={!selected} icon="plus">
          Agregar al movimiento
        </Button>
      </View>
    </View>
  );
}
