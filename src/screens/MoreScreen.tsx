import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Icon, RoleBadge, Dialog } from "../components/ui";
import type { User, Warehouse, Screen, ModuleInfo } from "../types";
import { isModuleEnabled } from "../services/modules";

interface Props {
  user: User;
  warehouse: Warehouse;
  modules: ModuleInfo[];
  onNavigate: (s: Screen) => void;
  onLogout: () => void;
  onChangeWarehouse: () => void;
}

export default function MoreScreen({ user, warehouse, modules, onNavigate, onLogout, onChangeWarehouse }: Props) {
  const historyEnabled = isModuleEnabled(modules, 'history');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibEnabled, setVibEnabled] = useState(true);
  const [showLogout, setShowLogout] = useState(false);

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="flex-1 px-4 py-4 flex flex-col gap-4">
        {/* Profile */}
        <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 p-4">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-12 h-12 bg-[#4F46E5] rounded-full items-center justify-center">
              <Text className="text-white text-lg font-bold">{user.name.charAt(0)}</Text>
            </View>
            <View>
              <Text className="text-base font-semibold text-[#0F172A]">{user.name}</Text>
              <Text className="text-xs text-[#94A3B8]">{user.email}</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2 pt-3 border-t border-[#F1F5F9]">
            <Text className="text-sm text-[#64748B]">Rol:</Text>
            <RoleBadge role={user.role} />
          </View>
        </View>

        {/* Active warehouse */}
        <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
          <View className="px-4 py-3 border-b border-[#F1F5F9]">
            <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Almacén activo</Text>
          </View>
          <View className="px-4 py-3 flex-row items-center gap-3">
            <View className="w-10 h-10 bg-[#EEF2FF] rounded-[8px] items-center justify-center">
              <Icon name="inventory" size={18} color="#4F46E5" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-[#0F172A]">{warehouse.name}</Text>
              <Text className="text-xs text-[#94A3B8]">{warehouse.city}</Text>
            </View>
            <Pressable
              onPress={onChangeWarehouse}
              className="border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-1.5 rounded-full"
            >
              <Text className="text-xs font-medium text-[#4F46E5]">Cambiar</Text>
            </Pressable>
          </View>
        </View>

        {/* Preferences */}
        <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
          <View className="px-4 py-3 border-b border-[#F1F5F9]">
            <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Preferencias de escaneo</Text>
          </View>

          <View className="px-4 py-3 flex-row items-center justify-between border-b border-[#F1F5F9]">
            <View className="flex-row items-center gap-3">
              <Icon name="sound" size={18} color="#64748B" />
              <View>
                <Text className="text-sm text-[#0F172A]">Sonido al escanear</Text>
                <Text className="text-xs text-[#94A3B8]">Confirmación sonora por lectura</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setSoundEnabled(s => !s)}
              className={`w-11 h-6 rounded-full relative ${soundEnabled ? 'bg-[#4F46E5]' : 'bg-[#CBD5E1]'}`}
              accessibilityRole="switch"
              accessibilityState={{ checked: soundEnabled }}
            >
              <View className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow
                ${soundEnabled ? 'left-[22px]' : 'left-0.5'}`} />
            </Pressable>
          </View>

          <View className="px-4 py-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <Icon name="vibrate" size={18} color="#64748B" />
              <View>
                <Text className="text-sm text-[#0F172A]">Vibración al escanear</Text>
                <Text className="text-xs text-[#94A3B8]">Respuesta háptica por lectura</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setVibEnabled(v => !v)}
              className={`w-11 h-6 rounded-full relative ${vibEnabled ? 'bg-[#4F46E5]' : 'bg-[#CBD5E1]'}`}
              accessibilityRole="switch"
              accessibilityState={{ checked: vibEnabled }}
            >
              <View className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow
                ${vibEnabled ? 'left-[22px]' : 'left-0.5'}`} />
            </Pressable>
          </View>
        </View>

        {/* Navigation items */}
        {user.role !== 'operator' && (
          <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
            <View className="px-4 py-3 border-b border-[#F1F5F9]">
              <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Supervisión</Text>
            </View>
            <Pressable
              onPress={() => historyEnabled && onNavigate('history')}
              disabled={!historyEnabled}
              className={`w-full flex-row items-center gap-3 px-4 py-3 active:bg-[#F8FAFC] ${!historyEnabled ? 'opacity-40' : ''}`}
            >
              <Icon name="clock" size={18} color="#64748B" />
              <Text className="flex-1 text-sm text-[#0F172A]">
                {historyEnabled ? 'Historial de movimientos' : 'Historial (no disponible)'}
              </Text>
              <Icon name="chevron_right" size={16} color="#94A3B8" />
            </Pressable>
          </View>
        )}

        {user.role === 'admin' && (
          <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
            <View className="px-4 py-3 border-b border-[#F1F5F9]">
              <Text className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Administración</Text>
            </View>
            <Pressable
              onPress={() => onNavigate('modules')}
              className="w-full flex-row items-center gap-3 px-4 py-3 active:bg-[#F8FAFC]"
            >
              <Icon name="settings" size={18} color="#64748B" />
              <Text className="flex-1 text-sm text-[#0F172A]">Módulos operativos</Text>
              <Icon name="chevron_right" size={16} color="#94A3B8" />
            </Pressable>
          </View>
        )}

        {/* Component library access */}
        <Pressable
          onPress={() => onNavigate('components')}
          className="w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 flex-row items-center gap-3 px-4 py-3 active:bg-[#F8FAFC]"
        >
          <Icon name="filter" size={18} color="#64748B" />
          <Text className="flex-1 text-sm text-[#0F172A]">Biblioteca de componentes</Text>
          <Icon name="chevron_right" size={16} color="#94A3B8" />
        </Pressable>

        {/* Logout */}
        <Pressable
          onPress={() => setShowLogout(true)}
          className="w-full flex-row items-center justify-center gap-2 border border-[#FCA5A5] bg-white rounded-[14px] py-3.5 active:bg-[#FEE2E2]"
        >
          <Icon name="logout" size={18} color="#DC2626" />
          <Text className="text-sm font-medium text-[#DC2626]">Cerrar sesión</Text>
        </Pressable>

        <Text className="text-center text-xs text-[#94A3B8]">v1.0.0-mvp · WMS PyME · Industrias Nova PyME</Text>
      </View>

      <Dialog
        open={showLogout}
        title="Cerrar sesión"
        message="¿Seguro que deseas cerrar la sesión? Asegúrate de que todos los movimientos estén sincronizados."
        confirmLabel="Cerrar sesión"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={onLogout}
        onCancel={() => setShowLogout(false)}
      />
    </View>
  );
}
