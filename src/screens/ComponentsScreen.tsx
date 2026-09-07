import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Button, Input, Badge, Card, Icon, QuantityStepper, Skeleton, EmptyState, LocationPill, Toast } from "../components/ui";

interface Props { onBack: () => void; }

export default function ComponentsScreen({ onBack }: Props) {
  const [qty, setQty] = useState(3);
  const [inputVal, setInputVal] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<'success' | 'warning' | 'error' | 'info'>('success');

  function triggerToast(type: 'success' | 'warning' | 'error' | 'info') {
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 px-4 py-4 flex flex-col gap-6">

        {/* Buttons */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Botones</Text>
          <View className="flex flex-col gap-2">
            {(['primary', 'secondary', 'ghost', 'success', 'warning', 'danger'] as const).map(v => (
              <Button key={v} variant={v} fullWidth>{v.charAt(0).toUpperCase() + v.slice(1)}</Button>
            ))}
            <Button variant="primary" fullWidth loading>Cargando...</Button>
            <Button variant="primary" fullWidth disabled>Deshabilitado</Button>
            <View className="flex-row gap-2">
              <Button variant="primary" size="sm">Pequeño</Button>
              <Button variant="primary" size="md">Mediano</Button>
              <Button variant="primary" size="lg">Grande</Button>
            </View>
            <Button variant="primary" fullWidth icon="scan">Con ícono izquierdo</Button>
            <Button variant="secondary" fullWidth iconRight="chevron_right">Con ícono derecho</Button>
          </View>
        </View>

        {/* Badges */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Badges / Chips de estado</Text>
          <View className="flex-row flex-wrap gap-2">
            <Badge variant="success">Confirmado</Badge>
            <Badge variant="warning" icon="warning">Stock bajo</Badge>
            <Badge variant="danger">Error</Badge>
            <Badge variant="info">Sincronizando</Badge>
            <Badge variant="muted">Borrador</Badge>
            <Badge variant="primary">Administrador</Badge>
          </View>
        </View>

        {/* Inputs */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Campos de texto</Text>
          <View className="flex flex-col gap-3">
            <Input label="Normal" placeholder="Escribe aquí..." value={inputVal} onChange={setInputVal} />
            <Input label="Con ícono" placeholder="Buscar..." value="" onChange={() => {}} icon="search" />
            <Input label="Con error" placeholder="Campo requerido" value="x" onChange={() => {}} error="Este campo es obligatorio" />
            <Input label="Con ayuda" placeholder="Opcional" value="" onChange={() => {}} hint="Este campo es opcional" />
          </View>
        </View>

        {/* Location */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Ubicación compacta</Text>
          <View className="flex-row flex-wrap gap-2">
            <LocationPill zone="Zona A" aisle="Pasillo 03" rack="Rack 02" position="Posición 04" />
            <LocationPill zone="Zona B" aisle="Pasillo 01" rack="Rack 01" position="Posición 02" />
          </View>
        </View>

        {/* Quantity stepper */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Control de cantidad</Text>
          <QuantityStepper value={qty} onChange={setQty} />
        </View>

        {/* Toasts */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Notificaciones (Toast)</Text>
          <View className="flex-row flex-wrap gap-2">
            {(['success', 'warning', 'error', 'info'] as const).map(t => (
              <Pressable
                key={t}
                onPress={() => triggerToast(t)}
                className="px-3 py-2 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5"
              >
                <Text className="text-xs font-medium">{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Skeletons */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Estado de carga (Skeleton)</Text>
          <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-4 flex flex-col gap-3">
            <View className="flex-row items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-[8px]" />
              <View className="flex-1 flex flex-col gap-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </View>
            </View>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </View>
        </View>

        {/* Empty state */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Estado vacío</Text>
          <Card>
            <EmptyState
              icon="package"
              title="Sin artículos"
              description="Escanea o agrega un producto para comenzar"
            />
          </Card>
        </View>

        {/* Scan state rows */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Estados de escaneo</Text>
          <View className="flex flex-col gap-2">
            {[
              { state: 'idle', label: 'Esperando código...', color: '#64748B', bg: 'bg-[#F1F5F9]', icon: 'scan' },
              { state: 'receiving', label: 'Recibiendo código...', color: '#6366F1', bg: 'bg-[#E0E7FF]', icon: 'scan' },
              { state: 'processing', label: 'Procesando...', color: '#B45309', bg: 'bg-[#FEF3C7]', icon: 'refresh' },
              { state: 'added', label: 'Artículo agregado ✓', color: '#059669', bg: 'bg-[#D1FAE5]', icon: 'check' },
              { state: 'duplicate', label: 'Lectura duplicada — no se agregó', color: '#B45309', bg: 'bg-[#FEF3C7]', icon: 'warning' },
              { state: 'invalid_format', label: 'Formato no reconocido', color: '#DC2626', bg: 'bg-[#FEE2E2]', icon: 'x' },
              { state: 'not_found', label: 'Producto no encontrado', color: '#DC2626', bg: 'bg-[#FEE2E2]', icon: 'x' },
            ].map(s => (
              <View key={s.state} className={`flex-row items-center gap-2 px-3 py-2.5 rounded-[8px] ${s.bg}`}>
                <Icon name={s.icon} size={15} color={s.color} />
                <Text className="text-xs font-medium" style={{ color: s.color }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="h-4" />
      </View>

      <Toast
        message={`Notificación de tipo ${toastType}`}
        type={toastType}
        visible={showToast}
      />
    </View>
  );
}
