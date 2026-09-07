import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { clearStoredToken } from "./services/auth";
import { createMovement } from "./services/movements";
import { fetchModules } from "./services/modules";
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

import type { User, Warehouse, Screen, MoveType, MovementItem, Location, ConnectionStatus, Product, ModuleInfo } from "./types";

function AppInner() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [lastWarehouseId, setLastWarehouseId] = useState<string | undefined>();
  const [connection, setConnection] = useState<ConnectionStatus>("online");
  const [modules, setModules] = useState<ModuleInfo[]>([]);

  // Movement state
  const [moveType, setMoveType] = useState<MoveType>("entry");
  const [moveOrigin, setMoveOrigin] = useState<Location | undefined>();
  const [moveDest, setMoveDest] = useState<Location | undefined>();
  const [moveReference, setMoveReference] = useState<string | undefined>();
  const [moveItems, setMoveItems] = useState<MovementItem[]>([]);

  // Inventory detail
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [lastFolio, setLastFolio] = useState<string | undefined>();

  // EPIC-6 "Módulos Personalizables" — load once we have a session.
  useEffect(() => {
    if (!token) { setModules([]); return; }
    fetchModules(token).then(setModules).catch(() => setModules([]));
  }, [token]);

  function handleLogin(u: User, t: string) {
    setUser(u);
    setToken(t);
    setScreen("warehouse-select");
  }

  function handleSelectWarehouse(w: Warehouse) {
    setWarehouse(w);
    setLastWarehouseId(w.id);
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
      // Merge serialized items for same product
      if (item.product.serialized && item.serials.length > 0) {
        const existing = prev.find(i => i.product.id === item.product.id && i.lot === item.lot);
        if (existing) {
          return prev.map(i =>
            i.id === existing.id
              ? { ...i, serials: [...i.serials, ...item.serials] }
              : i
          );
        }
      }
      return [...prev, item];
    });
  }

  function handleUpdateQty(id: string, qty: number) {
    setMoveItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  }

  function handleRemoveItem(id: string) {
    setMoveItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleConfirmMove() {
    // Offline/pending stays a local simulation — real offline queueing isn't
    // implemented yet (see backend/README.md "Pendiente").
    if (connection === "online" && token && warehouse) {
      const result = await createMovement(token, {
        warehouseId: warehouse.id,
        type: moveType,
        reference: moveReference,
        origin: moveOrigin,
        destination: moveDest,
        items: moveItems,
      });
      setLastFolio(result.folio);
    } else {
      setLastFolio(undefined);
    }
    setScreen("movement-result");
  }

  function handleNewMovement() {
    setMoveItems([]);
    setScreen("move-select");
  }

  function handleLogout() {
    clearStoredToken();
    setUser(null);
    setToken(null);
    setWarehouse(null);
    setScreen("login");
  }

  // Cycle connection status for demo
  function cycleConnection() {
    setConnection(c =>
      c === "online" ? "offline" :
      c === "offline" ? "pending" : "online"
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
      onNavigate={setScreen}
      onCycleConnection={cycleConnection}
      showNav={showBottomNav}
      showHeader={!!headerConfig}
      title={headerConfig?.title}
      onBack={headerConfig?.onBack}
    >
        {screen === "home" && user && warehouse && (
          <HomeScreen
            user={user}
            warehouse={warehouse}
            connection={connection}
            modules={modules}
            onNavigate={s => {
              if (s === "move-select") setScreen("move-select");
              else setScreen(s);
            }}
            pendingCount={connection === "pending" ? 1 : 0}
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

        {screen === "movement-result" && (
          <MovementResultScreen
            moveType={moveType}
            items={moveItems}
            connection={connection}
            folio={lastFolio}
            onNewMovement={handleNewMovement}
            onViewDetail={() => setScreen("history")}
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

        {screen === "pending" && (
          <PendingScreen onBack={() => setScreen("home")} />
        )}

        {screen === "history" && token && (
          <HistoryScreen token={token} modules={modules} onBack={() => setScreen("more")} />
        )}

        {screen === "more" && user && warehouse && (
          <MoreScreen
            user={user}
            warehouse={warehouse}
            modules={modules}
            onNavigate={setScreen}
            onLogout={handleLogout}
            onChangeWarehouse={() => setScreen("warehouse-select")}
          />
        )}

        {screen === "modules" && token && (
          <ModulesScreen token={token} modules={modules} onModulesChange={setModules} />
        )}

        {screen === "components" && (
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
