import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Button, Icon, Toast } from "../components/ui";
import type { MoveType, MovementItem, ScanState, ModuleInfo } from "../types";
import { parseQR } from "../data";
import { findProductByCode } from "../services/products";
import { isModuleEnabled } from "../services/modules";

interface Props {
  token: string;
  moveType: MoveType;
  items: MovementItem[];
  modules: ModuleInfo[];
  onAddItem: (item: MovementItem) => void;
  onReview: () => void;
  onUseCamera: () => void;
  onManual: () => void;
}

type LastRead = { product: string; sku: string; lot?: string; serial?: string; qty: number; state: ScanState };

export default function ScanHandheldScreen({ token, moveType, items, modules, onAddItem, onReview, onUseCamera, onManual }: Props) {
  const cameraEnabled = isModuleEnabled(modules, 'camera_scan');
  const [code, setCode] = useState('');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [lastRead, setLastRead] = useState<LastRead | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'warning' });
  const [lastRawCodes] = useState<Set<string>>(new Set());
  const inputRef = useRef<TextInput>(null);
  const processingRef = useRef(false);

  const totalUnits = items.reduce((s, i) => s + (i.product.serialized ? i.serials.length : i.quantity), 0);
  const distinctProducts = new Set(items.map(i => i.product.id)).size;

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2200);
  }, []);

  const processCode = useCallback(async (raw: string) => {
    if (processingRef.current || !raw.trim()) return;
    processingRef.current = true;
    setScanState('processing');

    const { valid, data, error } = parseQR(raw.trim());

    if (!valid || !data) {
      setScanState('invalid_format');
      setLastRead({ product: 'Código no reconocido', sku: raw.slice(0, 20), qty: 0, state: 'invalid_format' });
      showToast(error ?? 'Formato no reconocido', 'error');
      processingRef.current = false;
      return;
    }

    let product;
    try {
      product = await findProductByCode(token, data.sku ?? data.productId ?? '');
    } catch {
      setScanState('not_found');
      setLastRead({ product: 'No se pudo consultar el producto', sku: data.sku ?? '', qty: 0, state: 'not_found' });
      showToast('Sin conexión con el servidor', 'error');
      processingRef.current = false;
      return;
    }

    if (!product) {
      setScanState('not_found');
      setLastRead({ product: 'Producto no encontrado', sku: data.sku ?? '', qty: 0, state: 'not_found' });
      showToast('Producto no encontrado en el sistema', 'error');
      processingRef.current = false;
      return;
    }

    // Serialized duplicate check
    if (product.serialized && data.serial) {
      const existingItem = items.find(i => i.product.id === product.id);
      if (existingItem?.serials.includes(data.serial)) {
        setScanState('duplicate');
        setLastRead({ product: product.name, sku: product.sku, serial: data.serial, qty: 0, state: 'duplicate' });
        showToast(`Serie ${data.serial} ya fue registrada`, 'warning');
        processingRef.current = false;
        return;
      }
    }

    // Check duplicate raw scan
    if (lastRawCodes.has(raw.trim())) {
      setScanState('duplicate');
      setLastRead({ product: product.name, sku: product.sku, qty: 0, state: 'duplicate' });
      showToast('Lectura duplicada detectada', 'warning');
      processingRef.current = false;
      return;
    }

    lastRawCodes.add(raw.trim());

    const newItem: MovementItem = {
      id: `item_${Date.now()}`,
      product,
      lot: data.lot,
      serials: data.serial ? [data.serial] : [],
      quantity: 1,
      scannedAt: new Date(),
    };

    onAddItem(newItem);
    setScanState('added');
    setLastRead({
      product: product.name,
      sku: product.sku,
      lot: data.lot,
      serial: data.serial,
      qty: 1,
      state: 'added',
    });
    showToast(`${product.name} agregado`, 'success');
    processingRef.current = false;
    inputRef.current?.focus();
  }, [items, onAddItem, showToast, lastRawCodes, token]);

  function handleChangeText(text: string) {
    setCode(text);
    setScanState(text ? 'receiving' : 'idle');
  }

  function handleSubmitEditing() {
    processCode(code);
    setCode('');
  }

  // Auto-process if the code looks complete (has pipe delimiters) after brief pause
  useEffect(() => {
    if (!code.includes('|')) return;
    const parts = code.split('|');
    if (parts.length >= 3 && code.startsWith('WMSPYME')) {
      const t = setTimeout(() => {
        processCode(code);
        setCode('');
      }, 120);
      return () => clearTimeout(t);
    }
  }, [code, processCode]);

  const stateColors: Record<ScanState, string> = {
    idle: 'bg-[#F1F5F9] border-[#CBD5E1]',
    receiving: 'bg-[#E0E7FF] border-[#6366F1]',
    processing: 'bg-[#FEF3C7] border-[#B45309]',
    added: 'bg-[#D1FAE5] border-[#059669]',
    duplicate: 'bg-[#FEF3C7] border-[#B45309]',
    invalid_format: 'bg-[#FEE2E2] border-[#DC2626]',
    not_found: 'bg-[#FEE2E2] border-[#DC2626]',
  };

  const moveLabel = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' }[moveType];

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* Header */}
      <View className="bg-white px-4 py-3 border-b border-[#E2E8F0]">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs text-[#64748B]">{moveLabel}</Text>
            <Text className="text-base font-semibold text-[#0F172A]">Escanear con lector</Text>
          </View>
          <View className="items-end">
            <Text className="text-xs text-[#64748B]">Unidades totales</Text>
            <Text className="text-2xl font-bold text-[#4F46E5]">{totalUnits}</Text>
          </View>
        </View>
        <Text className="text-xs text-[#94A3B8] mt-0.5">{distinctProducts} producto(s) distintos</Text>
      </View>

      <View className="flex-1 flex flex-col">
        {/* Scan field */}
        <View className={`mx-4 mt-4 border-2 rounded-[14px] p-4 ${stateColors[scanState]}`}>
          <Text className="text-sm font-semibold text-[#475569] mb-2">
            Escanea el código
          </Text>
          <TextInput
            ref={inputRef}
            autoFocus
            value={code}
            onChangeText={handleChangeText}
            onSubmitEditing={handleSubmitEditing}
            placeholder="El lector escribirá aquí automáticamente..."
            placeholderTextColor="#94A3B8"
            className="w-full bg-white border border-[#CBD5E1] rounded-[10px] px-4 py-3 text-sm font-mono text-[#0F172A]"
          />
          <Text className="text-xs text-[#94A3B8] mt-2">También puedes pegar el código completo</Text>
          <Button
            fullWidth
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => { processCode(code); setCode(''); }}
            disabled={!code.trim()}
          >
            Procesar código
          </Button>

          {/* State indicator */}
          <View className="mt-3 flex-row items-center gap-2">
            {scanState === 'added' && <Icon name="check" size={16} color="#059669" />}
            {(scanState === 'invalid_format' || scanState === 'not_found') && <Icon name="x" size={16} color="#DC2626" />}
            {scanState === 'duplicate' && <Icon name="warning" size={16} color="#B45309" />}
            {scanState === 'processing' && <ActivityIndicator size="small" color="#B45309" />}
            <Text className={`text-xs font-medium ${
              scanState === 'added' ? 'text-[#059669]' :
              scanState === 'duplicate' ? 'text-[#B45309]' :
              (scanState === 'invalid_format' || scanState === 'not_found') ? 'text-[#DC2626]' :
              'text-[#64748B]'
            }`}>
              {scanState === 'idle' && 'Esperando código...'}
              {scanState === 'receiving' && 'Recibiendo código...'}
              {scanState === 'processing' && 'Procesando...'}
              {scanState === 'added' && 'Artículo agregado ✓'}
              {scanState === 'duplicate' && 'Lectura duplicada — no se agregó'}
              {scanState === 'invalid_format' && 'Formato no reconocido'}
              {scanState === 'not_found' && 'Producto no encontrado'}
            </Text>
          </View>
        </View>

        {/* Last read */}
        {lastRead && (
          <View className="mx-4 mt-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-2">Última lectura</Text>
            <View className="flex-row items-start gap-3">
              <View className={`w-8 h-8 rounded-[6px] items-center justify-center
                ${lastRead.state === 'added' ? 'bg-[#D1FAE5]' : 'bg-[#FEE2E2]'}`}>
                <Icon name={lastRead.state === 'added' ? 'check' : 'x'} size={14} color={lastRead.state === 'added' ? '#059669' : '#DC2626'} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-[#0F172A]" numberOfLines={1}>{lastRead.product}</Text>
                <Text className="text-xs font-mono text-[#64748B]">SKU: {lastRead.sku}</Text>
                {lastRead.lot && <Text className="text-xs text-[#64748B]">Lote: {lastRead.lot}</Text>}
                {lastRead.serial && <Text className="text-xs text-[#64748B]">Serie: {lastRead.serial}</Text>}
              </View>
              {lastRead.state === 'added' && (
                <Text className="text-sm font-bold text-[#059669]">+1</Text>
              )}
            </View>
          </View>
        )}

        {/* Recent scans list */}
        {items.length > 0 && (
          <View className="mx-4 mt-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-2">
              Artículos en este movimiento ({items.length})
            </Text>
            <View className="flex flex-col gap-1.5">
              {[...items].reverse().slice(0, 5).map(item => (
                <View key={item.id} className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 px-3 py-2.5 flex-row items-center gap-3">
                  <View className="w-6 h-6 bg-[#D1FAE5] rounded-full items-center justify-center">
                    <Icon name="check" size={12} color="#059669" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-xs font-medium text-[#0F172A]" numberOfLines={1}>{item.product.name}</Text>
                    <Text className="text-[10px] font-mono text-[#94A3B8]">{item.product.sku}{item.lot ? ` · L:${item.lot}` : ''}</Text>
                  </View>
                  <Text className="text-xs font-semibold text-[#475569]">
                    ×{item.product.serialized ? item.serials.length : item.quantity}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Error actions */}
        {(scanState === 'invalid_format' || scanState === 'not_found') && (
          <View className="mx-4 mt-3 bg-[#FEF3C7] border border-[#FDE68A] rounded-[12px] p-4">
            <Text className="text-sm font-semibold text-[#78350F] mb-1">¿Qué deseas hacer?</Text>
            <Text className="text-xs text-[#92400E] mb-3">
              {scanState === 'invalid_format'
                ? 'El código no tiene el formato esperado de WMS PyME.'
                : 'El producto no está registrado en el sistema.'}
            </Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => { setScanState('idle'); setCode(''); inputRef.current?.focus(); }}
                className="flex-1 bg-white border border-[#FDE68A] px-3 py-2 rounded-[8px]"
              >
                <Text className="text-xs font-medium text-[#78350F] text-center">Reintentar</Text>
              </Pressable>
              <Pressable
                onPress={onManual}
                className="flex-1 bg-[#4F46E5] px-3 py-2 rounded-[8px]"
              >
                <Text className="text-xs font-medium text-white text-center">Captura manual</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View className="h-4" />
      </View>

      {/* Bottom actions */}
      <View className="bg-white border-t border-[#E2E8F0] px-4 py-3">
        <View className="flex-row gap-2 mb-2">
          <Pressable
            onPress={onUseCamera}
            disabled={!cameraEnabled}
            className={`flex-1 flex-row items-center justify-center gap-1.5 border border-[#CBD5E1] py-2.5 rounded-[10px] active:bg-[#F1F5F9] ${!cameraEnabled ? 'opacity-40' : ''}`}
          >
            <Icon name="camera" size={16} color="#475569" />
            <Text className="text-[#475569] text-xs font-medium">{cameraEnabled ? 'Usar cámara' : 'Cámara no disponible'}</Text>
          </Pressable>
          <Pressable
            onPress={onManual}
            className="flex-1 flex-row items-center justify-center gap-1.5 border border-[#CBD5E1] py-2.5 rounded-[10px] active:bg-[#F1F5F9]"
          >
            <Icon name="edit" size={16} color="#475569" />
            <Text className="text-[#475569] text-xs font-medium">Captura manual</Text>
          </Pressable>
        </View>
        <Button
          fullWidth
          onClick={onReview}
          disabled={items.length === 0}
          icon="chevron_right"
        >
          Revisar movimiento ({totalUnits} ud.)
        </Button>
      </View>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </View>
  );
}
