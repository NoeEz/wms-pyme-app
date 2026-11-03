import { lazy, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { can, useAuth } from "./lib/auth";
import { WarehouseFilterProvider } from "./lib/data";
import type { Role } from "./lib/types";
import { Layout } from "./components/Layout";
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

function Guard({ allow, children }: { allow: (r: Role) => boolean; children: ReactNode }) {
  const { session } = useAuth();
  return session && allow(session.user.role) ? <>{children}</> : <Navigate to="/" replace />;
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
            <Route index element={<DashboardPage />} />
            <Route path="inventario" element={<InventoryPage />} />
            <Route path="movimientos" element={<MovementsPage />} />
            <Route path="reportes" element={<ReportsPage />} />
            <Route path="conteos" element={<Guard allow={can.count}><CountsPage /></Guard>} />
            <Route path="etiquetas" element={<Guard allow={can.manageCatalog}><LabelsPage /></Guard>} />
            <Route path="productos" element={<Guard allow={can.manageCatalog}><ProductsPage /></Guard>} />
            <Route path="ubicaciones" element={<Guard allow={can.manageCatalog}><LocationsPage /></Guard>} />
            <Route path="almacenes" element={<Guard allow={can.admin}><WarehousesPage /></Guard>} />
            <Route path="clientes" element={<Guard allow={can.admin}><CustomersPage /></Guard>} />
            <Route path="usuarios" element={<Guard allow={can.admin}><UsersPage /></Guard>} />
            <Route path="bitacora" element={<Guard allow={can.audit}><AuditPage /></Guard>} />
            <Route path="empresa" element={<Guard allow={can.admin}><CompanyPage /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WarehouseFilterProvider>
  );
}
