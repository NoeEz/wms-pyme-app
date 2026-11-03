# WMS PyME — Portal web

Portal de monitoreo y administración (fase 3 del `../ROADMAP.md`). React 19 + Vite + TypeScript + Tailwind 4, TanStack Query, React Router, Recharts; exporta a Excel (`write-excel-file`) y PDF (`jspdf` + `jspdf-autotable`) en el navegador y genera etiquetas QR (`qrcode`).

Es un paquete aparte de la app móvil (su propio `package.json` y `node_modules`); Metro y el `tsconfig` raíz ignoran esta carpeta.

## Arranque

Con el backend corriendo (`cd ../backend && docker compose up -d --build`):

```bash
npm install
npm run dev          # http://localhost:5173 — /api se redirige a http://localhost:4000
```

`API_PROXY_TARGET=http://otra-ip:4000 npm run dev` apunta el proxy a otra API. Para producción, `npm run build` deja el sitio en `dist/`; sírvelo junto a la API (mismo dominio, `/api`) o define `VITE_API_URL` al compilar.

Login: **Empresa** (código, p. ej. `nova`) + correo + contraseña. Usuarios demo en `../backend/README.md`.

## Qué ve cada rol

| Sección | Operador | Supervisor | Admin | Cliente 3PL |
|---|---|---|---|---|
| Tablero, Inventario, Movimientos, Reportes | ✓ | ✓ | ✓ | ✓ (solo sus productos, sin datos de personal) |
| Conteos físicos, Etiquetas QR, Productos, Ubicaciones, Bitácora | | ✓ | ✓ | |
| Almacenes, Clientes 3PL, Usuarios, Empresa (código de login y módulos) | | | ✓ | |

El menú y las rutas usan las mismas reglas (`can` en `src/lib/auth.tsx`); la API las vuelve a aplicar.

## Estructura

- `src/lib/` — cliente de la API (`api.ts`), sesión y permisos (`auth.tsx`), consultas compartidas y filtro de almacén (`data.tsx`), formatos es-MX (`format.ts`), exportación (`export.ts`), tipos (`types.ts`).
- `src/components/` — kit de UI (`ui.tsx`), iconos, layout con menú por rol, gráficas (`charts.tsx`), botones de exportación.
- `src/pages/` — una página por ruta, cargadas bajo demanda (`React.lazy`).

## Notas

- **Tablero:** se actualiza solo cada 60 s. KPIs y definiciones en `../backend/README.md` (WERC / SCOR).
- **Gráficas:** paleta de tipos de movimiento validada (contraste, daltonismo) con el validador de la skill de visualización; cada gráfica tiene vista de tabla.
- **Conteos:** por defecto a ciegas (no muestra la existencia del sistema), práctica estándar para no sesgar al contador.
- **Etiquetas:** productos `WMSPYME|v1|sku=…[|lot=…]` (las lee la app); ubicaciones `WMSPYME|v1|loc=…`, reservado para cuando la app escanee ubicaciones (hoy responde "Código sin producto identificado").
