import { lazy, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { hasPermission, useAuth } from "./lib/auth";
import { WarehouseFilterProvider } from "./lib/data";
import { Layout, ROUTE_PERMS } from "./components/Layout";
import LoginPage from "./pages/LoginPage";

// One chunk per page: charts, Excel/PDF and QR code load only where used.
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const MovementsPage = lazy(() => import("./pages/MovementsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const CountsPage = lazy(() => import("./pages/CountsPage"));
const LabelsPage = lazy(() => import("./pages/LabelsPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const LocationsPage = lazy(() => import("./pages/LocationsPage"));
const WarehousesPage = lazy(() => import("./pages/WarehousesPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const AuditPage = lazy(() => import("./pages/AuditPage"));
const CompanyPage = lazy(() => import("./pages/CompanyPage"));
const ModulesPage = lazy(() => import("./pages/ModulesPage"));
const RolesPage = lazy(() => import("./pages/RolesPage"));
const GroupsPage = lazy(() => import("./pages/GroupsPage"));

/** Same permissions as the menu entry for `path` (Layout.tsx). */
function Guard({ path, children }: { path: string; children: ReactNode }) {
  const { session } = useAuth();
  const perms = ROUTE_PERMS[path] ?? [];
  if (!perms.length || hasPermission(session, ...perms)) return <>{children}</>;
  // Without the dashboard, land on movements (every user may see its own).
  return <Navigate to={path === "/" ? "/movimientos" : "/"} replace />;
}

export default function App() {
  const { session } = useAuth();
  if (!session) return <LoginPage />;
  return (
    // Remount everything on account switch so no cached data leaks across sessions.
    <WarehouseFilterProvider key={`${session.company.id}:${session.user.id}`}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Guard path="/"><DashboardPage /></Guard>} />
            <Route path="inventario" element={<Guard path="/inventario"><InventoryPage /></Guard>} />
            <Route path="movimientos" element={<MovementsPage />} />
            <Route path="reportes" element={<Guard path="/reportes"><ReportsPage /></Guard>} />
            <Route path="conteos" element={<Guard path="/conteos"><CountsPage /></Guard>} />
            <Route path="etiquetas" element={<Guard path="/etiquetas"><LabelsPage /></Guard>} />
            <Route path="productos" element={<Guard path="/productos"><ProductsPage /></Guard>} />
            <Route path="ubicaciones" element={<Guard path="/ubicaciones"><LocationsPage /></Guard>} />
            <Route path="almacenes" element={<Guard path="/almacenes"><WarehousesPage /></Guard>} />
            <Route path="clientes" element={<Guard path="/clientes"><CustomersPage /></Guard>} />
            <Route path="bitacora" element={<Guard path="/bitacora"><AuditPage /></Guard>} />
            <Route path="modulos" element={<Guard path="/modulos"><ModulesPage /></Guard>} />
            <Route path="roles" element={<Guard path="/roles"><RolesPage /></Guard>} />
            <Route path="grupos" element={<Guard path="/grupos"><GroupsPage /></Guard>} />
            <Route path="usuarios" element={<Guard path="/usuarios"><UsersPage /></Guard>} />
            <Route path="empresa" element={<Guard path="/empresa"><CompanyPage /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WarehouseFilterProvider>
  );
}
