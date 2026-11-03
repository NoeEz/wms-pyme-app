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

- `POST /api/auth/login` `{ company, email, password }` → `{ token, user, company, customer }` (`company` es el slug; `customer` solo para rol `client`). Empresa, correo o contraseña incorrectos dan el mismo `401 invalid_credentials`.
- `GET /api/auth/me` → `{ user, company, customer }`
- `GET /api/warehouses`
- `GET /api/products?q=`
- `GET /api/products/:id` → producto + existencias por ubicación + últimos movimientos
- `GET /api/inventory?warehouseId=&locationId=&lowStock=true`
- `GET /api/inventory/locations?warehouseId=`
- `POST /api/movements` `{ warehouseId, type: inbound|outbound|transfer, reference?, clientId?, capturedAt?, lines: [{ productId, quantity, sourceLocationId?, destinationLocationId?, lot?, serial? }] }` — valida cantidad>0, stock suficiente, origen≠destino, serie no duplicada, ubicación perteneciente al almacén y módulo habilitado; actualiza `StockBalance` de forma atómica (transacción Mongo) y genera folio.
  - **Idempotente por `clientId`** (UUID que genera la app por movimiento): si ya existe un movimiento con ese `clientId` en la empresa, responde `200 { movement, replayed: true }` con el original sin volver a aplicarlo; si es nuevo, `201 { movement, replayed: false }`. Un índice único `(companyId, clientId)` cubre los reintentos simultáneos. Así la cola offline de la app puede reintentar sin miedo a duplicar.
  - `capturedAt` (ISO) es cuándo se capturó en el dispositivo; difiere de `createdAt` en movimientos sincronizados tarde.
  - Errores: `400 validation_error` (cuerpo inválido), `403 module_disabled`, `422` con el código de la regla (`insufficient_stock`, `duplicate_serial`, `same_location`, `location_outside_warehouse`…).
- `GET /api/movements?warehouseId=&status=`
- `GET /api/movements/:id`

### Multi-empresa y clientes 3PL

- Toda ruta filtra por la empresa del token (`src/services/scope.ts`): un almacén, ubicación o producto de otra empresa responde `404` (`warehouse_not_found`, `location_not_found`, `not_found`) o `422 product_not_found` al moverlo. Un ID mal formado es `400 invalid_id`.
- Roles: `operator`, `supervisor`, `admin` y `client`. Un usuario `client` pertenece a un `Customer` (cliente 3PL cuya mercancía guarda la empresa); solo ve los productos con ese `customerId`, sus existencias y, de cada movimiento, solo sus líneas. No puede crear movimientos (`403 forbidden`) y la app móvil no lo deja entrar: usa el portal web.
- `Product.cost` (opcional) es el costo unitario para valuar inventario.
- Bases creadas antes de este cambio: al arrancar, la API le asigna un slug a cada empresa sin él, derivado del nombre (`Industrias Nova PyME` → `industrias-nova-pyme`, se ve en el log), y quita el índice único global de correo.

### API del portal web (fase 3)

Permisos: **admin** = todo; **supervisor** = catálogo de productos y ubicaciones, conteos, bitácora; **operador** = lectura; **client** = lectura de lo suyo. Toda alta o cambio queda en la bitácora con valores antes/después. No hay borrados: se desactiva (`active: false`, o `state: "inactive"` en almacenes), y no se puede desactivar un producto o ubicación con existencias (`422 product_has_stock` / `location_has_stock`) ni cambiar el seguimiento lote/serie de un producto con existencias (`422 tracking_locked`). Códigos repetidos (SKU, ubicación, correo, slug) dan `409 duplicate`.

| Ruta | Quién | Qué |
|---|---|---|
| `GET/PATCH /api/company` | todos / admin | Nombre y código de login (`slug`) |
| `POST /api/warehouses`, `PATCH /api/warehouses/:id` | admin | Almacenes |
| `GET/POST /api/locations`, `PATCH /api/locations/:id` | todos / supervisor+ | Ubicaciones (`?warehouseId=&includeInactive=true`) |
| `POST /api/products`, `PATCH /api/products/:id` | supervisor+ | Productos (`cost`, `customerId`, `active`); `GET ?includeInactive=true` |
| `GET/POST /api/customers`, `PATCH /api/customers/:id` | personal / admin | Clientes 3PL; desactivar uno bloquea el login de sus usuarios (`403 customer_inactive`) |
| `GET/POST /api/users`, `PATCH /api/users/:id` | admin | Usuarios; contraseña ≥ 8; un admin no puede cambiar su propio rol ni desactivarse |
| `GET /api/audit` | supervisor+ | Bitácora (`?entity=&entityId=&from=&to=&before=&limit=`) |
| `GET/POST /api/counts` | supervisor+ | Conteo físico de una ubicación `{ warehouseId, locationId, lines: [{ productId, counted }], notes? }`: fija la existencia contada y, si hay diferencias, crea un movimiento `adjustment` (folio `AJU-…`). La app no puede enviar `adjustment` a `POST /movements` y no los muestra en su historial |
| `GET /api/dashboard/overview` | todos | KPIs del periodo (ver abajo) |
| `GET /api/dashboard/stock` | todos | Salud por producto: existencia, valor, días de inventario, último movimiento, estado `stockout`/`low`/`slow`/`ok` (`?days=30`) |
| `GET /api/reports/kardex?productId=` | todos | Kardex con saldo inicial, entradas, salidas y saldo corrido |
| `GET /api/reports/movements` | todos | Una fila por línea de movimiento (`?type=`), máx. 5000 movimientos |
| `GET /api/reports/stock-by-location` | todos | Existencias por ubicación, valuadas |

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

Pruebas de integración de las reglas de movimientos e idempotencia (`test/movements.test.ts`), de login por empresa, aislamiento entre empresas y rol cliente 3PL (`test/tenancy.test.ts`) y de la API del portal (`test/portal.test.ts`), con `node:test`. Los archivos corren uno a la vez porque comparten las existencias demo. Corren contra una API viva con los datos demo:

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
