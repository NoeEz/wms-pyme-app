import React, { useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Modal, FlatList } from "react-native";
import Svg, { Path } from "react-native-svg";

// ─── Icons (inline SVG) ────────────────────────────────────────────────────

export function Icon({ name, size = 20, className = "", color = "currentColor" }: { name: string; size?: number; className?: string; color?: string }) {
  const icons: Record<string, React.ReactNode> = {
    home: <Path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21H15v-6H9v6H3V9.75z" />,
    operate: <Path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h4.5v4.5h-4.5V4.5zm8.25 0h4.5v4.5H12V4.5zm-8.25 8.25h4.5v4.5h-4.5v-4.5zm8.25 0h4.5v4.5H12v-4.5z" />,
    inventory: <Path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125V6a1.125 1.125 0 00-1.125-1.125H3.375A1.125 1.125 0 002.25 6v.375c0 .621.504 1.125 1.125 1.125z" />,
    more: <Path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />,
    entry: <Path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />,
    exit: <Path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0L9 5.25M12 2.25v13.5" />,
    transfer: <Path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />,
    scan: (
      <>
        <Path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
        <Path d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75V16.5zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75V13.5zM13.5 19.5h.75v.75h-.75V19.5zM19.5 13.5h.75v.75h-.75V13.5zM19.5 19.5h.75v.75h-.75V19.5zM16.5 16.5h.75v.75h-.75V16.5z" />
      </>
    ),
    camera: <Path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />,
    edit: <Path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />,
    trash: <Path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />,
    check: <Path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />,
    x: <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />,
    warning: <Path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />,
    info: <Path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />,
    search: <Path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z" />,
    chevron_right: <Path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />,
    chevron_left: <Path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />,
    chevron_down: <Path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />,
    wifi: <Path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />,
    wifi_off: <Path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18m-6.857-8.857A5.232 5.232 0 0112 12a5.25 5.25 0 015.21 4.57M5.1 11.846a9.016 9.016 0 0113.8 0M1.924 8.674a13.477 13.477 0 012.01-1.767M20.066 8.674a13.5 13.5 0 00-16.142 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />,
    clock: <Path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
    user: <Path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />,
    location: <Path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />,
    logout: <Path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />,
    refresh: <Path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />,
    flashlight: <Path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />,
    plus: <Path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />,
    minus: <Path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />,
    filter: <Path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />,
    bell: <Path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />,
    settings: <Path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
    sound: <Path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />,
    vibrate: <Path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18h3" />,
    package: <Path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} className={className}>
      {icons[name] ?? null}
    </Svg>
  );
}

// ─── Badge / Chip ──────────────────────────────────────────────────────────

type BadgeVariant = "success" | "warning" | "danger" | "info" | "muted" | "primary";

export function Badge({ variant = "muted", children, icon }: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: string;
}) {
  const styles: Record<BadgeVariant, { bg: string; text: string; iconColor: string }> = {
    success: { bg: "bg-[#D1FAE5]", text: "text-[#065F46]", iconColor: "#065F46" },
    warning: { bg: "bg-[#FEF3C7]", text: "text-[#78350F]", iconColor: "#78350F" },
    danger: { bg: "bg-[#FEE2E2]", text: "text-[#7F1D1D]", iconColor: "#7F1D1D" },
    info: { bg: "bg-[#E0E7FF]", text: "text-[#3730A3]", iconColor: "#3730A3" },
    muted: { bg: "bg-[#F1F5F9]", text: "text-[#64748B]", iconColor: "#64748B" },
    primary: { bg: "bg-[#4F46E5]", text: "text-white", iconColor: "#FFFFFF" },
  };
  const { bg, text, iconColor } = styles[variant];
  return (
    <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full self-start ${bg}`}>
      {icon && <Icon name={icon} size={12} color={iconColor} />}
      <Text className={`text-xs font-medium ${text}`}>{children}</Text>
    </View>
  );
}

// ─── Button ────────────────────────────────────────────────────────────────

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
type BtnSize = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  children,
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  onClick,
  className = "",
}: {
  variant?: BtnVariant;
  size?: BtnSize;
  children: React.ReactNode;
  icon?: string;
  iconRight?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base = "flex-row items-center justify-center gap-2 rounded-xl active:opacity-80";
  const sizes: Record<BtnSize, string> = {
    sm: "px-3 py-2 min-h-[40px]",
    md: "px-4 py-3 min-h-[48px]",
    lg: "px-5 py-3.5 min-h-[52px]",
  };
  const textSizes: Record<BtnSize, string> = { sm: "text-sm", md: "text-sm", lg: "text-base" };
  const variants: Record<BtnVariant, { bg: string; text: string; iconColor: string; shadow: string }> = {
    primary: { bg: "bg-[#4F46E5]", text: "text-white", iconColor: "#FFFFFF", shadow: "shadow-sm shadow-[#4F46E5]/30" },
    secondary: { bg: "bg-white border border-[#4F46E5]", text: "text-[#4F46E5]", iconColor: "#4F46E5", shadow: "" },
    ghost: { bg: "bg-transparent", text: "text-[#4F46E5]", iconColor: "#4F46E5", shadow: "" },
    danger: { bg: "bg-[#DC2626]", text: "text-white", iconColor: "#FFFFFF", shadow: "shadow-sm shadow-[#DC2626]/30" },
    success: { bg: "bg-[#059669]", text: "text-white", iconColor: "#FFFFFF", shadow: "shadow-sm shadow-[#059669]/30" },
    warning: { bg: "bg-[#B45309]", text: "text-white", iconColor: "#FFFFFF", shadow: "shadow-sm shadow-[#B45309]/30" },
  };
  const { bg, text, iconColor, shadow } = variants[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onClick}
      disabled={isDisabled}
      className={`${base} ${sizes[size]} ${bg} ${shadow} ${fullWidth ? "w-full" : ""} ${isDisabled ? "opacity-50" : ""} ${className}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 16 : 18} color={iconColor} />
      ) : null}
      <Text className={`font-medium ${textSizes[size]} ${text}`}>{children}</Text>
      {iconRight && !loading && <Icon name={iconRight} size={size === "sm" ? 16 : 18} color={iconColor} />}
    </Pressable>
  );
}

// ─── Input ─────────────────────────────────────────────────────────────────

export function Input({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  icon,
  error,
  hint,
  large = false,
  autoFocus = false,
  className = "",
}: {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  icon?: string;
  error?: string;
  hint?: string;
  large?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <View className={`flex-col gap-1 ${className}`}>
      {label && <Text className="text-sm font-medium text-[#475569]">{label}</Text>}
      <View className="relative justify-center">
        {icon && (
          <View className="absolute left-3 z-10 text-[#94A3B8]">
            <Icon name={icon} size={18} color="#94A3B8" />
          </View>
        )}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          autoFocus={autoFocus}
          secureTextEntry={type === "password"}
          keyboardType={type === "email" ? "email-address" : type === "number" ? "numeric" : "default"}
          autoCapitalize="none"
          className={`w-full border rounded-xl bg-white text-[#0F172A]
            ${icon ? "pl-10" : "pl-4"} pr-4
            ${large ? "py-4 text-base min-h-[56px]" : "py-3 text-sm min-h-[48px]"}
            ${error ? "border-[#DC2626]" : "border-[#CBD5E1]"}`}
        />
      </View>
      {error && (
        <View className="flex-row items-center gap-1">
          <Icon name="warning" size={12} color="#DC2626" />
          <Text className="text-xs text-[#DC2626]">{error}</Text>
        </View>
      )}
      {hint && !error && <Text className="text-xs text-[#64748B]">{hint}</Text>}
    </View>
  );
}

// ─── Select Field (modal picker — replaces the web <select>) ───────────────

export function SelectField({ value, placeholder, options, disabled, onSelect, textClassName = "" }: {
  value: string;
  placeholder: string;
  options: string[];
  disabled?: boolean;
  onSelect: (v: string) => void;
  textClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="flex-1 flex-row items-center justify-between py-1"
      >
        <Text className={`text-sm ${disabled ? "text-[#94A3B8]" : "text-[#0F172A]"} ${textClassName}`} numberOfLines={1}>
          {value || placeholder}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable className="absolute inset-0 bg-black/40" onPress={() => setOpen(false)} />
          <View className="bg-white rounded-t-[20px] w-full max-h-[70%] p-4 pb-8">
            <Text className="text-base font-semibold text-[#0F172A] mb-2 px-1">{placeholder}</Text>
            <FlatList
              data={options}
              keyExtractor={o => o}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { onSelect(item); setOpen(false); }}
                  className="flex-row items-center justify-between px-3 py-3.5 border-b border-[#F1F5F9]"
                >
                  <Text className="text-sm text-[#0F172A]">{item}</Text>
                  {item === value && <Icon name="check" size={16} color="#4F46E5" />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

export function Card({ children, className = "", onClick, padding = true }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: boolean;
}) {
  const classes = `bg-white rounded-2xl border border-[#E2E8F0] shadow-sm shadow-slate-900/5 ${padding ? "p-4" : ""} ${className}`;
  if (onClick) {
    return (
      <Pressable onPress={onClick} className={`${classes} active:opacity-80`}>
        {children}
      </Pressable>
    );
  }
  return <View className={classes}>{children}</View>;
}

// ─── Connection Banner ─────────────────────────────────────────────────────

export function ConnectionBanner({ status, pendingCount = 0 }: {
  status: "online" | "offline" | "pending";
  pendingCount?: number;
}) {
  if (status === "online") return null;
  return (
    <View className={`flex-row items-center gap-2 px-4 py-2.5 ${status === "offline" ? "bg-[#FEE2E2]" : "bg-[#FEF3C7]"}`}>
      <Icon name={status === "offline" ? "wifi_off" : "clock"} size={16} color={status === "offline" ? "#7F1D1D" : "#78350F"} />
      <Text className={`text-sm font-medium ${status === "offline" ? "text-[#7F1D1D]" : "text-[#78350F]"}`}>
        {status === "offline" ? "Sin conexión — los cambios se guardarán localmente" : `${pendingCount} movimiento(s) pendiente(s) de sincronizar`}
      </Text>
    </View>
  );
}

// ─── Location Pill ─────────────────────────────────────────────────────────

export function LocationPill({ zone, aisle, rack, position }: {
  zone: string; aisle: string; rack: string; position: string;
}) {
  const code = `${zone.replace("Zona ", "")}-${aisle.replace("Pasillo ", "")}-R${rack.replace("Rack ", "")}-P${position.replace("Posición ", "")}`;
  return (
    <View className="flex-row items-center gap-1 self-start bg-[#EEF2FF] px-2 py-1 rounded-md border border-[#C7D2FE]">
      <Icon name="location" size={12} color="#4F46E5" />
      <Text className="text-xs font-mono text-[#4F46E5]">{code}</Text>
    </View>
  );
}

// ─── Scan State Indicator ──────────────────────────────────────────────────

export function ScanStateIndicator({ state }: { state: import("../types").ScanState }) {
  const cfg: Record<string, { color: string; icon: string; label: string }> = {
    idle: { color: "#64748B", icon: "scan", label: "Esperando código..." },
    receiving: { color: "#6366F1", icon: "scan", label: "Recibiendo código..." },
    processing: { color: "#B45309", icon: "refresh", label: "Procesando..." },
    added: { color: "#059669", icon: "check", label: "Artículo agregado" },
    duplicate: { color: "#B45309", icon: "warning", label: "Lectura duplicada — no se agregó" },
    invalid_format: { color: "#DC2626", icon: "x", label: "Formato no reconocido" },
    not_found: { color: "#DC2626", icon: "x", label: "Producto no encontrado" },
    needs_serial: { color: "#B45309", icon: "warning", label: "Falta número de serie" },
  };
  const { color, icon, label } = cfg[state] ?? cfg.idle;
  return (
    <View className="flex-row items-center gap-2">
      <Icon name={icon} size={16} color={color} />
      <Text className="text-sm font-medium" style={{ color }}>{label}</Text>
    </View>
  );
}

// ─── Quantity Stepper ──────────────────────────────────────────────────────

export function QuantityStepper({ value, onChange, min = 1 }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <View className="flex-row items-center border border-[#CBD5E1] rounded-xl self-start overflow-hidden">
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        className="w-11 h-11 items-center justify-center active:bg-[#E2E8F0]"
      >
        <Icon name="minus" size={16} color="#475569" />
      </Pressable>
      <TextInput
        value={String(value)}
        onChangeText={t => onChange(Math.max(min, parseInt(t, 10) || min))}
        keyboardType="numeric"
        className="w-16 h-11 text-center text-sm font-semibold border-x border-[#CBD5E1] text-[#0F172A]"
      />
      <Pressable
        onPress={() => onChange(value + 1)}
        className="w-11 h-11 items-center justify-center active:bg-[#E2E8F0]"
      >
        <Icon name="plus" size={16} color="#475569" />
      </Pressable>
    </View>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────

export function Toast({ message, type = "info", visible }: {
  message: string;
  type?: "success" | "warning" | "error" | "info";
  visible: boolean;
}) {
  if (!visible) return null;
  const styles = {
    success: "bg-[#059669]",
    warning: "bg-[#B45309]",
    error: "bg-[#DC2626]",
    info: "bg-[#4F46E5]",
  };
  const icons = { success: "check", warning: "warning", error: "x", info: "info" };
  return (
    <View className={`absolute bottom-24 left-4 right-4 z-50 flex-row items-center gap-3 px-4 py-3.5 rounded-2xl shadow-lg shadow-black/20 ${styles[type]}`}>
      <Icon name={icons[type]} size={18} color="#FFFFFF" />
      <Text className="text-sm font-medium text-white flex-1">{message}</Text>
    </View>
  );
}

// ─── Dialog ────────────────────────────────────────────────────────────────

export function Dialog({ open, title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  onConfirm, onCancel, variant = "default" }: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/40" onPress={onCancel} />
        <View className="bg-white rounded-t-[20px] w-full p-6 pb-8">
          <Text className="text-base font-semibold text-[#0F172A] mb-2">{title}</Text>
          <Text className="text-sm text-[#64748B] mb-6">{message}</Text>
          <View className="flex-col gap-3">
            <Button variant={variant === "danger" ? "danger" : "primary"} fullWidth onClick={onConfirm}>
              {confirmLabel}
            </Button>
            <Button variant="ghost" fullWidth onClick={onCancel}>{cancelLabel}</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

export function Skeleton({ className = "" }: { className?: string }) {
  return <View className={`bg-[#E2E8F0] rounded ${className}`} />;
}

// ─── Empty State ───────────────────────────────────────────────────────────

export function EmptyState({ icon, title, description }: {
  icon: string;
  title: string;
  description?: string;
}) {
  return (
    <View className="items-center justify-center py-12 px-6">
      <View className="w-16 h-16 rounded-full bg-[#EEF2FF] items-center justify-center mb-4">
        <Icon name={icon} size={28} color="#6366F1" />
      </View>
      <Text className="text-sm font-semibold text-[#475569] mb-1 text-center">{title}</Text>
      {description && <Text className="text-xs text-[#64748B] text-center">{description}</Text>}
    </View>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────

export function SectionHeader({ title, action, onAction }: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">{title}</Text>
      {action && (
        <Pressable onPress={onAction}>
          <Text className="text-xs font-semibold text-[#4F46E5]">{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Role Badge ────────────────────────────────────────────────────────────

export function RoleBadge({ role }: { role: import("../types").Role }) {
  const labels: Record<string, string> = {
    operator: "Operador",
    supervisor: "Supervisor",
    admin: "Administrador",
  };
  const variants: Record<string, BadgeVariant> = {
    operator: "muted",
    supervisor: "info",
    admin: "primary",
  };
  return <Badge variant={variants[role]}>{labels[role]}</Badge>;
}
