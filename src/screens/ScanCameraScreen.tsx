import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Linking } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from "expo-camera";
import { Button, Icon, Toast } from "../components/ui";
import type { MovementItem } from "../types";
import { useScanProcessor } from "../services/scanning";

type CamState = "requesting" | "denied" | "active" | "scanning" | "detected";

// WMS labels are QR; supplier barcodes on boxes are usually EAN/UPC/Code 128.
const BARCODE_TYPES: BarcodeType[] = ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39"];
// The camera reports the same code many times per second while it stays in
// frame; ignore repeats of the last code for this long.
const SAME_CODE_COOLDOWN_MS = 2500;

interface Props {
  token: string;
  items: MovementItem[];
  onAddItem: (item: MovementItem) => void;
  onClose: () => void;
  onManual: () => void;
  onHandheld: () => void;
}

export default function ScanCameraScreen({ token, items, onAddItem, onClose, onManual, onHandheld }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [camState, setCamState] = useState<CamState>("requesting");
  const [flashOn, setFlashOn] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" as "success" | "error" | "warning" });
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const processingRef = useRef(false);
  const lastCodeRef = useRef<{ raw: string; at: number } | null>(null);
  const { process } = useScanProcessor({ token, items, onAddItem });

  const totalUnits = items.reduce((s, i) => s + (i.product.serialized ? i.serials.length : i.quantity), 0);

  const showToast = useCallback((message: string, type: "success" | "error" | "warning") => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 1800);
  }, []);

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

  const handleBarcodeScanned = useCallback(async ({ data: raw }: BarcodeScanningResult) => {
    if (processingRef.current) return;
    const last = lastCodeRef.current;
    if (last && last.raw === raw && Date.now() - last.at < SAME_CODE_COOLDOWN_MS) return;
    processingRef.current = true;
    setCamState("scanning");

    const outcome = await process(raw);
    lastCodeRef.current = { raw, at: Date.now() };
    if (!outcome) { processingRef.current = false; setCamState("active"); return; }

    const added = outcome.state === "added";
    if (added) {
      setCamState("detected");
      setLastAdded(outcome.product!.name);
    }
    showToast(outcome.message, added ? "success" : outcome.state === "duplicate" || outcome.state === "needs_serial" ? "warning" : "error");
    setTimeout(() => { setCamState("active"); processingRef.current = false; }, added ? 1200 : 900);
  }, [process, showToast]);

  return (
    <View className="flex-1 bg-black relative">
      <View className="relative flex-1 overflow-hidden">
        {(camState === "active" || camState === "scanning" || camState === "detected") && (
          <CameraView
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            facing="back"
            enableTorch={flashOn}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        )}
        {(camState === "requesting" || camState === "denied") && <View className="absolute inset-0 bg-[#1a1a1a]" />}

        {/* Top controls */}
        <View className="absolute top-0 left-0 right-0 flex-row items-center justify-between px-4 pt-4 pb-3 z-20">
          <Pressable onPress={onClose} className="w-10 h-10 bg-black/50 rounded-full items-center justify-center">
            <Icon name="x" size={20} color="#FFFFFF" />
          </Pressable>
          <View className="bg-black/60 rounded-full px-3 py-1.5 flex-row items-center gap-2">
            <View className="w-2 h-2 rounded-full bg-[#059669]" />
            <Text className="text-white text-xs font-medium">{totalUnits} ud.</Text>
          </View>
          <Pressable
            onPress={() => setFlashOn(f => !f)}
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
              <Button variant="ghost" fullWidth onClick={onManual} icon="edit">Captura manual</Button>
            </View>
          </View>
        )}

        {(camState === "active" || camState === "scanning" || camState === "detected") && (
          <>
            {/* Viewfinder frame */}
            <View pointerEvents="none" className="absolute inset-0 flex items-center justify-center z-10">
              <View className="relative w-56 h-56">
                {[["top-0 left-0", "border-t-2 border-l-2"], ["top-0 right-0", "border-t-2 border-r-2"],
                  ["bottom-0 left-0", "border-b-2 border-l-2"], ["bottom-0 right-0", "border-b-2 border-r-2"]].map(([pos, border], i) => (
                  <View key={i} className={`absolute w-8 h-8 ${pos} ${border}
                    ${camState === "detected" ? "border-[#059669]" : camState === "scanning" ? "border-[#FCD34D]" : "border-white"}`} />
                ))}

                {camState === "scanning" && <View className="absolute inset-x-0 h-0.5 bg-[#FCD34D] top-1/2" />}

                {camState === "detected" && (
                  <View className="absolute inset-0 flex items-center justify-center">
                    <View className="w-12 h-12 bg-[#059669] rounded-full items-center justify-center">
                      <Icon name="check" size={24} color="#FFFFFF" />
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View pointerEvents="none" className="absolute bottom-32 left-0 right-0 flex justify-center z-10">
              <View className="bg-black/60 rounded-full px-4 py-2">
                <Text className="text-white text-xs text-center">
                  {camState === "detected" ? "Código detectado ✓" :
                   camState === "scanning" ? "Procesando..." :
                   "Coloca el código QR dentro del recuadro"}
                </Text>
              </View>
            </View>

            {lastAdded && (
              <View pointerEvents="none" className="absolute bottom-20 left-4 right-4 z-10">
                <View className="bg-white/90 rounded-[10px] px-3 py-2 flex-row items-center gap-2">
                  <Icon name="check" size={16} color="#059669" />
                  <Text className="text-sm font-medium text-[#0F172A]" numberOfLines={1}>{lastAdded}</Text>
                </View>
              </View>
            )}
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
          <Pressable
            onPress={onManual}
            className="flex-1 flex-row items-center justify-center gap-1.5 border border-[#475569] py-2.5 rounded-[10px]"
          >
            <Icon name="edit" size={15} color="#94A3B8" />
            <Text className="text-[#94A3B8] text-xs font-medium">Captura manual</Text>
          </Pressable>
        </View>
      </View>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </View>
  );
}
