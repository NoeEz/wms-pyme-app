import React, { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Crypto from "expo-crypto";
import { clearStoredToken, restoreSession, rememberWarehouse } from "./services/auth";
import { buildMovementPayload, postMovement, type MovementPayload } from "./services/movements";
import { fetchModules } from "./services/modules";
import { ApiError, isTransientError, setUnauthorizedHandler, clearCache } from "./services/api";
import { warmOfflineCache } from "./services/products";
import { useServerReachable, refreshConnectivity } from "./services/connectivity";
import { loadPreferences } from "./services/preferences";
import { loadQueue, enqueue, useSyncQueue, useAutoSync, countUnsynced } from "./services/syncQueue";
import AppShell from "./components/AppShell";
import LoginScreen from "./screens/LoginScreen";
import WarehouseSelectScreen from "./screens/WarehouseSelectScreen";
import HomeScreen from "./screens/HomeScreen";
import MoveSelectScreen from "./screens/MoveSelectScreen";
import MoveConfigScreen from "./screens/MoveConfigScreen";
import ScanHandheldScreen from "./screens/ScanHandheldScreen";
import ScanCameraScreen from "./screens/ScanCameraScreen";
import ManualCaptureScreen from "./screens/ManualCaptureScreen";
import MovementDraftScreen from "./screens/MovementDraftScreen";
import MovementReviewScreen from "./screens/MovementReviewScreen";
import MovementResultScreen from "./screens/MovementResultScreen";
import InventoryScreen from "./screens/InventoryScreen";
import InventoryDetailScreen from "./screens/InventoryDetailScreen";
import PendingScreen from "./screens/PendingScreen";
import HistoryScreen from "./screens/HistoryScreen";
import MoreScreen from "./screens/MoreScreen";
import ModulesScreen from "./screens/ModulesScreen";
import ComponentsScreen from "./screens/ComponentsScreen";

import type { User, Warehouse, Screen, MoveType, MovementItem, Location, ConnectionStatus, Product, ModuleInfo, MoveOutcome } from "./types";

function AppInner() {
  const insets = useSafeAreaInsets();
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [lastWarehouseId, setLastWarehouseId] = useState<string | undefined>();
  const [modules, setModules] = useState<ModuleInfo[]>([]);

  // Connectivity + offline queue (Fase 2). "Online" means the backend answers.
  const reachable = useServerReachable();
  const queue = useSyncQueue(user?.id);
  const unsyncedCount = countUnsynced(queue);
  useAutoSync(token, user?.id, reachable);
  const connection: ConnectionStatus =
    reachable === false ? "offline" : unsyncedCount > 0 ? "pending" : "online";

  // Movement state
  const [moveType, setMoveType] = useState<MoveType>("entry");
  const [moveOrigin, setMoveOrigin] = useState<Location | undefined>();
  const [moveDest, setMoveDest] = useState<Location | undefined>();
  const [moveReference, setMoveReference] = useState<string | undefined>();
  const [moveItems, setMoveItems] = useState<MovementItem[]>([]);

  // Inventory detail
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [moveOutcome, setMoveOutcome] = useState<MoveOutcome | null>(null);

  // Restore persisted state once: preferences, offline queue and the last
  // session (so a restart — often offline — doesn't force a new login).
  useEffect(() => {
    (async () => {
      await Promise.all([loadPreferences(), loadQueue()]);
      const session = await restoreSession().catch(() => null);
      if (session) {
        setUser(session.user);
        setToken(session.token);
        if (session.warehouse) {
          setWarehouse(session.warehouse);
          setLastWarehouseId(session.warehouse.id);
          setScreen("home");
        } else {
          setScreen("warehouse-select");
        }
      }
      setBooting(false);
    })();
  }, []);

  const handleLogout = useCallback(() => {
    clearStoredToken();
    clearCache().catch(() => {});
    setUser(null);
    setToken(null);
    setWarehouse(null);
    setScreen("login");
  }, []);

  // Expired/invalid token on any request → back to login. Queued movements
  // stay on the device and sync again once the same user logs back in.
  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
    return () => setUnauthorizedHandler(null);
  }, [handleLogout]);

  // EPIC-6 "Módulos Personalizables" — load once we have a session (and
  // again when the server becomes reachable, in case the first try failed).
  useEffect(() => {
    if (!token) { setModules([]); return; }
    if (reachable === false) return;
    fetchModules(token).then(setModules).catch(() => {});
  }, [token, reachable]);

  // Keep the device's catalog/locations copy fresh while online (offline scanning).
  useEffect(() => {
    if (!token || !warehouse || reachable === false) return;
    warmOfflineCache(token, warehouse.id).catch(() => {});
  }, [token, warehouse, reachable]);

  function handleLogin(u: User, t: string) {
    setUser(u);
    setToken(t);
    setScreen("warehouse-select");
  }

  function handleSelectWarehouse(w: Warehouse) {
    setWarehouse(w);
    setLastWarehouseId(w.id);
    rememberWarehouse(w).catch(() => {});
    setScreen("home");
  }

  function handleStartMove(type: MoveType) {
    setMoveType(type);
    setMoveItems([]);
    setMoveOrigin(undefined);
    setMoveDest(undefined);
    setMoveReference(undefined);
    setScreen("move-config");
  }

  function handleMoveConfigStart(origin?: Location, dest?: Location, ref?: string) {
    setMoveOrigin(origin);
    setMoveDest(dest);
    setMoveReference(ref);
    setScreen("scan-handheld");
  }

  function handleAddItem(item: MovementItem) {
    setMoveItems(prev => {
      // Same product + lot accumulates on one line: serials are appended,
      // non-serialized reads add to the quantity (scanning a box 3× = 3 units).
      const existing = prev.find(i => i.product.id === item.product.id && i.lot === item.lot);
      if (!existing) return [...prev, item];
      return prev.map(i => {
        if (i.id !== existing.id) return i;
        return item.product.serialized
          ? { ...i, serials: [...i.serials, ...item.serials] }
          : { ...i, quantity: i.quantity + item.quantity };
      });
    });
  }

  function handleUpdateQty(id: string, qty: number) {
    setMoveItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  }

  function handleRemoveItem(id: string) {
    setMoveItems(prev => prev.filter(i => i.id !== id));
  }

  function enqueueMove(payload: MovementPayload) {
    return enqueue({
      userId: user!.id!,
      moveType,
      warehouseName: warehouse!.name,
      reference: moveReference,
      units: moveItems.reduce((s, i) => s + (i.product.serialized ? i.serials.length : i.quantity), 0),
      payload,
    });
  }

  // Online: confirm directly so business-rule errors (stock insuficiente,
  // serie duplicada…) show up on the review screen. No signal or server down:
  // persist in the offline queue — the same clientId makes the later replay safe.
  async function handleConfirmMove() {
    if (!token || !user || !warehouse) return;
    const payload = buildMovementPayload({
      warehouseId: warehouse.id,
      type: moveType,
      reference: moveReference,
      origin: moveOrigin,
      destination: moveDest,
      items: moveItems,
    }, Crypto.randomUUID());

    if (reachable !== false) {
      try {
        const { folio } = await postMovement(token, payload);
        setMoveOutcome({ kind: "synced", folio });
        setScreen("movement-result");
        return;
      } catch (err) {
        const expired = err instanceof ApiError && err.status === 401;
        if (!isTransientError(err) && !expired) throw err;
        refreshConnectivity();
        if (expired) {
          // The unauthorized handler is already sending the user to login; keep the work.
          enqueueMove(payload);
          return;
        }
      }
    }

    const queued = enqueueMove(payload);
    setMoveOutcome({ kind: "queued", id: queued.id });
    setScreen("movement-result");
  }

  function handleNewMovement() {
    setMoveItems([]);
    setScreen("move-select");
  }

  if (booting) {
    return (
      <View className="flex-1 bg-[#0F172A] items-center justify-center">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (screen === "login") {
    return (
      <View className="flex-1 bg-[#F8FAFC]">
        <View style={{ height: insets.top, backgroundColor: "#0F172A" }} />
        <LoginScreen onLogin={handleLogin} />
      </View>
    );
  }

  if (screen === "warehouse-select" && token) {
    return (
      <View className="flex-1 bg-[#F8FAFC]">
        <View style={{ height: insets.top, backgroundColor: "#0F172A" }} />
        <WarehouseSelectScreen
          token={token}
          lastWarehouseId={lastWarehouseId}
          onSelect={handleSelectWarehouse}
        />
      </View>
    );
  }

  if (screen === "scan-camera" && token) {
    return (
      <View className="flex-1 bg-black">
        <View style={{ height: insets.top, backgroundColor: "#000000" }} />
        <ScanCameraScreen
          token={token}
          items={moveItems}
          onAddItem={handleAddItem}
          onClose={() => setScreen("scan-handheld")}
          onManual={() => setScreen("manual-capture")}
          onHandheld={() => setScreen("scan-handheld")}
        />
      </View>
    );
  }

  const showBottomNav = ["home", "inventory", "more", "move-select"].includes(screen);

  const HEADER_CONFIG: Partial<Record<Screen, { title: string; onBack?: () => void }>> = {
    "home": { title: "Inicio" },
    "move-select": { title: "Operar" },
    "move-config": { title: "Nuevo movimiento", onBack: () => setScreen("move-select") },
    "scan-handheld": { title: "Escaneo de productos", onBack: () => setScreen("move-config") },
    "manual-capture": { title: "Captura manual", onBack: () => setScreen("scan-handheld") },
    "movement-draft": { title: "Revisar productos", onBack: () => setScreen("scan-handheld") },
    "movement-review": { title: "Confirmar movimiento", onBack: () => setScreen("movement-draft") },
    "movement-result": { title: "Resultado del movimiento" },
    "inventory": { title: "Inventario" },
    "inventory-detail": { title: "Detalle de producto", onBack: () => setScreen("inventory") },
    "pending": { title: "Pendientes", onBack: () => setScreen("home") },
    "history": { title: "Historial", onBack: () => setScreen("more") },
    "more": { title: "Más" },
    "modules": { title: "Módulos operativos", onBack: () => setScreen("more") },
    "components": { title: "Componentes", onBack: () => setScreen("more") },
  };
  const headerConfig = HEADER_CONFIG[screen];

  return (
    <AppShell
      screen={screen}
      user={user}
      warehouse={warehouse}
      connection={connection}
      pendingCount={unsyncedCount}
      onNavigate={setScreen}
      onConnectionPress={() => setScreen("pending")}
      showNav={showBottomNav}
      showHeader={!!headerConfig}
      title={headerConfig?.title}
      onBack={headerConfig?.onBack}
    >
        {screen === "home" && token && user && warehouse && (
          <HomeScreen
            token={token}
            user={user}
            warehouse={warehouse}
            connection={connection}
            modules={modules}
            onNavigate={s => {
              if (s === "move-select") setScreen("move-select");
              else setScreen(s);
            }}
            pendingCount={unsyncedCount}
          />
        )}

        {screen === "move-select" && (
          <MoveSelectScreen modules={modules} onSelect={handleStartMove} />
        )}

        {screen === "move-config" && token && warehouse && (
          <MoveConfigScreen
            token={token}
            warehouseId={warehouse.id}
            moveType={moveType}
            onStart={handleMoveConfigStart}
          />
        )}

        {screen === "scan-handheld" && token && (
          <ScanHandheldScreen
            token={token}
            moveType={moveType}
            items={moveItems}
            modules={modules}
            onAddItem={handleAddItem}
            onReview={() => setScreen("movement-draft")}
            onUseCamera={() => setScreen("scan-camera")}
            onManual={() => setScreen("manual-capture")}
          />
        )}

        {screen === "manual-capture" && token && (
          <ManualCaptureScreen
            token={token}
            onAdd={item => { handleAddItem(item); setScreen("scan-handheld"); }}
            onBack={() => setScreen("scan-handheld")}
          />
        )}

        {screen === "movement-draft" && (
          <MovementDraftScreen
            moveType={moveType}
            items={moveItems}
            origin={moveOrigin}
            destination={moveDest}
            onUpdateQuantity={handleUpdateQty}
            onRemoveItem={handleRemoveItem}
            onContinueScan={() => setScreen("scan-handheld")}
            onReview={() => setScreen("movement-review")}
          />
        )}

        {screen === "movement-review" && user && warehouse && (
          <MovementReviewScreen
            moveType={moveType}
            items={moveItems}
            warehouse={warehouse}
            origin={moveOrigin}
            destination={moveDest}
            reference={moveReference}
            user={user.name}
            connection={connection}
            onConfirm={handleConfirmMove}
            onEdit={() => setScreen("movement-draft")}
          />
        )}

        {screen === "movement-result" && token && moveOutcome && (
          <MovementResultScreen
            token={token}
            moveType={moveType}
            items={moveItems}
            outcome={moveOutcome}
            onNewMovement={handleNewMovement}
            onViewDetail={() => setScreen(moveOutcome.kind === "queued" ? "pending" : "history")}
          />
        )}

        {screen === "inventory" && token && (
          <InventoryScreen
            token={token}
            modules={modules}
            onViewDetail={p => { setSelectedProduct(p); setScreen("inventory-detail"); }}
            onNavigate={setScreen}
          />
        )}

        {screen === "inventory-detail" && token && selectedProduct && (
          <InventoryDetailScreen
            token={token}
            productId={selectedProduct.id}
            onBack={() => setScreen("inventory")}
          />
        )}

        {screen === "pending" && token && user && (
          <PendingScreen token={token} userId={user.id!} connection={connection} />
        )}

        {screen === "history" && token && (
          <HistoryScreen token={token} modules={modules} onBack={() => setScreen("more")} />
        )}

        {screen === "more" && user && warehouse && (
          <MoreScreen
            user={user}
            warehouse={warehouse}
            modules={modules}
            unsyncedCount={unsyncedCount}
            onNavigate={setScreen}
            onLogout={handleLogout}
            onChangeWarehouse={() => setScreen("warehouse-select")}
          />
        )}

        {screen === "modules" && token && (
          <ModulesScreen token={token} modules={modules} onModulesChange={setModules} />
        )}

        {screen === "components" && __DEV__ && (
          <ComponentsScreen onBack={() => setScreen("more")} />
        )}
    </AppShell>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppInner />
    </SafeAreaProvider>
  );
}
