# Avance de tesina — WMS PyME

Base para la exposición del 3 de noviembre de 2026. Sigue el orden de la rúbrica para pasarlo a diapositivas.

> **Cómo leer este documento**
> ✅ implementado · 🟡 parcial o falta validarlo · ❌ no implementado.
>
> El plan oficial (épicas, sprints y objetivos) viene de la tesina `Tesina_WMS_PyME`.

## Mapa de la rúbrica

| Criterio | Peso | Estado | Sección |
|---|---:|---|---|
| Avances respecto al MVP | 20% | ✅ Ligado a sprints, épicas y objetivos de la tesina | 2 y 3 |
| Pipeline en GitHub Actions | 15% | ✅ Los 7 jobs pasan en GitHub | 8 |
| Servicios web | 10% | ✅ | 4 |
| Bases de datos | 10% | ✅ | 5 |
| Módulos de la app móvil | 10% | ✅ | 6 |
| Seguridad | 10% | 🟡 Base sólida con SAST y SCA; lo perimetral queda como plan | 7 |
| Claridad y respuestas | 15% | Exposición | 9 |
| Documentación | 10% | Este documento | — |

---

## 1. Qué es el proyecto

WMS (sistema de gestión de almacenes) para PyMEs, con tres piezas:

- **App móvil** para operadores: entradas, salidas, transferencias e inventario, también sin conexión.
- **Portal web** para supervisión y administración, incluidos los clientes 3PL.
- **API REST** con MongoDB, multi-empresa.

**Línea base (MVP):** commit `8bdcdea`, del 7 de septiembre de 2026.

**Institución:** Benemérita Universidad Autónoma de Aguascalientes. **Tutor:** Arturo Elías Ramírez.

| Integrante | Rol en la tesina | Parte sugerida en la exposición |
|---|---|---|
| Noé Ezequiel Román Arriaga | Backend lead + Frontend lead | Arquitectura, servicios web y pipeline |
| Ángel Ramsés Martínez Herrera | Backend | Base de datos y seguridad |
| Américo Ismael Calzada Gonzales | Frontend | App móvil, portal y muestra física |

## 2. Avances respecto al MVP

### Qué había en el MVP

App móvil conectada a una API real: login con JWT, selección de almacén, movimientos, inventario, historial, roles y módulos activables (EPIC-6/OE5). Pendientes seguía con datos simulados (`src/data.ts`).

### Qué se agregó después

| # | Avance | Descripción | Evidencia |
|---|---|---|---|
| 1 | Cierre del MVP | Se eliminaron los datos simulados. Pendientes usa la cola real, el resumen del turno usa datos del día y la sesión persiste entre aperturas. | `aaef30c` |
| 2 | Operación sin conexión | Los movimientos se guardan en el teléfono y se reenvían al reconectar, al volver a la app y cada 30 s. El catálogo y el inventario quedan en caché. | `src/services/syncQueue.ts`, `api.ts` |
| 3 | Idempotencia | Cada movimiento lleva un `clientId` (UUID); un reintento nunca lo aplica dos veces. Un índice único cubre reintentos simultáneos. | `backend/src/models/Movement.ts` |
| 4 | Conectividad real | "En línea" significa que la API responde en `/health`, no solo que hay Wi-Fi. | `src/services/connectivity.ts` |
| 5 | Escaneo unificado | Un solo flujo para cámara y lector de mano. Lee etiquetas versionadas `WMSPYME\|v1\|…` y códigos del proveedor (EAN/UPC/Code 128/Code 39/QR). | `scanning.ts`, `scanCodes.ts` |
| 6 | Captura al disparar | La cámara registra al presionar el obturador, no automáticamente. | `23effff` |
| 7 | Plano del almacén | Selección visual de ubicación por zona, pasillo, rack y posición, con ocupación. Funciona sin conexión en la app y también está en el portal. | `9b74214` |
| 8 | Multi-empresa | Login por código de empresa; correo único por empresa; aislamiento en las rutas. | `389d050`, `scope.ts`, `tenancy.test.ts` |
| 9 | Clientes 3PL | Rol `client` de solo lectura que ve únicamente sus productos, sin datos del personal. | `389d050` |
| 10 | API del portal | CRUD de catálogo y usuarios con bajas lógicas, reportes y permisos por rol. | `973379a` |
| 11 | Bitácora de auditoría | Quién cambió qué y cuándo, con valores antes y después. | `AuditLog.ts` |
| 12 | Conteos físicos | Conteos a ciegas que generan un ajuste `AJU-…` si hay diferencias. | `countService.ts` |
| 13 | KPIs | Precisión de inventario, días de inventario, rotación, productividad y retraso de sincronización (definiciones WERC/SCOR). | `analytics.ts` |
| 14 | Portal web | 13 secciones más login, menú por rol y tablero que se actualiza cada minuto. | `837b411`, `web/` |
| 15 | Reportes y etiquetas | Kardex, movimientos y existencias en Excel/PDF; etiquetas QR de productos y ubicaciones. | `web/src/lib/export.ts`, `LabelsPage.tsx` |
| 16 | Pruebas de integración | 38 casos: reglas de movimientos, idempotencia, aislamiento y API del portal. | `backend/test/` |
| 17 | Build instalable | Configuración de EAS para generar un APK interno. | `eas.json` |
| 18 | Actualización a Expo SDK 58 | Requerida para seguir usando Expo Go en iOS. | `aaef30c` |
| 19 | Pipeline CI | Valida app, API y portal; incluye pruebas, SCA y SAST. | `.github/workflows/ci.yml` |
| 20 | Endurecimiento | Dependencias corregidas, API sin `root` y acciones fijadas por commit. | `backend/Dockerfile`, `backend/package.json` |

### El proyecto en números

| Medida | Valor |
|---|---|
| Pantallas móviles | 18 (1 solo para desarrollo) |
| Páginas del portal | 14 (incluye login) |
| Grupos de rutas de la API | 14 |
| Colecciones MongoDB | 10 |
| Casos de prueba de integración | 38 |
| Líneas TypeScript | App 5,348 · API 2,496 · Pruebas 655 · Portal 3,394 |

### Pendiente y limitaciones que conviene declarar

- 🟡 **App:** ya se probó en teléfono real y la demostración será con Expo Go. Falta generar el APK, que es un entregable de la tesina.
- 🟡 **Tiempo real:** el portal se actualiza cada 60 s; la meta de OE2 es 10 s.
- 🟡 **Portal:** falta probarlo con un supervisor y un cliente 3PL reales.
- 🟡 **Trazabilidad en Historial:** la línea de tiempo es una aproximación; todos los pasos muestran la misma fecha.
- ❌ **Etiquetas de ubicación:** el portal las genera, pero la app todavía no las lee.
- ❌ **Despliegue:** no hay VPS, dominio ni HTTPS; hoy corre en local con Docker.
- ❌ **Módulos:** el catálogo es fijo (6). Los módulos definidos por el administrador quedan para una fase posterior.

## 3. Mapeo de historias y sprints

**Fuente:** tesina, secciones 2.2, 3.3 y 3.5. El proyecto se planeó con Scrum: **6 épicas, 5 sprints de 2 semanas, 38 historias de usuario, 44 elementos de trabajo en Jira y 221 story points**.

> La tesina no lista las 38 historias: esas viven en Jira. Aquí se usa el mapeo a nivel de épica, sprint y objetivo. La Tabla 3 suma 44 elementos, no 38, así que la columna se llama "Elementos".

### Sprints oficiales y estado actual

| Sprint | Semanas | Meta | Elementos | SP | Versión | En el MVP | Después del MVP | Estado |
|---|---|---|---:|---:|---|---|---|---|
| 1 | 1–2 | Infraestructura base y entorno | 8 | 32 | V0 | Repo, Node + TypeScript, MongoDB, Docker | Portal añadido a la estructura | 🟡 Falta VPS |
| 2 | 3–4 | JWT, CRUD de usuarios, captura básica móvil | 10 | 48 | V1 | JWT, roles, login móvil, captura | CRUD de usuarios, login web y por empresa | ✅ |
| 3 | 5–6 | Movimientos e inventario con trazabilidad | 9 | 51 | V2 | Entradas, salidas, transferencias, reglas, folios | Conteos, ajustes, bitácora, kardex | ✅ |
| 4 | 7–8 | Dashboard, reportes, módulos | 8 | 45 | V3 | Módulos activables | Portal, KPIs, 3 reportes exportables, multi-empresa | ✅ |
| 5 | 9–10 | Pruebas, despliegue, documentación | 9 | 45 | V4 | — | 38 pruebas, pipeline, documentación técnica | 🟡 Falta VPS y manuales |
| **Total** | **10** | | **44** | **221** | | | | |

### Avance posterior al MVP por sprint y épica

| Sprint | Épica | Trabajo después del MVP | Evidencia |
|---|---|---|---|
| 2 | EPIC-2 Autenticación y Seguridad | Gestión de usuarios, login por empresa y sesión persistente | `973379a`, `389d050`, `aaef30c` |
| 2 y 3 | EPIC-4 Captura de Datos | Cola offline, caché, idempotencia, escaneo unificado y captura al disparar | `aaef30c`, `23effff` |
| 3 | EPIC-3 Gestión de Inventarios | Conteos físicos y ajustes | `973379a` |
| 3 | EPIC-2 Autenticación y Seguridad | Bitácora de auditoría | `973379a` |
| 4 | EPIC-5 Monitoreo y Reportes | Portal web, KPIs, gestión y reportes | `973379a`, `837b411` |
| 4 | EPIC-6 Módulos Personalizables | Multi-empresa con aislamiento; módulos administrables desde el portal | `389d050`, `837b411` |
| 5 | EPIC-1 Infraestructura | Pipeline de GitHub Actions y pruebas automatizadas | `.github/workflows/ci.yml` |

**Trabajo adicional al plan:** clientes 3PL, plano del almacén (`9b74214`), KPIs con definiciones WERC/SCOR, etiquetas QR y conteos físicos a ciegas.

### Cumplimiento de los objetivos específicos

| Objetivo | Sprint | Meta medible | Resultado | Estado |
|---|---|---|---|---|
| OE1 Captura automatizada | 2 | Registrar sin digitación, error < 1% | Escaneo QR y de barras implementado; la tasa de error no se ha medido | 🟡 |
| OE2 Inventario en tiempo real | 3 | Latencia móvil-web ≤ 10 s | Flujos completos, pero el portal se actualiza cada 60 s | 🟡 |
| OE3 Trazabilidad | 3 | 100% de transacciones | Cada movimiento guarda usuario, hora, tipo y artículos | ✅ |
| OE4 Accesos y seguridad | 2 | Endpoints protegidos, sesión ≤ 8 h | JWT de 8 h y 3 roles; solo login y `/health` son públicos | ✅ |
| OE5 Módulos | 4 | Al menos 5 módulos | 6 módulos activables | ✅ |
| OE6 Portal de monitoreo | 4 | Inventario, movimientos y 3 reportes exportables | Cumple el contenido; misma limitación de 60 s que OE2 | 🟡 |
| OE7 Despliegue | 5 | VPS Ubuntu, 99% disponibilidad, API < 10 ms | No desplegado; disponibilidad y tiempos sin medir | ❌ |

**Requerimiento no cubierto:** la tesina pide "JWT + API Key" y la API Key no existe.

### Entregables de la tesina

| Entregable | Estado |
|---|---|
| Requerimientos, API REST con documentación técnica y modelo de datos | ✅ |
| Portal web | ✅ Local |
| App Android | 🟡 Funciona con Expo Go; falta generar el APK |
| Manual técnico | 🟡 Parcial en los README |
| Diagramas de arquitectura | ❌ Pendiente para las diapositivas |
| Manual de usuario | ❌ |
| Landing page | ❌ |
| Sistema en VPS con acceso público | ❌ |

### Cierre propuesto del Sprint 5

Las fechas son una propuesta hacia adelante, sujeta a confirmación del equipo.

| Bloque | Fechas | Objetivo | Entregable |
|---|---|---|---|
| 5A | 4 al 17 de noviembre | Despliegue | VPS, HTTPS, dominio, MongoDB con autenticación, respaldos, APK, actualización del portal ≤ 10 s |
| 5B | 18 de noviembre al 1 de diciembre | Cierre | Medición de OE1 y OE7, API Key o justificación de su retiro, manuales y landing page |

### Fechas de ejecución

Las semanas de la tabla son las **planeadas** en la tesina. Git registra el MVP el 7 de septiembre y los otros 7 commits el 3 de noviembre, así que este documento no afirma fechas de ejecución por sprint. Si preguntan, la respuesta es que el avance se integró al repositorio en bloques al final.

## 4. Servicios web y justificación

**Arquitectura:** app móvil y portal web → API REST (Express) → MongoDB. La API y la base de datos corren en Docker Compose.

| Capa | Herramienta | Por qué |
|---|---|---|
| Lenguaje | TypeScript | Un solo lenguaje en app, portal y API; detecta errores de tipos al compilar. |
| Servidor | Node.js + Express | API ligera y modular; adecuada para muchas operaciones cortas de entrada/salida. |
| Acceso a datos | Mongoose | Esquemas, validaciones e índices sobre MongoDB. |
| Validación | Zod | Valida cada cuerpo de petición en el servidor. |
| Autenticación | JWT + bcryptjs | Sesión sin estado, útil para app y portal; contraseñas con hash. |
| Protección HTTP | helmet + express-rate-limit | Cabeceras seguras y límite de peticiones por IP. |
| App móvil | React Native + Expo SDK 58 | Una base de código para Android e iOS, con cámara y almacenamiento seguro. |
| Estilos | NativeWind / Tailwind | Mismo enfoque visual en app y portal. |
| Portal web | React + Vite | Desarrollo rápido y carga bajo demanda por página. |
| Datos en portal | TanStack Query | Caché y actualización periódica del tablero. |
| Gráficas | Recharts | Visualización de KPIs. |
| Exportación | write-excel-file, jsPDF, qrcode | Excel, PDF y etiquetas QR desde el navegador. |
| Contenedores | Docker Compose | Levanta API y base de datos con un comando. |

**Grupos de la API (`/api`):** `auth`, `company`, `modules`, `warehouses`, `locations`, `products`, `customers`, `users`, `inventory`, `movements`, `counts`, `audit`, `dashboard`, `reports`. El detalle está en `backend/README.md`.

No se consumen APIs externas de terceros. Los servicios web empleados son los propios.

## 5. Base de datos

**Manejador:** MongoDB 7. **Modelo:** NoSQL de documentos.

**Por qué MongoDB:**

- Un movimiento se guarda como un solo documento con sus líneas, igual que lo captura el operador.
- El esquema flexible permite agregar atributos sin migraciones pesadas (`cost`, `customerId`).
- Cada colección de negocio se liga a su empresa directamente o a través de sus referencias.
- Soporta transacciones de varios documentos. Se usan al mover stock, por eso corre como replica set de un nodo.

| Colección | Contenido | Índices y reglas clave |
|---|---|---|
| `companies` | Empresa, código de login, módulos activos | `slug` único |
| `users` | Usuarios, rol, hash de contraseña | Único por empresa + correo |
| `customers` | Clientes 3PL | Único por empresa + código |
| `warehouses` | Almacenes | Ligados a la empresa |
| `locations` | Zona, pasillo, rack, posición, código | Único por almacén + código |
| `products` | SKU, códigos de barras, seguimiento, costo, dueño | Único por empresa + SKU |
| `stockbalances` | Existencia por producto y ubicación | Único por producto + ubicación |
| `movements` | Encabezado, líneas embebidas, folio, `clientId` | Único parcial por empresa + `clientId` |
| `inventorycounts` | Conteos, esperado contra contado, ajuste | Por empresa y fecha |
| `auditlogs` | Bitácora de cambios | Por empresa y fecha |

**Relaciones:** se usa **referencia** entre colecciones (`companyId`, `productId`, `locationId`) y **embebido** en las líneas de movimientos y conteos.

## 6. Módulos de la aplicación móvil

La app es un solo paquete Expo. Los módulos son **capas lógicas por carpeta**, no módulos separados de compilación.

| Capa de la rúbrica | Dónde | Responsabilidad |
|---|---|---|
| Punto de entrada (App Module) | `index.ts`, `src/App.tsx` | Registra la app, carga proveedores y enruta pantallas con una máquina de estados. |
| Módulos de librerías | `package.json` | Cámara, audio, vibración, almacenamiento seguro, conectividad y SVG. |
| Interfaz de usuario | `src/screens/`, `src/components/` | 18 pantallas, kit de UI, `AppShell` y `WarehouseMap`. |
| Lógica de negocio y dominio | `src/services/` y `src/types.ts` | `scanning`, `scanCodes`, `movements`, `syncQueue`, `warehouseLayout`, `modules`, `preferences`. |
| Capa de datos | `src/services/` | `api` (HTTP y caché), `storage` (AsyncStorage), `auth` (SecureStore), `connectivity`. |

**Flujo principal:** configurar movimiento → escanear → borrador → revisión → resultado con folio o envío a cola sin conexión.

## 7. Seguridad

### Aplicación web y API

| Área | Control | Estado | Razón o plan |
|---|---|---|---|
| Perimetral | Cabeceras HTTP con helmet | ✅ | Reduce ataques comunes del navegador. |
| Perimetral | Límite por IP | ✅ | Frena excesos; es global, no específico para login. |
| Perimetral | HTTPS, WAF, mitigación DDoS, DNSSEC | ❌ | Plan para el VPS (bloque 5A). Hoy no hay servidor público. |
| Acceso | Contraseñas con bcrypt y token JWT de 8 h | ✅ | No se guardan contraseñas en claro. |
| Acceso | Mínimo privilegio por rol y empresa | ✅ | La API repite los permisos; el menú no es la única barrera. |
| Acceso | Respuesta única ante credenciales inválidas | ✅ | No revela qué empresas o cuentas existen. |
| Acceso | MFA, IdP/SSO | ❌ | Plan futuro. |
| Acceso | Revocar sesión, renovar token, recuperar contraseña | ❌ | Plan futuro. |
| Desarrollo | Validación backend con Zod | ✅ | Rechaza entradas inválidas con `400`. |
| Desarrollo | Pruebas de aislamiento y permisos | ✅ | Parte de los 38 casos. |
| Desarrollo | Secretos fuera del repo | ✅ | `.env` ignorado por Git. |
| Desarrollo | SAST con reglas OWASP Top 10 (Semgrep) | ✅ | Corre en el pipeline; detectó 10 hallazgos, ya corregidos. |
| Desarrollo | DAST, pen-testing | ❌ | Plan para cuando exista el entorno desplegado. |
| Desarrollo | Contenedor de la API sin `root` | ✅ | Limita el daño si la API se ve comprometida. |
| Monitoreo | Bitácora de auditoría | ✅ | Da trazabilidad de cambios administrativos. |
| Monitoreo | Gestión de vulnerabilidades | ✅ | `npm audit` en el pipeline; falla con severidad alta o crítica. |
| Monitoreo | RASP, plan de respuesta a incidentes | ❌ | RASP fuera de alcance; el plan puede documentarse. |

### Aplicación móvil

| Área | Control | Estado | Razón o plan |
|---|---|---|---|
| Acceso | Sesión con JWT de 8 h; un 401 regresa al login | ✅ | La cola se conserva y sincroniza al volver a entrar. |
| Acceso | Clientes 3PL bloqueados en la app | ✅ | Solo usan el portal. |
| Acceso | MFA, biometría | ❌ | Plan futuro; la biometría es viable en Expo. |
| Cifrado | Token en SecureStore | ✅ | Usa el almacén seguro del sistema operativo. |
| Cifrado | Cifrado en tránsito | ❌ | Hoy es HTTP en red local; depende del despliegue con HTTPS. |
| Cifrado | Cifrado en reposo de caché y cola | ❌ | AsyncStorage no cifra; se limpia la caché al cerrar sesión. |
| Datos | Minimización | ✅ | Guarda solo lo necesario para operar; el token va aparte del perfil. |
| Código | Validación de entradas | ✅ | En la app y otra vez en la API. |
| Código | Security by Design | ✅ | Aislamiento, idempotencia y permisos desde el modelo. |
| Código | Ofuscación, RASP | ❌ | Fuera de alcance por ahora. |
| Análisis | SAST y SCA | ✅ | Semgrep y `npm audit` en cada cambio. |
| Análisis | DAST | ❌ | Plan para cuando exista el entorno desplegado. |

### Cumplimiento normativo

- **Protección de datos:** se tratan nombres y correos de usuarios, por lo que aplica la ley mexicana de datos personales. Falta un aviso de privacidad. ❌
- **Pagos con tarjeta:** no aplica; el sistema no procesa pagos.

### Hallazgos a corregir antes de producción

- `npm audit --omit=dev`: `backend/` y `web/` en 0; la app conserva 8 moderadas. Las del backend (1 crítica, 2 altas, 2 moderadas) ya se corrigieron.
- `cors()` acepta cualquier origen.
- MongoDB corre sin autenticación y expone el puerto `27017`.
- El portal guarda el token en `localStorage`, expuesto si hubiera XSS.
- No hay límite específico de intentos de login.

## 8. Pipeline en GitHub Actions

**Archivo:** `.github/workflows/ci.yml`. **Eventos:** push y pull request a `master`, y ejecución manual.

| Job | Qué valida | Prueba local en Linux |
|---|---|---|
| App móvil | `npm ci`, tipos y bundle Android con `expo export` | ✅ Instalación limpia, tipos y bundle |
| API | `npm ci`, compilación, imagen Docker y 38 pruebas contra MongoDB real | ✅ 38 de 38 en base limpia |
| Portal web | `npm ci`, tipos y build de Vite | ✅ Instalación limpia y build |
| Dependencias (SCA) | `npm audit` en los 3 paquetes; bloquea severidad alta o crítica | ✅ Sin altas ni críticas |
| Seguridad (SAST) | Semgrep con reglas TypeScript, Node.js y OWASP Top 10 | ✅ 113 reglas, 0 hallazgos |

Decisiones técnicas:

- **Semgrep en vez de CodeQL:** CodeQL requiere GitHub Advanced Security en repositorios privados.
- **Acciones fijadas por commit:** evita que un cambio de etiqueta altere el pipeline.
- **`JWT_SECRET` aleatorio en cada corrida:** el pipeline no necesita secretos guardados.

**Resultado en GitHub:** ✅ los 7 jobs pasaron en la [corrida del PR #1](https://github.com/NoeEz/wms-pyme-app/actions/runs/41838943659), con el evento `pull_request`. Son 5 jobs de definición; el de dependencias corre uno por paquete.

## 9. Guion de la muestra física

1. Encender Docker Desktop y correr `docker compose up -d --build` en `backend/`.
2. Levantar el portal con `npm --prefix web run dev`.
3. Configurar `EXPO_PUBLIC_API_URL` con la IP local, correr `npm start` y abrir la app en Expo Go.
4. **App:** login → entrada escaneando → ver folio → inventario actualizado.
5. **Sin conexión:** detener la API o apagar el Wi-Fi → capturar → ver Pendientes → reconectar → sincroniza.
6. **Plano:** elegir una ubicación en el mapa del almacén.
7. **Portal:** tablero con KPIs → conteo físico con ajuste → bitácora → reporte en Excel/PDF → etiqueta QR.
8. **Aislamiento:** entrar como cliente 3PL y mostrar que solo ve su producto.
9. **Pipeline:** abrir la corrida en la pestaña Actions de GitHub.

Los usuarios demo están en `backend/README.md`.

## 10. Verificación de este documento

| Revisión | Resultado |
|---|---|
| Pruebas de integración | ✅ 38 de 38, en stack aislado con base limpia |
| SAST y validación del workflow | ✅ Semgrep sin hallazgos; `actionlint` sin errores |
| Builds en contenedor Linux | ✅ App, API y portal con `npm ci` en Node 24 |
| App en teléfono real | ✅ Reportado por el equipo; no repetido en esta revisión |
| Corrida en GitHub Actions | ✅ 7 de 7 jobs en verde en el PR #1 |
| Las 38 historias de Jira | ⚠️ No disponibles; la tesina solo trae los totales |
