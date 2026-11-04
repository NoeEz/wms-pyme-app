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
    <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
      <Icon name="warehouse" size={18} className="shrink-0 text-indigo-600" />
      <span className="sr-only text-xs font-semibold text-slate-500 sm:not-sr-only">Almacén</span>
      <select
        value={warehouseId}
        onChange={e => setWarehouseId(e.target.value)}
        className="h-9 w-full min-w-0 max-w-44 rounded-lg border border-transparent bg-transparent px-1 text-sm font-medium text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 sm:max-w-56"
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
    <div className="flex min-h-full bg-slate-50">
      {/* Sidebar */}
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col border-r border-white/5 bg-slate-950 text-slate-200 shadow-xl shadow-slate-950/10 transition-transform motion-reduce:transition-none lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex min-h-20 shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-indigo-600 text-lg font-bold text-white shadow-sm">W</div>
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight text-white">WMS <span className="font-normal text-indigo-200">PyME</span></p>
            <p className="mt-1 truncate text-xs leading-relaxed text-slate-200" title={session.company.name}>{session.company.name}</p>
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          {NAV_SECTIONS.map(section => {
            const items = section.items.filter(i => i.allow(role));
            if (!items.length) return null;
            return (
              <div key={section.title} className="mt-4">
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200/80">{section.title}</p>
                {items.map(item => (
                  <NavLink
                    key={item.to} to={item.to} end={item.to === "/"}
                    className={({ isActive }) => `mb-0.5 flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors focus-visible:outline-white motion-reduce:transition-none ${isActive ? "border-white/10 bg-indigo-600 font-semibold text-white shadow-sm" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}
                  >
                    <Icon name={item.icon} size={18} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-white/10 bg-white/[0.03] px-5 py-4">
          <p className="truncate text-sm font-medium text-white">{session.user.name}</p>
          <p className="mt-1 truncate text-xs leading-relaxed text-slate-200">
            {ROLE_LABEL[role]}{session.customer ? ` · ${session.customer.name}` : ""}
          </p>
          <button onClick={logout} className="mt-3 flex min-h-10 w-full items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-white">
            <Icon name="logout" size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>
      {menuOpen && <div className="no-print fixed inset-0 z-30 bg-slate-950/55 lg:hidden" onClick={() => setMenuOpen(false)} />}

      {/* Main */}
      <div className="portal-main flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
          <button onClick={() => setMenuOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden" aria-label="Abrir menú">
            <Icon name="menu" />
          </button>
          <div className="flex-1" />
          <WarehousePicker />
        </header>
        <main className="portal-content mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-6 lg:px-8">
          <Suspense fallback={<Loading />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
