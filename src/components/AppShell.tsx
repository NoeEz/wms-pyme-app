import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Icon } from "./ui";
import type { Screen, ConnectionStatus, User, Warehouse } from "../types";

interface AppShellProps {
  screen: Screen;
  user: User | null;
  warehouse: Warehouse | null;
  connection: ConnectionStatus;
  pendingCount?: number;
  onNavigate: (screen: Screen) => void;
  onConnectionPress?: () => void;
  children: React.ReactNode;
  showNav?: boolean;
  title?: string;
  onBack?: () => void;
  showHeader?: boolean;
}

const NAV_ITEMS = [
  { id: "home" as Screen, label: "Inicio", icon: "home" },
  { id: "move-select" as Screen, label: "Operar", icon: "operate" },
  { id: "inventory" as Screen, label: "Inventario", icon: "inventory" },
  { id: "more" as Screen, label: "Más", icon: "more" },
];

function ConnectionDot({ status, pendingCount = 0 }: { status: ConnectionStatus; pendingCount?: number }) {
  const cfg = {
    online: { dot: "bg-[#34D399]", label: "En línea" },
    offline: { dot: "bg-[#F87171]", label: pendingCount > 0 ? `Sin conexión · ${pendingCount}` : "Sin conexión" },
    pending: { dot: "bg-[#FBBF24]", label: `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}` },
  };
  const { dot, label } = cfg[status];
  return (
    <View className="flex-row items-center gap-1.5 bg-white/[0.06] px-2.5 py-1 rounded-full">
      <View className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <Text className="text-[11px] text-[#CBD5E1] font-medium">{label}</Text>
    </View>
  );
}

export default function AppShell({
  screen, user, warehouse, connection, pendingCount = 0, onNavigate, onConnectionPress, children,
  showNav = true, title, onBack, showHeader = true,
}: AppShellProps) {
  const insets = useSafeAreaInsets();
  const activeTab = ["home", "move-select", "move-config", "scan-handheld", "scan-camera", "manual-capture", "movement-draft", "movement-review", "movement-result"].includes(screen)
    ? screen === "home" ? "home" : "move-select"
    : screen === "inventory" || screen === "inventory-detail" ? "inventory"
    : screen === "more" ? "more"
    : "";

  const showSubtitle = !onBack && !!warehouse;

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      {/* Unified app bar — bleeds behind the notch/status bar */}
      <View className="bg-[#0F172A]" style={{ paddingTop: insets.top + 10 }}>
        <View className="flex-row items-center gap-3 px-4 pb-3.5">
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={8} className="w-9 h-9 -ml-1.5 items-center justify-center rounded-full active:bg-white/10">
              <Icon name="chevron_left" size={22} color="#FFFFFF" />
            </Pressable>
          ) : (
            <View className="w-8 h-8 rounded-lg bg-[#4F46E5] items-center justify-center">
              <Text className="text-white text-xs font-extrabold">W</Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-[16px] font-semibold text-white leading-tight" numberOfLines={1}>
              {title ?? warehouse?.name ?? "WMS PyME"}
            </Text>
            {showSubtitle && (
              <Text className="text-[11px] text-[#94A3B8] leading-tight" numberOfLines={1}>
                {warehouse!.name} · {warehouse!.city}
              </Text>
            )}
          </View>
          <Pressable onPress={onConnectionPress} disabled={!onConnectionPress} hitSlop={8}>
            <ConnectionDot status={connection} pendingCount={pendingCount} />
          </Pressable>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: showNav ? 56 + Math.max(insets.bottom, 8) : 0 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      {/* Bottom tab bar */}
      {showNav && (
        <View className="absolute left-0 right-0 bottom-0 shadow-lg shadow-slate-900/10">
          <BlurView
            intensity={92}
            tint="light"
            className="border-t border-[#E2E8F0]"
            style={{
              backgroundColor: "rgba(255,255,255,0.92)",
              flexDirection: "row",
              overflow: "hidden",
            }}
          >
            {NAV_ITEMS.map(item => {
              const isActive = activeTab === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => onNavigate(item.id)}
                  className="flex-1 items-center justify-center pt-2"
                  style={{ paddingBottom: Math.max(insets.bottom, 8) }}
                >
                  <View className={`flex-col items-center gap-0.5 px-4 py-1 rounded-2xl ${isActive ? "bg-[#EEF2FF]" : ""}`}>
                    <Icon name={item.icon} size={22} color={isActive ? "#4F46E5" : "#94A3B8"} />
                    <Text className={`text-[10px] ${isActive ? "font-semibold text-[#4F46E5]" : "font-medium text-[#94A3B8]"}`}>
                      {item.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </BlurView>
        </View>
      )}
    </View>
  );
}
