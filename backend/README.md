# WMS PyME — Backend

API REST real (Node.js + Express + TypeScript + MongoDB + JWT) para el proyecto de tesina WMS-PyME. Implementa autenticación, catálogo de almacenes/productos/ubicaciones, inventario por ubicación y movimientos (entrada/salida/transferencia) con las reglas de negocio del brief (`../BRIEF_IA_MVP_WMS_PYME.md`).

## Arranque

Todo el backend (API + MongoDB) corre en Docker. Un solo comando:

```bash
docker compose up -d --build
```

Esto levanta MongoDB (replica set de un solo nodo, para transacciones) en `:27017`, espera a que esté sana, construye y levanta la API en `:4000`, y **siembra los datos demo automáticamente la primera vez** (si la base está vacía) — no hace falta correr `npm install` ni `npm run seed` a mano. En arranques posteriores, si ya hay datos, no vuelve a sembrar. La siembra incluye 30 días de historial (`src/scripts/seedHistory.ts`: entradas, salidas, transferencias, algunos movimientos sincronizados tarde y dos conteos físicos) para que el tablero del portal tenga datos; las pruebas agregan sus propios registros, así que después de correrlas conviene resembrar (`docker compose exec api node -e "require('./dist/db/connect').connectDB().then(()=>require('./dist/scripts/seed').runSeed()).then(()=>process.exit(0))"`) o `docker compose down -v`.

```bash
docker compose logs -f api   # ver logs en vivo
docker compose down          # apagar (conserva los datos)
docker compose down -v       # apagar y borrar también los datos (vuelve a sembrar la próxima vez)
```

### Desarrollo local sin Docker para la API (opcional)

Si preferís correr la API directo en tu máquina (hot-reload más rápido) en vez de reconstruir la imagen en cada cambio, podés seguir usando Mongo en Docker y la API fuera:

```bash
docker compose up -d mongo   # solo la base de datos
npm install
npm run dev                   # tsx watch — recarga en caliente, usa .env (localhost:27017)
```

El login pide **empresa** (código/slug), correo y contraseña. Usuarios demo, contraseña `demo1234` para todos:

| Empresa | Correo | Rol |
|---|---|---|
| `nova` | `maria.lopez@nova.mx` | operador |
| `nova` | `carlos.ruiz@nova.mx` | supervisor |
| `nova` | `admin@nova.mx` | administrador |
| `nova` | `compras@refvalle.mx` | cliente 3PL (Refaccionaria del Valle, solo ve su producto `FIL-AC-90`) |
| `alfa` | `admin@nova.mx` | administrador de otra empresa (mismo correo a propósito: el correo es único por empresa) |

## Endpoints

Todos menos `/auth/login` requieren `Authorization: Bearer <token>`.

- `POST /api/auth/login` `{ company, email, password }` → `{ token, user, company, customer, access }` (`company` es el slug; `customer` solo para rol `client`; `access = { permissions, warehouseIds, modules }` son los permisos efectivos, ver «Módulos y permisos»). Empresa, correo o contraseña incorrectos dan el mismo `401 invalid_credentials`.
- `GET /api/auth/me` → `{ user, company, customer, access }`
- `GET /api/warehouses`
- `GET /api/products?q=`
- `GET /api/products/:id` → producto + existencias por ubicación + últimos movimientos
- `GET /api/inventory?warehouseId=&locationId=&lowStock=true`
- `GET /api/inventory/locations?warehouseId=`
- `POST /api/movements` `{ warehouseId, destinationWarehouseId?, type: inbound|outbound|transfer, reference?, clientId?, capturedAt?, lines: [{ productId, quantity, sourceLocationId?, destinationLocationId?, lot?, serial? }] }` — valida permiso del tipo (`inbound.create`…) y acceso al almacén, cantidad>0, stock suficiente, origen≠destino, serie no duplicada, ubicación perteneciente al almacén, módulo habilitado y su configuración (referencia obligatoria); actualiza `StockBalance` de forma atómica (transacción Mongo) y genera folio.
  - **Transferencia entre almacenes** (§4.5.6): con `destinationWarehouseId`, los orígenes son del `warehouseId` y los destinos del almacén destino; se descuenta y se abona en la misma transacción. Se puede apagar con la opción `allowInterWarehouse` del módulo de transferencias (`422 inter_warehouse_disabled`).
  - **Idempotente por `clientId`** (UUID que genera la app por movimiento): si ya existe un movimiento con ese `clientId` en la empresa, responde `200 { movement, replayed: true }` con el original sin volver a aplicarlo; si es nuevo, `201 { movement, replayed: false }`. Un índice único `(companyId, clientId)` cubre los reintentos simultáneos. Así la cola offline de la app puede reintentar sin miedo a duplicar.
  - `capturedAt` (ISO) es cuándo se capturó en el dispositivo; difiere de `createdAt` en movimientos sincronizados tarde.
  - Errores: `400 validation_error` (cuerpo inválido), `403 module_disabled` / `forbidden` / `warehouse_forbidden`, `422` con el código de la regla (`insufficient_stock`, `duplicate_serial`, `same_location`, `location_outside_warehouse`, `reference_required`…).
- `GET /api/movements?warehouseId=&status=` — sin `history.view`, cada quien ve solo los suyos; siempre limitado a los almacenes del usuario (incluye transferencias que llegan a ellos).
- `GET /api/movements/:id`

### Multi-empresa y clientes 3PL

- Toda ruta filtra por la empresa del token (`src/services/scope.ts`): un almacén, ubicación o producto de otra empresa responde `404` (`warehouse_not_found`, `location_not_found`, `not_found`) o `422 product_not_found` al moverlo. Un ID mal formado es `400 invalid_id`.
- Roles: `operator`, `supervisor`, `admin` y `client`. Un usuario `client` pertenece a un `Customer` (cliente 3PL cuya mercancía guarda la empresa); solo ve los productos con ese `customerId`, sus existencias y, de cada movimiento, solo sus líneas. No puede crear movimientos (`403 forbidden`) y la app móvil no lo deja entrar: usa el portal web.
- `Product.cost` (opcional) es el costo unitario para valuar inventario.
- Bases creadas antes de este cambio: al arrancar, la API le asigna un slug a cada empresa sin él, derivado del nombre (`Industrias Nova PyME` → `industrias-nova-pyme`, se ve en el log), y quita el índice único global de correo.

### Módulos y permisos (Tesina §4.5)

**Módulos** (`src/config/modules.ts`): uno por cada módulo funcional de la especificación — productos y catálogos, almacenes y ubicaciones, recepción y entradas, salidas y despachos, transferencias, inventarios y ajustes, trazabilidad y auditoría, monitoreo y reportes, captura por cámara y administración. Los **centrales** (productos, almacenes, trazabilidad, administración) siempre están activos; los demás tienen **dependencias** (`422 module_dependency` si una combinación las rompe) y **configuración** por empresa:

| Módulo | Opciones |
|---|---|
| Productos | `requireBarcode` — código de barras/QR obligatorio (`422 barcode_required`); `requireCost` — costo unitario obligatorio (`422 cost_required`); `defaultLowStockThreshold` — stock mínimo para productos nuevos que no lo indican |
| Almacenes | `blockInactiveWarehouses` (sí por omisión) — un almacén inactivo no admite movimientos ni conteos (`422 warehouse_inactive`) |
| Entradas | `requireReference`; `requireLot` — lote obligatorio en productos por lote (`422 lot_required`); `maxQuantityPerLine` (`422 quantity_limit`, 0 = sin límite) |
| Salidas | `requireReference`; `protectMinimumStock` — impide dejar la existencia total del producto bajo su mínimo (`422 below_minimum`); `maxQuantityPerLine` |
| Transferencias | `allowInterWarehouse`; `requireReference`; `maxQuantityPerLine` |
| Inventarios y ajustes | `requireApproval` + `approvalThreshold` (ajustes críticos autorizados por **otro** usuario: `POST /api/counts/:id/approve` o `/reject` con motivo; quien contó no puede autorizarse, `422 same_user`); `requireCountNotes` — motivo obligatorio si el conteo difiere (`422 notes_required`); `blindCountDefault` — conteo a ciegas por omisión en el portal |
| Trazabilidad | `logLogins`, `logDenied` — registrar inicios de sesión y accesos denegados en la bitácora |
| Monitoreo y reportes | `allowExport`; `defaultPeriodDays` — periodo por omisión del tablero; `slowMovingDays` — días sin salidas para «sin movimiento» |
| Captura por cámara | `qrOnly` — la cámara de la app lee solo QR (etiquetas WMS) |
| Administración | `minPasswordLength` (8–64, `422 password_too_short`); `sessionHours` — duración del token (1–72 h) |

Apagar un módulo oculta y bloquea sus operaciones (`403 module_disabled`) sin borrar datos ni invalidar movimientos confirmados.

**Permisos (RBAC)** (`src/config/permissions.ts`, evaluación en `src/services/access.ts`): en cada solicitud la API vuelve a leer al usuario y calcula sus permisos efectivos = su **rol base** (operador/supervisor, editables por empresa) + **roles adicionales** personalizados + roles de sus **grupos** + **excepciones individuales** «conceder», menos las excepciones «denegar» y lo que pertenezca a módulos apagados. Denegación predeterminada: lo que nadie concede no se puede. Un usuario desactivado pierde el acceso en la siguiente solicitud aunque su token siga vigente. El **alcance por almacén** es la unión de los almacenes del usuario y los de sus grupos (vacío = todos) y se aplica también a inventario, tablero y reportes.

**Facultades exclusivas del administrador** (`admin.modules`, `admin.roles`, `admin.users`, `admin.customers`, `admin.company`): crear y configurar módulos, roles, grupos, usuarios y excepciones. No se pueden poner en un rol personalizado, un grupo ni una excepción (`422 reserved_permission`); el rol Administrador no se edita (`422 role_locked`).

| Ruta | Permiso | Qué |
|---|---|---|
| `GET /api/modules` | todos | Módulos con `enabled`, `core`, dependencias, `settingsSchema` y `settings` |
| `PATCH /api/modules` `{ enabledModules }` | `admin.modules` | Qué módulos están activos |
| `PATCH /api/modules/:key/settings` `{ settings }` | `admin.modules` | Configuración del módulo (validada contra su esquema, auditada) |
| `GET /api/roles`, `GET /api/roles/catalog` | `admin.roles` / `admin.users` | Roles con conteo de usuarios y grupos; catálogo de módulos y permisos |
| `POST /api/roles`, `PATCH /api/roles/:id` | `admin.roles` | Roles personalizados `{ name, description, permissions, active }`; de los predeterminados solo se editan permisos y descripción |
| `GET/POST /api/groups`, `PATCH /api/groups/:id` | `admin.roles` | Grupos `{ name, description, memberIds, roleIds, warehouseIds, active }` |
| `GET /api/users/:id/access` | `admin.users` | Permisos efectivos de un usuario y de dónde viene cada uno |
| `POST /api/users/:id/overrides` `{ permission, effect: allow\|deny, reason }` | `admin.users` | Excepción individual con justificación obligatoria (≥ 5 caracteres); queda en la bitácora |
| `POST /api/users/:id/overrides/remove` `{ permission, reason }` | `admin.users` | Quitar una excepción (también justificado) |

La bitácora registra además **inicios de sesión** (`action: "login"`) y **accesos denegados** (`action: "denied"`, con la ruta intentada).

### API del portal web (fase 3)

Permisos por omisión de los roles predeterminados: **admin** = todo; **supervisor** = catálogo de productos y ubicaciones, conteos y autorización de ajustes, historial, bitácora y exportación; **operador** = entradas, salidas, transferencias, consulta y tablero; **client** = lectura de lo suyo. Cada ruta exige un permiso (no un rol), así que el administrador puede ajustar quién hace qué. Toda alta o cambio queda en la bitácora con valores antes/después. No hay borrados: se desactiva (`active: false`, o `state: "inactive"` en almacenes), y no se puede desactivar un producto o ubicación con existencias (`422 product_has_stock` / `location_has_stock`) ni cambiar el seguimiento lote/serie de un producto con existencias (`422 tracking_locked`). Códigos repetidos (SKU, ubicación, correo, slug) dan `409 duplicate`.

| Ruta | Quién | Qué |
|---|---|---|
| `GET/PATCH /api/company` | todos / `admin.company` | Nombre y código de login (`slug`) |
| `POST /api/warehouses`, `PATCH /api/warehouses/:id` | `warehouses.manage` | Almacenes |
| `GET/POST /api/locations`, `PATCH /api/locations/:id` | todos / `locations.manage` | Ubicaciones (`?warehouseId=&includeInactive=true`) |
| `POST /api/products`, `PATCH /api/products/:id` | `products.manage` | Productos (`cost`, `customerId`, `active`); `GET ?includeInactive=true` |
| `GET/POST /api/customers`, `PATCH /api/customers/:id` | personal / `admin.customers` | Clientes 3PL; desactivar uno bloquea el login de sus usuarios (`403 customer_inactive`) |
| `GET/POST /api/users`, `PATCH /api/users/:id` | `admin.users` | Usuarios `{ …, roleIds, warehouseIds }`; contraseña ≥ 8; un admin no puede cambiar su propio rol ni desactivarse |
| `GET /api/audit` | `audit.view` | Bitácora (`?entity=&action=&userId=&entityId=&from=&to=&before=&limit=`) |
| `GET/POST /api/counts` | `inventory.count` (`GET` también `inventory.approve`) | Conteo físico de una ubicación `{ warehouseId, locationId, lines: [{ productId, counted }], notes? }`: fija la existencia contada y, si hay diferencias, crea un movimiento `adjustment` (folio `AJU-…`) — o queda `pending` si es un ajuste crítico (ver arriba). Cada línea guarda saldo esperado, saldo anterior al aplicar (`before`) y contado. La app no puede enviar `adjustment` a `POST /movements` y no los muestra en su historial |
| `POST /api/counts/:id/approve`, `/reject` `{ note? }` | `inventory.approve` | Autorizar o rechazar (motivo obligatorio) un ajuste crítico de otro usuario |
| `GET /api/dashboard/overview` | `reports.view` | KPIs del periodo (ver abajo) |
| `GET /api/dashboard/stock` | `reports.view` | Salud por producto: existencia, valor, días de inventario, último movimiento, estado `stockout`/`low`/`slow`/`ok` (`?days=30`) |
| `GET /api/reports/kardex?productId=` | `reports.view` | Kardex con saldo inicial, entradas, salidas y saldo corrido |
| `GET /api/reports/movements` | `reports.view` | Una fila por línea de movimiento (`?type=`), máx. 5000 movimientos |
| `GET /api/reports/stock-by-location` | `reports.view` | Existencias por ubicación, valuadas |

Dashboard y reportes aceptan `warehouseId`, `from`/`to` (ISO) y `tzOffset` (minutos de `Date#getTimezoneOffset()`, 360 en CDMX) para agrupar por día local; periodo por defecto: últimos 30 días. `GET /api/movements` acepta además `type`, `from`, `to` y `limit` (≤ 200).

**KPIs de `/dashboard/overview`** (definiciones de WERC DC Measures y SCOR):
- `stock`: unidades, SKUs con existencia, valor (con `cost`), productos en stock bajo y agotados, ubicaciones ocupadas.
- `movements`: totales por tipo (movimientos, líneas, unidades) y serie diaria.
- `operators`: productividad por usuario (líneas y unidades); `null` para clientes 3PL.
- `sync`: retraso entre captura en el dispositivo y registro en el servidor (promedio, p95, máximo, cuántos llegaron con más de 15 min).
- `accuracy`: **precisión de inventario por ubicación** (WERC: conteos sin diferencia ÷ conteos) y por línea, de los conteos del periodo; `null` para clientes.
- `flow`: salidas, **días de inventario** (existencia ÷ salida diaria promedio) y **rotación** (salidas del periodo ÷ inventario actual, en dinero si hay costos).
- `alerts`: agotados y stock bajo.

El límite de solicitudes es por IP: `RATE_LIMIT_PER_MINUTE` (300 por defecto; `docker-compose.yml` usa 1000 en desarrollo).

## Pruebas

Pruebas de integración de las reglas de movimientos e idempotencia (`test/movements.test.ts`), de login por empresa, aislamiento entre empresas y rol cliente 3PL (`test/tenancy.test.ts`), de la API del portal (`test/portal.test.ts`) y de módulos y permisos — configuración, dependencias, roles, grupos, excepciones, alcance por almacén, ajustes con autorización y transferencias entre almacenes (`test/access.test.ts`), con `node:test`. Los archivos corren uno a la vez porque comparten las existencias demo. Corren contra una API viva con los datos demo:

```bash
docker compose up -d --build
npm install
npm test                                  # API_URL=http://host:4000/api npm test para otra instancia
```

Cada prueba crea sus propios datos (series y referencias aleatorias), así que se pueden repetir sobre la misma base; sí dejan movimientos registrados. `docker compose down -v` limpia todo.

## Notas técnicas

- Mongo corre con `--replSet rs0` (un solo nodo) porque `movementService.createMovement` usa una transacción multi-documento para que la actualización de stock y la creación del movimiento sean atómicas — MongoDB standalone no soporta transacciones. `src/db/connect.ts` inicia el replica set automáticamente en el primer arranque.
- `MONGODB_URI` lleva `?directConnection=true`: sin eso, el driver de Mongoose no logra "elegir" el servidor mientras es un replica set de un solo nodo (ver historial de este archivo si vuelve a fallar con `MongooseServerSelectionError`).
- `src/index.ts` siembra automáticamente (`runSeed()` de `src/scripts/seed.ts`) si `User.countDocuments() === 0` al arrancar — así `docker compose up -d` alcanza en un pizarrón limpio sin correr `npm run seed` aparte. `npm run seed` sigue existiendo para resembrar a mano (borra y vuelve a crear todo) cuando corrés la API fuera de Docker.
- `connectDB` crea los índices explícitamente (`createIndexes()`) después de iniciar el replica set: el autoIndex de Mongoose corre antes de que un replica set nuevo tenga primario y falla en silencio, lo que dejaba sin índice único a `clientId` y permitía duplicar movimientos con reintentos simultáneos.
- Dentro de la red de Docker Compose, la API se conecta a Mongo como `mongo:27017` (nombre del servicio), no `localhost` — por eso el `docker-compose.yml` define `MONGODB_URI` directo en `environment:` en vez de heredarlo de `.env` (que sigue usando `localhost`, para cuando corrés la API fuera de Docker).

## Pendiente (siguientes fases)

- Alta/edición de catálogo (productos, almacenes, ubicaciones, usuarios, clientes 3PL), portal web de monitoreo y despliegue en VPS — ver `../ROADMAP.md` (fases 3 y 4).
