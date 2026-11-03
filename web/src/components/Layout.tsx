import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { can, useAuth, useSession } from "../lib/auth";
import { useWarehouseFilter, useWarehouses } from "../lib/data";
import { ROLE_LABEL } from "../lib/format";
import type { Role } from "../lib/types";
import { Icon } from "./Icon";
import { Loading } from "./ui";

interface NavItem { to: string; label: string; icon: string; allow: (r: Role) => boolean }

const ALL = () => true;

// Single source of truth for the menu; routes are guarded with the same rules.
export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Monitoreo",
    items: [
      { to: "/", label: "Tablero", icon: "dashboard", allow: ALL },
      { to: "/inventario", label: "Inventario", icon: "inventory", allow: ALL },
      { to: "/movimientos", label: "Movimientos", icon: "movements", allow: ALL },
      { to: "/reportes", label: "Reportes", icon: "reports", allow: ALL },
    ],
  },
  {
    title: "Operación",
    items: [
      { to: "/conteos", label: "Conteos físicos", icon: "count", allow: can.count },
      { to: "/etiquetas", label: "Etiquetas QR", icon: "qr", allow: can.manageCatalog },
    ],
  },
  {
    title: "Administración",
    items: [
      { to: "/productos", label: "Productos", icon: "catalog", allow: can.manageCatalog },
      { to: "/ubicaciones", label: "Ubicaciones", icon: "location", allow: can.manageCatalog },
      { to: "/almacenes", label: "Almacenes", icon: "warehouse", allow: can.admin },
      { to: "/clientes", label: "Clientes 3PL", icon: "customers", allow: can.admin },
      { to: "/usuarios", label: "Usuarios", icon: "users", allow: can.admin },
      { to: "/bitacora", label: "Bitácora", icon: "audit", allow: can.audit },
      { to: "/empresa", label: "Empresa", icon: "settings", allow: can.admin },
    ],
  },
];

function WarehousePicker() {
  const { warehouseId, setWarehouseId } = useWarehouseFilter();
  const { data: warehouses } = useWarehouses();
  // Forget a stored warehouse that no longer exists for this company.
  useEffect(() => {
    if (warehouses && warehouseId && !warehouses.some(w => w._id === warehouseId)) setWarehouseId("");
  }, [warehouses, warehouseId, setWarehouseId]);
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <Icon name="warehouse" size={18} className="text-slate-400" />
      <span className="sr-only">Almacén</span>
      <select
        value={warehouseId}
        onChange={e => setWarehouseId(e.target.value)}
        className="h-9 max-w-44 rounded-lg sm:max-w-56 border border-slate-300 bg-white px-2 text-sm focus:border-indigo-500 focus:outline-none"
      >
        <option value="">Todos los almacenes</option>
        {warehouses?.map(w => <option key={w._id} value={w._id}>{w.name}{w.state === "inactive" ? " (inactivo)" : ""}</option>)}
      </select>
    </label>
  );
}

export function Layout() {
  const session = useSession();
  const { logout } = useAuth();
  const role = session.user.role;
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-base font-extrabold text-white">W</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">WMS <span className="font-light text-slate-400">PyME</span></p>
            <p className="truncate text-xs text-slate-400" title={session.company.name}>{session.company.name}</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_SECTIONS.map(section => {
            const items = section.items.filter(i => i.allow(role));
            if (!items.length) return null;
            return (
              <div key={section.title} className="mt-4">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
                {items.map(item => (
                  <NavLink
                    key={item.to} to={item.to} end={item.to === "/"}
                    className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-slate-800 font-medium text-white" : "hover:bg-slate-800/60 hover:text-white"}`}
                  >
                    <Icon name={item.icon} size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 px-4 py-4">
          <p className="truncate text-sm font-medium text-white">{session.user.name}</p>
          <p className="truncate text-xs text-slate-400">
            {ROLE_LABEL[role]}{session.customer ? ` · ${session.customer.name}` : ""}
          </p>
          <button onClick={logout} className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white">
            <Icon name="logout" size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>
      {menuOpen && <div className="no-print fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMenuOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMenuOpen(true)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Abrir menú">
            <Icon name="menu" />
          </button>
          <div className="flex-1" />
          <WarehousePicker />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Suspense fallback={<Loading />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
