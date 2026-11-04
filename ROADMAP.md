# Roadmap — WMS PyME

Plan de escalación del producto, desde el MVP actual hasta un WMS multi-empresa listo para producción.

> **Origen de este documento.** Se armó a partir del estado real del código (noviembre 2026) y de las referencias que el propio código hace a la tesina (`Tesina_WMS_PyME.docx`) y al brief (`BRIEF_IA_MVP_WMS_PYME.md`). Esos dos documentos **no están en el repo**; cuando se agreguen, alinear las fases de abajo con las épicas (`EPIC-n`) y objetivos específicos (`OEn`) oficiales. Hoy solo está confirmada la correspondencia **EPIC-6 = Módulos Personalizables = OE5**.

## Resumen

| Fase | Nombre | Objetivo | Estado |
|---|---|---|---|
| 0 | MVP operativo móvil | Operar un almacén desde el teléfono contra una API real | 🟢 Completa |
| 1 | Cierre del MVP | Quitar simulaciones y dejar el MVP demostrable de punta a punta | 🟢 Completa |
| 2 | Operación en campo | Que funcione en un almacén real: sin señal, con cámara y lectores | 🟡 Implementada, falta probar en dispositivo |
| 3 | Portal web y administración | Que la PyME y sus clientes 3PL gestionen y monitoreen sin tocar la base de datos | 🟢 Completa (falta probar con usuarios reales) |
| 4 | Despliegue y multi-empresa | Servir a varias PyMEs en un mismo servidor (VPS) | ⚪ Pendiente |
| 5 | Escalación funcional | Funciones de WMS avanzado y personalización | ⚪ Futuro |

---

## Fase 0 — MVP operativo móvil (`v1.0.0-mvp`) 🟢

Lo que ya existe en el repo.

**App móvil (Expo / React Native)**
- [x] Login con JWT y selección de almacén
- [x] Inicio, menú "Operar" y "Más"
- [x] Movimientos de entrada, salida y transferencia: configuración → escaneo → borrador → revisión → resultado con folio
- [x] Captura manual de productos como respaldo del escaneo
- [x] Inventario: búsqueda, filtros (stock bajo, serializados, por lote) y detalle por ubicación
- [x] Historial de movimientos (supervisor/admin)
- [x] Pantalla de módulos operativos (solo admin)
- [x] Roles: operador, supervisor, administrador

**Backend (Node.js + Express + MongoDB, en Docker)**
- [x] Auth (`/auth/login`, `/auth/me`)
- [x] Lectura de almacenes, productos, ubicaciones e inventario
- [x] Creación de movimientos con reglas de negocio: cantidad > 0, stock suficiente, origen ≠ destino, serie no duplicada, ubicación del almacén correcto
- [x] Actualización atómica de stock (transacción Mongo, replica set de un nodo) y folio consecutivo
- [x] Seguimiento por lote / número de serie y umbral de stock bajo por producto
- [x] **EPIC-6 / OE5 — Módulos personalizables:** catálogo fijo de 6 módulos que el admin activa o desactiva por empresa
- [x] Siembra automática de datos demo

## Fase 1 — Cierre del MVP 🟢

Eliminar lo que todavía está simulado o con datos de prueba.

- [x] Pantalla **Pendientes** conectada a la cola offline real (ya no usa `PENDING_SYNCS`)
- [x] Formato de etiqueta versionado (`WMSPYME|v1|sku=…|lot=…|serial=…`) en `src/services/scanCodes.ts`, más códigos de barras simples del proveedor
- [x] Indicador de conexión real: "en línea" = el backend responde en `/health` (NetInfo); al tocarlo abre Pendientes
- [x] Sesión persistente entre aperturas (también sin conexión); un 401 regresa al login
- [x] Preferencias de escaneo que suenan/vibran de verdad y se guardan en el dispositivo
- [x] "Biblioteca de componentes" visible solo en desarrollo (`__DEV__`)
- [x] `src/data.ts` eliminado
- [x] Resumen del turno en Inicio con datos reales del día (antes eran números fijos)
- [x] `AGENTS.md` y `backend/README.md` actualizados
- [x] Pruebas de integración de la API (`backend/test/movements.test.ts`, `npm test`): 12 casos de reglas de negocio e idempotencia
- [x] Errores de validación del cuerpo devuelven `400 validation_error` en vez de `500`

**Entregable:** demo completo sin datos simulados en la app.

## Fase 2 — Operación en campo 🟡

Lo necesario para usarlo en un almacén real. El código está hecho y compila (`expo export`), y la API está probada; **falta probarla en un teléfono real** (sin señal, cámara y lector de mano).

- [x] **Modo sin conexión real:** cola persistente (`src/services/syncQueue.ts`), reintento automático al reconectar, al volver a la app y cada 30 s; los rechazos por reglas (stock insuficiente, serie duplicada) quedan como "Rechazado" para reintentar o descartar
- [x] Caché local de catálogo, inventario, ubicaciones y almacenes para escanear y capturar sin conexión
- [x] Idempotencia en `POST /movements` por `clientId` (índice único, cubre reintentos simultáneos) y `capturedAt`
- [x] **Cámara real** con `expo-camera`: QR + EAN/UPC/Code 128/Code 39, sin lecturas repetidas del mismo código, acceso directo a ajustes si se negó el permiso
- [x] Lectores de mano tipo teclado: Enter, Tab o salto de línea como fin de lectura; modo "Lector integrado" que oculta el teclado y procesa lecturas sin terminador
- [x] Productos serializados exigen número de serie al escanear; lecturas repetidas de productos sin serie suman cantidad
- [x] Configuración de EAS Build (`eas.json`, perfil `preview` = APK interno)
- [ ] Generar el primer APK con EAS (requiere cuenta de Expo) y probar en dispositivo / terminal industrial
- [ ] Fuentes personalizadas y animaciones que se perdieron al migrar de web a nativo (opcional)

**Entregable:** app instalable que funciona sin señal y escanea con cámara o lector.

## Fase 3 — Portal web y administración 🟢

Decisiones tomadas (nov 2026): portal en `web/` (Vite + React + TS + Tailwind) para todos los roles; login por **código de empresa + correo**; clientes 3PL con rol `client` que ven solo sus productos (el dueño se asigna **por producto**); costo unitario opcional; conteos físicos desde el portal que generan ajustes.

**Bloque 1 — Backend multi-empresa** 🟢
- [x] Login por empresa (`Company.slug`), correo único por empresa, migración automática de bases existentes
- [x] Aislamiento entre empresas en todas las rutas (corrige: ubicaciones de almacenes ajenos visibles, movimientos sobre almacenes/productos ajenos)
- [x] Clientes 3PL (`Customer`, `Product.customerId`, rol `client` de solo lectura), `Product.cost`
- [x] App móvil con campo "Empresa"; pruebas de aislamiento (`backend/test/tenancy.test.ts`)

**Bloque 2 — API del portal** 🟢
- [x] CRUD de empresa, almacenes, ubicaciones, productos, clientes 3PL y usuarios, con bajas lógicas y permisos por rol
- [x] Bitácora de auditoría (`AuditLog`, `GET /api/audit`) con valores antes/después
- [x] Conteos físicos (`InventoryCount`) que generan movimientos de ajuste `AJU-…`
- [x] KPIs (`/api/dashboard/overview`, `/stock`): precisión de inventario, días de inventario, rotación, productividad, retraso de sincronización, alertas
- [x] Reportes (`/api/reports/*`): kardex, movimientos por periodo, existencias por ubicación

**Bloque 3 — Portal web (`web/`)** 🟢
- [x] **Portal web de monitoreo** (mencionado en la tesina): tablero con KPIs, movimientos por día, alertas de stock, productividad y sincronización; se actualiza cada minuto
- [x] Login por empresa y menú por rol (operador, supervisor, admin, cliente 3PL)
- [x] Inventario por producto con estado (agotado / stock bajo / sin movimiento) y detalle por ubicación
- [x] Movimientos con filtros y detalle; conteos físicos a ciegas con ajuste automático
- [x] Gestión de catálogo: productos, almacenes, ubicaciones (zona/pasillo/rack/posición), clientes 3PL
- [x] Gestión de usuarios y roles por empresa; empresa (código de login) y módulos
- [x] Reportes exportables (Excel/PDF): kardex por producto, movimientos por periodo, existencias por ubicación
- [x] Bitácora de auditoría (quién cambió qué y cuándo)
- [x] Generación e impresión de etiquetas QR para productos y ubicaciones
- [x] Datos demo con 30 días de historial para que el tablero tenga contenido

**Pendiente de la fase**
- [ ] Probar el portal con usuarios reales (supervisor y un cliente 3PL)
- [ ] Que la app móvil lea las etiquetas de ubicación (`WMSPYME|v1|loc=…`) para elegir origen/destino escaneando

**Entregable:** una PyME puede arrancar desde cero sin intervención técnica.

## Fase 4 — Despliegue y multi-empresa ⚪

- [ ] **Despliegue en VPS** (mencionado en la tesina): Docker Compose de producción, HTTPS, dominio, variables de entorno seguras
- [ ] Respaldos automáticos de MongoDB y su restauración probada
- [ ] Aislamiento entre empresas revisado en todas las rutas (`companyId` ya existe en el token y los modelos)
- [ ] Alta de nuevas empresas (onboarding) y su usuario administrador inicial
- [ ] Endurecimiento de seguridad: límite de intentos de login, expiración/renovación de token, recuperación de contraseña
- [ ] Monitoreo de la API (salud, errores, tiempos de respuesta) y logs centralizados
- [ ] CI: lint, typecheck, pruebas y build en cada cambio

**Entregable:** varias PyMEs usando el sistema en producción.

## Fase 5 — Escalación funcional ⚪

Ideas para crecer el producto una vez estable. Priorizar según lo que pidan los clientes.

- [x] **Módulos de la especificación §4.5 administrados solo por el administrador** (nov 2026): 10 módulos (productos, almacenes/ubicaciones, entradas, salidas, transferencias, inventarios y ajustes, trazabilidad, reportes, cámara, administración) con centrales protegidos, dependencias y configuración por empresa; RBAC con roles personalizados, grupos, excepciones individuales justificadas y alcance por almacén; facultades de administración no delegables; ajustes críticos autorizados por otro usuario; transferencias entre almacenes; bitácora de inicios de sesión y accesos denegados
- [ ] Planes por suscripción ligados a los módulos (p. ej. básico: entradas/salidas; pro: transferencias, cámara, historial, reportes)
- [ ] Conteos cíclicos e inventario físico con ajustes
- [ ] Órdenes de compra y de venta: recibir y surtir contra un documento (picking / packing)
- [ ] Caducidades y FEFO/FIFO por lote
- [ ] Reabastecimiento sugerido a partir del stock mínimo
- [ ] Integraciones: ERP / contabilidad, e-commerce, facturación (CFDI)
- [ ] Notificaciones push (stock bajo, sincronización fallida)

---

## Cómo mantener este documento

- Marcar `[x]` al terminar cada punto y mover la fase a 🟡 / 🟢 según avance.
- Al subir la versión de la app (`MoreScreen.tsx` muestra `v1.0.0-mvp`), anotar aquí qué fase cierra.
- Cuando se integre la tesina al repo, agregar junto a cada punto su `EPIC-n` / `OEn` correspondiente.
