import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Icon } from "../components/ui";
import type { ModuleInfo } from "../types";
import { updateModules } from "../services/modules";
import { ApiError } from "../services/api";

interface Props {
  token: string;
  modules: ModuleInfo[];
  onModulesChange: (modules: ModuleInfo[]) => void;
}

export default function ModulesScreen({ token, modules, onModulesChange }: Props) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function toggle(key: string) {
    if (pendingKey || modules.find(m => m.key === key)?.core) return;
    setError('');
    setPendingKey(key);
    const nextEnabled = modules.map(m => m.key === key ? { ...m, enabled: !m.enabled } : m);
    onModulesChange(nextEnabled); // optimistic
    try {
      const updated = await updateModules(token, nextEnabled.filter(m => m.enabled).map(m => m.key));
      onModulesChange(updated);
    } catch (err) {
      onModulesChange(modules); // rollback
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el módulo.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <View className="flex-1 bg-[#F8FAFC] px-4 py-4">
      <Text className="text-xs text-[#64748B] mb-3">
        Solo el administrador activa módulos. Un módulo apagado desaparece de las pantallas y se bloquea en el servidor, sin borrar datos. Los módulos centrales siempre están activos; la configuración, roles y permisos se editan en el portal web.
      </Text>

      {!!error && (
        <View className="flex-row items-center gap-2 bg-[#FEE2E2] px-4 py-3 rounded-[10px] mb-3">
          <Icon name="warning" size={16} color="#7F1D1D" />
          <Text className="text-sm text-[#7F1D1D] flex-1">{error}</Text>
        </View>
      )}

      <View className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 overflow-hidden">
        {modules.map((m, i) => (
          <View key={m.key} className={`px-4 py-3.5 flex-row items-center gap-3 ${i > 0 ? "border-t border-[#F1F5F9]" : ""}`}>
            <View className="flex-1">
              <Text className="text-sm font-medium text-[#0F172A]">{m.label}{m.core ? "  · Central" : ""}</Text>
              <Text className="text-xs text-[#94A3B8]">{m.description}</Text>
            </View>
            {m.core ? (
              <Icon name="lock" size={16} color="#94A3B8" />
            ) : pendingKey === m.key ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <Pressable
                onPress={() => toggle(m.key)}
                disabled={!!pendingKey}
                className={`w-11 h-6 rounded-full relative ${m.enabled ? 'bg-[#4F46E5]' : 'bg-[#CBD5E1]'}`}
                accessibilityRole="switch"
                accessibilityState={{ checked: m.enabled }}
              >
                <View className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow
                  ${m.enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
