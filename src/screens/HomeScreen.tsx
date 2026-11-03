import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Icon, Card, Badge } from "../components/ui";
import type { User, Warehouse, ConnectionStatus, Screen, ModuleInfo, MovementSummary } from "../types";
import { isModuleEnabled } from "../services/modules";
import { fetchMovements } from "../services/movements";

interface Props {
  token: string;
  user: User;
  warehouse: Warehouse;
  connection: ConnectionStatus;
  modules: ModuleInfo[];
  onNavigate: (s: Screen) => void;
  pendingCount: number;
}

const ACTION_BTNS = [
  { id: 'entry', module: 'inbound', label: 'Entrada', icon: 'entry', color: 'bg-[#4F46E5]', desc: 'Registrar llegada' },
  { id: 'exit', module: 'outbound', label: 'Salida', icon: 'exit', color: 'bg-[#059669]', desc: 'Registrar envío' },
  { id: 'transfer', module: 'transfer', label: 'Transferencia', icon: 'transfer', color: 'bg-[#B45309]', desc: 'Mover entre zonas' },
];

function greeting(date: Date) {
  const h = date.getHours();
  return h < 12 ? 'Buenos días,' : h < 19 ? 'Buenas tardes,' : 'Buenas noches,';
}

function timeAgo(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

const TYPE_LABELS = { entry: 'Entrada', exit: 'Salida', transfer: 'Transferencia' };

export default function HomeScreen({ token, user, warehouse, connection, modules, onNavigate, pendingCount }: Props) {
  const roleLabel = { operator: 'Operador', supervisor: 'Supervisor', admin: 'Administrador' }[user.role];
  const inventoryEnabled = isModuleEnabled(modules, 'inventory');

  // Shift summary: today's server-confirmed movements in this warehouse.
  const [today, setToday] = useState<MovementSummary[] | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const offline = connection === 'offline';

  useEffect(() => {
    if (offline) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    setSummaryError(false);
    fetchMovements(token, warehouse.id)
      .then(list => setToday(list.filter(m => Date.parse(m.createdAt) >= startOfDay.getTime())))
      .catch(() => setSummaryError(true));
  }, [token, warehouse.id, offline, pendingCount]);

  const countOf = (type: MovementSummary['type']) => today?.filter(m => m.type === type).length ?? 0;
  const last = today?.[0];

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 px-4 py-4 flex flex-col gap-4 pb-6">
        {/* Greeting */}
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[#64748B] text-xs">{greeting(new Date())}</Text>
            <Text className="text-[#0F172A] text-lg font-semibold">{user.name}</Text>
          </View>
          <Badge variant="info">{roleLabel}</Badge>
        </View>

        {/* Connection alert */}
        {connection !== 'online' && (
          <View className={`flex-row items-center gap-2 px-4 py-3 rounded-[10px]
            ${connection === 'offline' ? 'bg-[#FEE2E2]' : 'bg-[#FEF3C7]'}`}>
            <Icon name={connection === 'offline' ? 'wifi_off' : 'clock'} size={16} color={connection === 'offline' ? '#7F1D1D' : '#78350F'} />
            <Text className={`text-sm font-medium flex-1 ${connection === 'offline' ? 'text-[#7F1D1D]' : 'text-[#78350F]'}`}>
              {connection === 'offline'
                ? 'Sin conexión — los movimientos se guardarán localmente'
                : `${pendingCount} movimiento(s) pendiente(s) de sincronizar`}
            </Text>
          </View>
        )}

        {/* Main actions */}
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B] mb-3">Operaciones</Text>
          <View className="flex-row flex-wrap gap-3">
            {ACTION_BTNS.map(btn => {
              const enabled = isModuleEnabled(modules, btn.module);
              return (
                <Pressable
                  key={btn.id}
                  onPress={() => enabled && onNavigate('move-select')}
                  disabled={!enabled}
                  className={`flex-1 flex-col items-center gap-2 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-3 active:scale-[0.97] ${!enabled ? 'opacity-40' : ''}`}
                >
                  <View className={`w-12 h-12 ${btn.color} rounded-[10px] items-center justify-center`}>
                    <Icon name={btn.icon} size={22} color="#FFFFFF" />
                  </View>
                  <Text className="text-xs font-semibold text-[#0F172A]">{btn.label}</Text>
                  <Text className="text-[10px] text-[#64748B] text-center leading-tight">
                    {enabled ? btn.desc : 'No disponible'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Secondary actions */}
        <View className="flex flex-col gap-2">
          <Pressable
            onPress={() => inventoryEnabled && onNavigate('inventory')}
            disabled={!inventoryEnabled}
            className={`flex-row items-center gap-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 px-4 py-3.5 active:bg-[#F1F5F9] ${!inventoryEnabled ? 'opacity-40' : ''}`}
          >
            <View className="w-10 h-10 bg-[#EEF2FF] rounded-[8px] items-center justify-center">
              <Icon name="inventory" size={20} color="#4F46E5" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-[#0F172A]">Consultar inventario</Text>
              <Text className="text-xs text-[#64748B]">{inventoryEnabled ? 'Buscar existencias y ubicaciones' : 'Módulo no habilitado para tu empresa'}</Text>
            </View>
            <Icon name="chevron_right" size={18} color="#94A3B8" />
          </Pressable>

          <Pressable
            onPress={() => onNavigate('pending')}
            className="flex-row items-center gap-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 px-4 py-3.5 active:bg-[#F1F5F9]"
          >
            <View className="w-10 h-10 bg-[#FEF3C7] rounded-[8px] items-center justify-center">
              <Icon name="clock" size={20} color="#B45309" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-[#0F172A]">Pendientes</Text>
              <Text className="text-xs text-[#64748B]">Movimientos sin sincronizar</Text>
            </View>
            {pendingCount > 0 && (
              <View className="w-5 h-5 rounded-full bg-[#B45309] items-center justify-center">
                <Text className="text-white text-xs font-semibold">{pendingCount}</Text>
              </View>
            )}
            <Icon name="chevron_right" size={18} color="#94A3B8" />
          </Pressable>
        </View>

        {/* Shift summary */}
        <Card className="!p-0 overflow-hidden">
          <View className="px-4 py-3 border-b border-[#F1F5F9]">
            <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Resumen del turno</Text>
          </View>
          {today === null && !summaryError && !offline ? (
            <View className="py-5 items-center">
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>
          ) : (
            <View className="flex-row flex-wrap">
              {[
                { label: 'Entradas', value: countOf('entry'), color: 'text-[#4F46E5]' },
                { label: 'Salidas', value: countOf('exit'), color: 'text-[#059669]' },
                { label: 'Traslados', value: countOf('transfer'), color: 'text-[#B45309]' },
              ].map((item, i) => (
                <View key={item.label} className={`flex-1 flex-col items-center py-3 ${i > 0 ? 'border-l border-[#F1F5F9]' : ''}`}>
                  <Text className={`text-xl font-bold ${item.color}`}>{today ? item.value : '—'}</Text>
                  <Text className="text-[10px] text-[#64748B]">{item.label}</Text>
                </View>
              ))}
            </View>
          )}
          <View className="px-4 py-2.5 bg-[#F8FAFC] border-t border-[#F1F5F9] flex-row items-center gap-2">
            <Icon name="clock" size={13} color="#94A3B8" />
            <Text className="text-xs text-[#64748B]">
              {offline && !today ? 'Sin conexión — resumen no disponible' :
               summaryError ? 'No se pudo cargar el resumen' :
               last ? `Último: ${TYPE_LABELS[last.type]} ${last.folio ?? ''} · ${timeAgo(last.createdAt)}` :
               today ? 'Sin movimientos hoy' : 'Cargando...'}
            </Text>
          </View>
        </Card>

        {/* Quick scan button */}
        <Pressable
          onPress={() => onNavigate('move-select')}
          className="flex-row items-center justify-center gap-2 w-full bg-[#4F46E5] rounded-[12px] py-4 active:bg-[#4338CA] shadow-sm"
        >
          <Icon name="scan" size={20} color="#FFFFFF" />
          <Text className="text-white font-semibold text-sm">Iniciar escaneo rápido</Text>
        </Pressable>
      </View>
    </View>
  );
}
