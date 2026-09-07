import React from "react";
import { View, Text, Pressable } from "react-native";
import { Icon, Badge } from "../components/ui";
import type { MoveType, ModuleInfo } from "../types";
import { isModuleEnabled } from "../services/modules";

interface Props {
  modules: ModuleInfo[];
  onSelect: (type: MoveType) => void;
}

const OPTIONS = [
  {
    type: 'entry' as MoveType,
    module: 'inbound',
    label: 'Entrada',
    icon: 'entry',
    desc: 'Registra mercancía que llega al almacén desde un proveedor u otro origen externo.',
    color: '#4F46E5',
    bg: 'bg-[#EEF2FF]',
  },
  {
    type: 'exit' as MoveType,
    module: 'outbound',
    label: 'Salida',
    icon: 'exit',
    desc: 'Registra mercancía que sale del almacén hacia un cliente u otro destino externo.',
    color: '#059669',
    bg: 'bg-[#D1FAE5]',
  },
  {
    type: 'transfer' as MoveType,
    module: 'transfer',
    label: 'Transferencia',
    icon: 'transfer',
    desc: 'Mueve mercancía entre ubicaciones del mismo almacén o a otro almacén.',
    color: '#B45309',
    bg: 'bg-[#FEF3C7]',
  },
];

export default function MoveSelectScreen({ modules, onSelect }: Props) {
  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <View className="bg-white px-5 pt-5 pb-4 border-b border-[#E2E8F0]">
        <Text className="text-lg font-semibold text-[#0F172A]">Nuevo movimiento</Text>
        <Text className="text-sm text-[#64748B] mt-0.5">¿Qué tipo de movimiento vas a registrar?</Text>
      </View>

      <View className="flex-1 px-4 py-5 flex flex-col gap-3">
        {OPTIONS.map(opt => {
          const enabled = isModuleEnabled(modules, opt.module);
          return (
            <Pressable
              key={opt.type}
              onPress={() => enabled && onSelect(opt.type)}
              disabled={!enabled}
              className={`w-full bg-white border-2 border-[#E2E8F0] rounded-2xl p-4 active:scale-[0.98] shadow-sm shadow-slate-900/5 ${!enabled ? 'opacity-40' : ''}`}
            >
              <View className="flex-row items-center gap-4">
                <View className={`w-14 h-14 ${opt.bg} rounded-[12px] items-center justify-center`}>
                  <Icon name={opt.icon} size={26} color={opt.color} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-base font-semibold text-[#0F172A]">{opt.label}</Text>
                    {!enabled && <Badge variant="muted">No disponible</Badge>}
                  </View>
                  <Text className="text-xs text-[#64748B] leading-relaxed">
                    {enabled ? opt.desc : 'Módulo no habilitado para tu empresa.'}
                  </Text>
                </View>
                <Icon name="chevron_right" size={20} color="#94A3B8" />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
