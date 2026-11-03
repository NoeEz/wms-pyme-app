# WMS PyME — Backend

API REST real (Node.js + Express + TypeScript + MongoDB + JWT) para el proyecto de tesina WMS-PyME. Implementa autenticación, catálogo de almacenes/productos/ubicaciones, inventario por ubicación y movimientos (entrada/salida/transferencia) con las reglas de negocio del brief (`../BRIEF_IA_MVP_WMS_PYME.md`).

## Arranque

Todo el backend (API + MongoDB) corre en Docker. Un solo comando:

```bash
docker compose up -d --build
```

Esto levanta MongoDB (replica set de un solo nodo, para transacciones) en `:27017`, espera a que esté sana, construye y levanta la API en `:4000`, y **siembra los datos demo automáticamente la primera vez** (si la base está vacía) — no hace falta correr `npm install` ni `npm run seed` a mano. En arranques posteriores, si ya hay datos, no vuelve a sembrar.

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

Usuarios demo (mismos que en `../src/data.ts`), contraseña `demo1234` para los tres:

- `maria.lopez@nova.mx` — operador
- `carlos.ruiz@nova.mx` — supervisor
- `admin@nova.mx` — administrador

## Endpoints

Todos menos `/auth/login` requieren `Authorization: Bearer <token>`.

- `POST /api/auth/login` `{ email, password }` → `{ token, user }`
- `GET /api/auth/me`
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

## Pruebas

Pruebas de integración de las reglas de movimientos e idempotencia (`test/movements.test.ts`, `node:test`). Corren contra una API viva con los datos demo:

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

- Alta/edición de catálogo (productos, almacenes, ubicaciones, usuarios), portal web de monitoreo y despliegue en VPS — ver `../ROADMAP.md` (fases 3 y 4).
