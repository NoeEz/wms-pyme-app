import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Icon, Badge, Button, EmptyState } from "../components/ui";
import { fetchMovements } from "../services/movements";
import { ApiError } from "../services/api";
import { isModuleEnabled } from "../services/modules";
import type { MovementSummary, ModuleInfo } from "../types";

interface Props {
  token: string;
  modules: ModuleInfo[];
  onBack: () => void;
}

const TYPE_ICONS: Record<string, string> = { entry: 'entry', exit: 'exit', transfer: 'transfer' };
const TYPE_LABELS: Record<string, string> = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' };
const TYPE_BG: Record<string, { bg: string; color: string }> = {
  entry: { bg: 'bg-[#E0E7FF]', color: '#4F46E5' },
  exit: { bg: 'bg-[#D1FAE5]', color: '#059669' },
  transfer: { bg: 'bg-[#FEF3C7]', color: '#B45309' },
};

function statusBadge(status: MovementSummary['status']) {
  if (status === 'completed') return { variant: 'success' as const, label: 'OK' };
  if (status === 'failed') return { variant: 'danger' as const, label: 'Error' };
  return { variant: 'warning' as const, label: 'Pendiente' };
}

function formatLoc(loc?: MovementSummary['origin']) {
  if (!loc) return '—';
  return `${loc.zone} / ${loc.aisle} / ${loc.rack} / ${loc.position}`;
}

export default function HistoryScreen({ token, modules, onBack }: Props) {
  const enabled = isModuleEnabled(modules, 'history');
  const [movements, setMovements] = useState<MovementSummary[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MovementSummary | null>(null);

  function load() {
    setLoading(true);
    setError('');
    fetchMovements(token)
      .then(setMovements)
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (enabled) load(); }, [token, enabled]);

  if (!enabled) {
    return (
      <View className="flex-1 bg-[#F8FAFC]">
        <EmptyState
          icon="clock"
          title="Módulo no habilitado"
          description="Un administrador de tu empresa desactivó el historial y trazabilidad."
        />
      </View>
    );
  }

  if (selected) {
    const badge = statusBadge(selected.status);
    const done = selected.status === 'completed';
    return (
      <View className="flex-1 bg-[#F8FAFC]">
        <View className="bg-white border-b border-[#E2E8F0] px-4 py-3 flex-row items-center gap-3">
          <Pressable onPress={() => setSelected(null)}>
            <Icon name="chevron_left" size={22} color="#475569" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-xs text-[#94A3B8]">{TYPE_LABELS[selected.type]}</Text>
            <Text className="text-sm font-bold font-mono text-[#0F172A]">{selected.folio ?? selected.id}</Text>
          </View>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </View>
        <View className="flex-1 px-4 py-4 flex flex-col gap-4">
          <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-4 flex flex-col gap-2">
            {[
              ['Tipo', TYPE_LABELS[selected.type]],
              ['Fecha', selected.date],
              ['Usuario', selected.user],
              ['Origen', formatLoc(selected.origin)],
              ['Destino', formatLoc(selected.destination)],
              ['Referencia', selected.reference ?? '—'],
              ['Artículos', String(selected.itemCount)],
            ].map(([label, value]) => (
              <View key={label} className="flex-row justify-between gap-2">
                <Text className="text-sm text-[#94A3B8]">{label}</Text>
                <Text className="text-sm text-[#475569] text-right">{value}</Text>
              </View>
            ))}
          </View>

          {/* Traceability — simulated timeline, per BRIEF_IA_MVP_WMS_PYME.md */}
          <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
            <View className="px-4 py-3 border-b border-[#F1F5F9]">
              <Text className="text-sm font-semibold text-[#475569]">Línea de trazabilidad</Text>
            </View>
            {[
              { label: 'Movimiento creado', time: selected.date, done: true },
              { label: 'Artículos escaneados', time: selected.date, done: true },
              { label: 'Revisión completada', time: selected.date, done: true },
              { label: 'Inventario actualizado', time: done ? selected.date : '—', done },
              { label: 'Sincronizado con servidor', time: done ? selected.date : 'Pendiente', done },
            ].map((step, i) => (
              <View key={i} className={`px-4 py-3 flex-row items-center gap-3 ${i > 0 ? 'border-t border-[#F1F5F9]' : ''}`}>
                <View className={`w-8 h-8 rounded-full items-center justify-center ${step.done ? 'bg-[#D1FAE5]' : 'bg-[#F1F5F9]'}`}>
                  <Icon name={step.done ? 'check' : 'clock'} size={14} color={step.done ? "#059669" : "#94A3B8"} />
                </View>
                <View className="flex-1">
                  <Text className={`text-xs font-medium ${step.done ? 'text-[#0F172A]' : 'text-[#94A3B8]'}`}>{step.label}</Text>
                  <Text className="text-[10px] text-[#94A3B8]">{step.time}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {loading && (
        <View className="items-center py-12">
          <ActivityIndicator size="small" color="#4F46E5" />
        </View>
      )}

      {!loading && error && (
        <View className="items-center py-12 px-4 gap-3">
          <Icon name="wifi_off" size={28} color="#DC2626" />
          <Text className="text-sm text-[#7F1D1D] text-center">{error}</Text>
          <Button variant="secondary" onClick={load}>Reintentar</Button>
        </View>
      )}

      {!loading && !error && movements?.length === 0 && (
        <EmptyState icon="clock" title="Sin movimientos" description="Todavía no se ha registrado ningún movimiento." />
      )}

      {!loading && !error && (
        <View className="flex-1">
          {movements?.map((h, i) => (
            <Pressable
              key={h.id}
              onPress={() => setSelected(h)}
              className={`w-full bg-white px-4 py-3.5 flex-row items-center gap-3 active:bg-[#F8FAFC]
                ${i > 0 ? 'border-t border-[#F1F5F9]' : ''}`}
            >
              <View className={`w-10 h-10 rounded-[8px] items-center justify-center ${TYPE_BG[h.type].bg}`}>
                <Icon name={TYPE_ICONS[h.type]} size={18} color={TYPE_BG[h.type].color} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-medium text-[#0F172A]">{TYPE_LABELS[h.type]}</Text>
                <Text className="text-xs font-mono text-[#94A3B8]">{h.folio ?? h.id}</Text>
                <Text className="text-xs text-[#94A3B8]">{h.date} · {h.user}</Text>
              </View>
              <View className="items-end">
                <Badge variant={statusBadge(h.status).variant}>{statusBadge(h.status).label}</Badge>
                <View className="mt-1 ml-auto">
                  <Icon name="chevron_right" size={16} color="#94A3B8" />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
