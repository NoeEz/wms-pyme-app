import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking, Animated, Easing } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Button, Icon } from "../components/ui";
import type { MovementItem } from "../types";
import { useScanProcessor, type ScanOutcome } from "../services/scanning";

type CamState = "requesting" | "denied" | "active";
type FeedbackType = "success" | "warning" | "error";

// WMS labels are QR; supplier barcodes on boxes are usually EAN/UPC/Code 128.
const BARCODE_TYPES: BarcodeType[] = ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39"];
const QR_ONLY: BarcodeType[] = ["qr"];
// The camera keeps reporting a code while it is in frame. If nothing has been
// reported for this long, the code left the frame and the shutter disarms.
const CODE_LOST_AFTER_MS = 800;
// Ignore a second press right after a capture (accidental double tap).
const CAPTURE_LOCK_MS = 450;
// Staying on screen: fade-in, hold, fade-out of each action message.
const FEEDBACK_HOLD_MS = 1300;
const MAX_FEEDBACK = 3;

interface Props {
  token: string;
  items: MovementItem[];
  onAddItem: (item: MovementItem) => void;
  onClose: () => void;
  onManual: () => void;
  onHandheld: () => void;
  /** Camera module setting: read only QR codes (WMS labels), ignore supplier barcodes. */
  qrOnly?: boolean;
  /** Permission "capture.manual". */
  canManual?: boolean;
}

interface FeedbackEntry { id: number; message: string; type: FeedbackType }

const FEEDBACK_STYLE: Record<FeedbackType, { bg: string; icon: string }> = {
  success: { bg: "#059669", icon: "check" },
  warning: { bg: "#B45309", icon: "warning" },
  error: { bg: "#DC2626", icon: "x" },
};

function describe(outcome: ScanOutcome): { message: string; type: FeedbackType } {
  if (outcome.state === "added") {
    const detail = outcome.serial ? ` · serie ${outcome.serial}` : outcome.lot ? ` · lote ${outcome.lot}` : "";
    return { message: `+1  ${outcome.product!.name}${detail}`, type: "success" };
  }
  return { message: outcome.message, type: outcome.state === "duplicate" || outcome.state === "needs_serial" ? "warning" : "error" };
}

/** One action message: pops in, holds, floats up and disappears. */
function FadingChip({ entry, onDone }: { entry: FeedbackEntry; onDone: (id: number) => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(10)).current;
  const style = FEEDBACK_STYLE[entry.type];

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.delay(FEEDBACK_HOLD_MS),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 650, useNativeDriver: true }),
        Animated.timing(lift, { toValue: -18, duration: 650, useNativeDriver: true }),
      ]),
    ]);
    anim.start(({ finished }) => { if (finished) onDone(entry.id); });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{ opacity, transform: [{ translateY: lift }], backgroundColor: style.bg, marginTop: 6 }}
      className="flex-row items-center gap-2 rounded-full px-4 py-2 max-w-full"
    >
      <Icon name={style.icon} size={16} color="#FFFFFF" />
      <Text className="text-white text-sm font-semibold flex-shrink" numberOfLines={2}>{entry.message}</Text>
    </Animated.View>
  );
}

export default function ScanCameraScreen({ token, items, onAddItem, onClose, onManual, onHandheld, qrOnly = false, canManual = true }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [camState, setCamState] = useState<CamState>("requesting");
  const [flashOn, setFlashOn] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const candidateRef = useRef<string | null>(null);
  const lastSeenRef = useRef(0);
  const lockedRef = useRef(false);
  const feedbackId = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const { process } = useScanProcessor({ token, items, onAddItem });

  const totalUnits = items.reduce((s, i) => s + (i.product.serialized ? i.serials.length : i.quantity), 0);
  const ready = candidate !== null && !capturing;

  // Ask for camera permission once, when this screen mounts — not at app launch.
  useEffect(() => {
    if (!permission) return;
    if (permission.granted) { setCamState("active"); return; }
    if (permission.canAskAgain) {
      requestPermission().then(res => setCamState(res.granted ? "active" : "denied"));
    } else {
      setCamState("denied");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  // The camera only *detects*: it remembers the code in frame, nothing is
  // registered until the operator presses the shutter.
  const handleBarcodeScanned = useCallback(({ data: raw }: BarcodeScanningResult) => {
    lastSeenRef.current = Date.now();
    if (candidateRef.current !== raw) {
      candidateRef.current = raw;
      setCandidate(raw);
    }
  }, []);

  // Disarm the shutter once the code has left the frame.
  useEffect(() => {
    const timer = setInterval(() => {
      if (candidateRef.current && Date.now() - lastSeenRef.current > CODE_LOST_AFTER_MS) {
        candidateRef.current = null;
        setCandidate(null);
      }
    }, 200);
    return () => clearInterval(timer);
  }, []);

  // Pulsing halo that draws the eye to the shutter while a code is ready.
  useEffect(() => {
    if (!ready) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [ready, pulse]);

  const pushFeedback = useCallback((message: string, type: FeedbackType) => {
    setFeedback(list => [...list.slice(-(MAX_FEEDBACK - 1)), { id: ++feedbackId.current, message, type }]);
  }, []);
  const dropFeedback = useCallback((id: number) => setFeedback(list => list.filter(f => f.id !== id)), []);

  const capture = useCallback(async () => {
    const raw = candidateRef.current;
    if (!raw || lockedRef.current) return;
    lockedRef.current = true;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const outcome = await process(raw);
    if (outcome) {
      const { message, type } = describe(outcome);
      pushFeedback(message, type);
      if (outcome.state === "added") {
        setFlash(true);
        setTimeout(() => setFlash(false), 450);
      }
    }
    setCapturing(false);
    setTimeout(() => { lockedRef.current = false; }, CAPTURE_LOCK_MS);
  }, [process, pushFeedback]);

  const active = camState === "active";
  const cornerColor = flash ? "border-[#059669]" : ready ? "border-[#34D399]" : capturing ? "border-[#FCD34D]" : "border-white";
  const hint = capturing ? "Procesando…" : ready ? "Listo para capturar" : "Apunta al código dentro del recuadro";

  return (
    <View className="flex-1 bg-black relative">
      <View className="relative flex-1 overflow-hidden">
        {active && (
          <CameraView
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            facing="back"
            enableTorch={flashOn}
            barcodeScannerSettings={{ barcodeTypes: qrOnly ? QR_ONLY : BARCODE_TYPES }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        )}
        {!active && <View className="absolute inset-0 bg-[#1a1a1a]" />}

        {/* Top controls */}
        <View className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4 pt-4 pb-3 z-20">
          <Pressable onPress={onClose} accessibilityLabel="Cerrar cámara" className="w-10 h-10 bg-black/50 rounded-full items-center justify-center">
            <Icon name="x" size={20} color="#FFFFFF" />
          </Pressable>
          <View className="bg-black/60 rounded-full px-3 py-1.5 flex-row items-center gap-2">
            <View className="w-2 h-2 rounded-full bg-[#059669]" />
            <Text className="text-white text-xs font-medium">{totalUnits} ud.</Text>
          </View>
          <Pressable
            onPress={() => setFlashOn(f => !f)}
            accessibilityLabel="Linterna"
            className={`w-10 h-10 rounded-full items-center justify-center ${flashOn ? "bg-yellow-400" : "bg-black/50"}`}
          >
            <Icon name="flashlight" size={20} color={flashOn ? "#000000" : "#FFFFFF"} />
          </Pressable>
        </View>

        {camState === "requesting" && (
          <View className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <ActivityIndicator size="large" color="#FFFFFF" style={{ marginBottom: 16 }} />
            <Text className="text-white text-sm font-medium">Solicitando acceso a la cámara...</Text>
          </View>
        )}

        {camState === "denied" && (
          <View className="absolute inset-0 flex flex-col items-center justify-center z-10 px-6">
            <View className="w-16 h-16 bg-[#FEE2E2] rounded-full items-center justify-center mb-4">
              <Icon name="camera" size={28} color="#DC2626" />
            </View>
            <Text className="text-white text-base font-semibold text-center mb-2">Acceso a cámara denegado</Text>
            <Text className="text-[#94A3B8] text-sm text-center mb-6">
              Para usar la cámara, habilita el permiso en Configuración → Aplicaciones → WMS PyME → Permisos → Cámara.
            </Text>
            <View className="flex flex-col w-full gap-2">
              <Button variant="secondary" fullWidth onClick={() => Linking.openSettings()} icon="settings">Abrir configuración</Button>
              <Button variant="primary" fullWidth onClick={onHandheld} icon="scan">Usar lector handheld</Button>
              {canManual && <Button variant="ghost" fullWidth onClick={onManual} icon="edit">Captura manual</Button>}
            </View>
          </View>
        )}

        {active && (
          <>
            {/* Viewfinder frame */}
            <View pointerEvents="none" className="absolute inset-0 flex items-center justify-center z-10">
              <View className="relative w-56 h-56">
                {[["top-0 left-0", "border-t-2 border-l-2"], ["top-0 right-0", "border-t-2 border-r-2"],
                  ["bottom-0 left-0", "border-b-2 border-l-2"], ["bottom-0 right-0", "border-b-2 border-r-2"]].map(([pos, border], i) => (
                  <View key={i} className={`absolute w-8 h-8 ${pos} ${border} ${cornerColor}`} />
                ))}
                {flash && (
                  <View className="absolute inset-0 flex items-center justify-center">
                    <View className="w-12 h-12 bg-[#059669] rounded-full items-center justify-center">
                      <Icon name="check" size={24} color="#FFFFFF" />
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Action messages: appear, hold, float up and vanish */}
            <View pointerEvents="none" className="absolute left-4 right-4 items-center z-10" style={{ bottom: 190 }}>
              {feedback.map(entry => <FadingChip key={entry.id} entry={entry} onDone={dropFeedback} />)}
            </View>

            {/* Status pill */}
            <View pointerEvents="none" className="absolute left-0 right-0 items-center z-10" style={{ bottom: 128 }}>
              <View className={`rounded-full px-4 py-2 flex-row items-center gap-2 ${ready ? "bg-[#059669]" : "bg-black/60"}`}>
                {ready && <Icon name="check" size={14} color="#FFFFFF" />}
                <Text className={`text-xs text-center ${ready ? "text-white font-bold" : "text-white"}`}>{hint}</Text>
              </View>
            </View>

            {/* Shutter */}
            <View className="absolute left-0 right-0 items-center z-10" style={{ bottom: 24 }}>
              <View className="w-24 h-24 items-center justify-center">
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute", width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: "#34D399",
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: ready ? [0.9, 0] : [0, 0] }),
                    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
                  }}
                />
                <Pressable
                  onPress={capture}
                  disabled={!ready}
                  accessibilityRole="button"
                  accessibilityLabel="Capturar código"
                  accessibilityState={{ disabled: !ready }}
                  style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: ready ? "#34D399" : "rgba(255,255,255,0.35)" }}
                  className="items-center justify-center"
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        width: 62, height: 62, borderRadius: 31,
                        backgroundColor: ready ? "#059669" : "rgba(255,255,255,0.3)",
                        transform: [{ scale: pressed ? 0.9 : 1 }],
                      }}
                      className="items-center justify-center"
                    >
                      {capturing
                        ? <ActivityIndicator color="#FFFFFF" />
                        : <Icon name="scan" size={28} color={ready ? "#FFFFFF" : "rgba(255,255,255,0.7)"} />}
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Bottom bar */}
      <View className="bg-[#111111] px-4 py-3">
        <View className="flex-row gap-2">
          <Pressable
            onPress={onHandheld}
            className="flex-1 flex-row items-center justify-center gap-1.5 border border-[#475569] py-2.5 rounded-[10px]"
          >
            <Icon name="scan" size={15} color="#94A3B8" />
            <Text className="text-[#94A3B8] text-xs font-medium">Lector handheld</Text>
          </Pressable>
          {canManual && (
            <Pressable
              onPress={onManual}
              className="flex-1 flex-row items-center justify-center gap-1.5 border border-[#475569] py-2.5 rounded-[10px]"
            >
              <Icon name="edit" size={15} color="#94A3B8" />
              <Text className="text-[#94A3B8] text-xs font-medium">Captura manual</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
