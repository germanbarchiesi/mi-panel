# Mi Panel

PWA personal (Next.js 16 + Supabase + Vercel). Plan técnico completo en el documento «Mi Panel · plan técnico».

**Estado: Fase 8 · Agentes** — base (1), Agenda (2), Actividades (3), Finanzas (4), Vencimientos (5), Inversiones (6), Deporte (7) y Agentes (8).

## Qué incluye la fase 1

- **Login con Google** vía Supabase Auth (PKCE, iniciado desde el servidor).
- **Solo el propietario entra**, con tres barreras: `ALLOWED_EMAIL` comprobado en el proxy y en el callback, comprobación del proveedor y email verificado, y un trigger SQL en Supabase que impide crear cualquier otro usuario (`supabase/migrations/0001_solo_propietario.sql`).
- **PWA instalable**: manifest, iconos (any + maskable), service worker mínimo. Solo guarda iconos y la página sin conexión; nunca páginas ni datos.
- **Cabeceras**: CSP con nonce por petición y `strict-dynamic`, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP/CORP. Sin analítica ni scripts de terceros.
- Respuestas de páginas con `Cache-Control: no-store`.

## Fase 2 · Agenda

- **Módulo Agenda** en la home: hoy en detalle y los 7 días siguientes, con huecos libres (por defecto L–V 17:00–22:30, S–D 9:00–22:30, mínimo 45 min) y solapes.
- **Conexión con Calendar** aparte del login: permiso de **solo lectura** (`calendar.readonly`), OAuth con PKCE y `state`. El refresh token se guarda **cifrado con AES-256-GCM** (clave solo en Vercel, ligado al id del usuario) en una tabla con RLS.
- **Ajustes** (`/ajustes`): calendarios a mostrar, franjas de huecos, duración mínima, «usar la hora de donde estoy», conectar/desconectar. «Mis tareas» y «Deporte» no se leen por defecto.
- Los eventos no se guardan: se leen de Google al abrir. Eventos marcados como «disponible» o rechazados no ocupan; el mismo evento en dos calendarios cuenta una vez.
- `npm test` ejecuta las pruebas de la lógica de agenda (zonas horarias, cambio de hora, huecos, solapes) y del cifrado.

## Fase 3 · Actividades

- **Fuente:** API v1 de solo lectura de Mis tareas (`/api/v1/resumen` y `/api/v1/ocupado`). Solo se llama desde el servidor (`src/lib/mis-tareas-api.ts`, con `server-only`); la clave nunca llega al navegador.
- **Sin copia de datos:** caché en memoria del servidor de 60 s como máximo, peticiones con `no-store` y sin seguir redirecciones. En la base de datos solo se guarda la hora de la última respuesta correcta (en `ajustes.datos`, como mucho cada 5 min).
- **Fecha:** se envía el «hoy» de Mi Panel en su zona horaria (Barcelona o la del dispositivo).
- **Módulo:** Hoy, Arrastradas («↻ N días») y Temas por persona; selector Trabajo / Personal / Todo (en «Todo», dos marcos); prioridad como punto rojo, amarillo o verde; «Nada pendiente para hoy»; enlace «Abrir Mis tareas».
- **Equipo de trabajo:** en Ajustes → «Este equipo», «Es el PC de Appliant» guarda una cookie en ese dispositivo y Actividades abre en Trabajo (solo pide ese ámbito). El modo trabajo completo es la fase 10.
- **Agenda:** las tareas con hora de `/api/v1/ocupado` (hoy + 7 días) ocupan huecos y cuentan para solapes. El calendario de Google «Mis tareas» no se lee nunca.
- **Errores:** 401, 400, 429 (respeta `Retry-After`), 5xx, red o formato raro → el módulo lo indica con la hora de la última respuesta correcta; el resto del panel sigue igual.
- **Resumen de las 7:00:** `textoResumen()` en `src/lib/mis-tareas.ts` genera el párrafo de tareas; se conectará cuando exista el resumen (fase 9).

## Fase 4 · Finanzas

- **Fuente:** el Excel de cuentas (V6) en Drive, elegido con el selector de Google. Permiso `drive.file`: Mi Panel solo puede leer ese fichero. El selector solo se carga en `/ajustes`, la única página cuya CSP permite sus marcos.
- **Lectura:** `src/lib/xlsx.ts` abre el `.xlsm`, lee `tblMovimientos`, `tblCuentas` (solo «Último movimiento importado»), la hoja Categorías y `cfgAnio`. Solo valores guardados por Excel: las macros ni se descomprimen. Límites de tamaño contra ficheros manipulados.
- **Sin copia:** los movimientos viven solo en la memoria del servidor; se vuelven a descargar si cambia la versión del fichero en Drive. En la base de datos solo se guarda el id y el nombre del Excel.
- **Cálculos** (`src/lib/finanzas.ts`): mes según la columna «Mes»; ingresado, gastado (Gasto − Ajuste, sin Sueldo, Alquiler Habitación ni sin clasificar), ahorro, tasa, pendientes, meses cerrados, media de cerrados, ritmo de gasto (±10 / +20 puntos), cierre estimado, top 5 y mes anterior. Comprobado contra el Resumen anual de la V6: los 10 meses, al céntimo.
- **Huella / Windows Hello** (WebAuthn, verificación de usuario obligatoria): sin la cookie de desbloqueo firmada (5 min) el servidor no lee el Excel. Para registrar un dispositivo hay que haber entrado con Google en los últimos 10 minutos. Solo se guarda la clave pública (`credenciales_biometria`, migración 0003).
- **Ocultar importes:** cookie por dispositivo; con ella el servidor no envía las cifras.
- **PC de trabajo:** con «Es el PC de Appliant», Finanzas no se carga.

### Puesta en marcha de la fase 4

1. **Supabase → SQL Editor:** ejecutar `supabase/migrations/0003_biometria.sql`.
2. **Google Cloud → Credenciales:** crear una clave de API restringida a `https://<tu-app>.vercel.app/*` y a Google Picker API. **Google Auth Platform → Acceso a los datos:** añadir `.../auth/drive.file`.
3. **Vercel:** `GOOGLE_PICKER_API_KEY` y `GOOGLE_PROJECT_NUMBER` (número del proyecto).
4. **App → Ajustes:** «Reconectar Google» (acepta Drive), «Elegir Excel en Drive» y, tras volver a entrar, «Registrar huella» en cada dispositivo.

## Fase 5 · Vencimientos

- **Próximos 30 días**, con aviso destacado a 7 días o menos. Solo tu parte; mismo desbloqueo con huella que Finanzas y no se carga en el PC de trabajo.
- **A · Previsión:** filas «Pendiente» de `tblProgramados` con importe, según Frecuencia (Único, Mensual, Trimestral, Anual), Desde, Hasta y la columna **«Día»** (1–31; vacía = día 1; se recorta al último día del mes). Los periódicos sin «Hasta» y los anuales siguen el año siguiente.
- **B · Detectados** (`src/lib/vencimientos.ts`): cargos con la misma descripción (sin mes, número de cuota ni signos) al menos 3 veces, cada mes o cada trimestre (±5 días; tolera un mes sin importar) e importe estable (±15 %). Varios cargos del mismo día se suman. Activo si no se ha saltado más de un cobro antes de la fecha de corte. Se descarta lo que ya está en Previsión con la misma categoría e importe parecido, y lo que no te toca (tu parte = 0).
- Se calcula con la misma lectura del Excel que Finanzas (`finanzas-loader.ts`); nada se guarda.

## Fase 6 · Inversiones

- **Posiciones:** `tblActivos` (participaciones, coste, aportado, bolsa, clase, % objetivo) y la liquidez de cada bróker; `invAportado`, `invTIR` e `invBanda` como referencia. Si faltan las tablas, el módulo muestra «Sin posiciones» y Finanzas sigue igual.
- **Precios** (`src/lib/precios.ts`, solo servidor): Yahoo para ETF, fondos y acciones (con cambio a euros y peniques → libras) y Kraken para cripto, como mucho cada 6 h por activo. Si fallan, el precio del Excel con su fecha y un aviso.
- **Cálculo** (`src/lib/inversiones.ts`): valor, aportado neto, ganancia, rentabilidad, rentabilidad del año (aprox., desde la última foto del año anterior), reparto por bolsa y por clase, desvío de cada activo de Largo plazo frente a su % objetivo (con la banda del Excel) y evolución mensual.
- **Foto diaria** (migración 0004, `fotos_cartera`): valor y aportado del día, **cifrados** con AES-256-GCM; la base de datos solo ve la fecha. Se guarda al abrir el panel desbloqueado; con el resumen de las 7:00 (fase 9) será diaria. Sin la migración, la evolución usa solo `tblEvolucion`.
- Mismo desbloqueo con huella; ocultar importes; no se carga en el PC de trabajo.

## Fase 7 · Deporte

- **Semana de lunes a domingo:** lo planificado sale del calendario de Google **«Deporte»** (por nombre, aunque no esté marcado en la Agenda); lo hecho, de **Strava** (`activity:read_all`, solo lectura).
- **Emparejado** (`src/lib/deporte.ts`): cada sesión planificada se marca hecha si ese día hay una actividad del mismo tipo. Natación = `Swim`; fuerza y CrossFit van juntos (`WeightTraining`, `Crossfit`, `Workout`, HIIT). Los paseos no cuentan. Estados: hecho, no hecho, pendiente hoy, planificado, y extra (hecho sin plan).
- **Strava** (`src/lib/strava.ts`): OAuth con `state`; el refresh token se guarda **cifrado** (migración 0005) y se vuelve a guardar si Strava lo rota. Actividades en memoria 10 min; no se guardan. Desconectar revoca el permiso en Strava.

### Puesta en marcha de la fase 7

1. **Strava → strava.com/settings/api:** crear la app (nombre «Mi Panel», web `https://<tu-app>.vercel.app`, **Authorization Callback Domain** = `<tu-app>.vercel.app`).
2. **Vercel:** `STRAVA_CLIENT_ID` y `STRAVA_CLIENT_SECRET`; redeploy.
3. **Supabase → SQL Editor:** `supabase/migrations/0005_strava.sql`.
4. **App → Ajustes → Conectar Strava.** **Google Calendar:** crear el calendario «Deporte».

## Fase 8 · Agentes

- **Solapa `/agentes`:** una tarjeta por tarea programada de Claude (vuelos, Yi Peng, regalo de Mati e informe de inversiones) con estado, titular, hasta 3 puntos, enlace (solo https), hace cuánto se ejecutó y la próxima ejecución (calculada del cron, hora de Madrid). Novedades y alertas primero. En el inicio, una línea con cuántas traen novedades.
- **Puente por Drive:** en Ajustes, «Crear carpeta de agentes» crea «Mi Panel · Agentes» y un fichero `mi-panel-agente-<clave>.json` por agente (la app los puede leer con `drive.file` porque los crea ella). El conector de Drive de las tareas no puede reescribir el contenido, así que cada tarea escribe su resultado en JSON en la **descripción** de su fichero. La lista de agentes está en `src/lib/agentes.ts`.
- **Privado:** el informe de inversiones solo se lee de Drive con el desbloqueo por huella vigente, sin ocultar importes y fuera del PC de trabajo.
- Lo que escriben las tareas es dato no confiable: se valida, se recorta y los enlaces que no son https se descartan.

## Variables de entorno

Ver `.env.example`. En producción se definen **solo en Vercel**. Nunca en el código ni en el chat.

| Variable | Qué es |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable (`sb_publishable_…`). Nunca la `service_role`/secret |
| `ALLOWED_EMAIL` | Único email autorizado |
| `GOOGLE_CLIENT_ID` | Cliente OAuth de Google Cloud (fase 2) |
| `GOOGLE_CLIENT_SECRET` | Secreto del cliente OAuth (fase 2) |
| `TOKEN_ENCRYPTION_KEY` | 32 bytes aleatorios en base64; cifra el permiso de Google (fase 2) |
| `MIS_TAREAS_API_URL` | Dirección de Mis tareas, p. ej. `https://mis-tareas-peach.vercel.app` (fase 3) |
| `MIS_TAREAS_API_KEY` | Clave de solo lectura de Mis tareas (`mt_` + 64 hex) (fase 3) |
| `GOOGLE_PICKER_API_KEY` | Clave de API del selector de Google, restringida (fase 4) |
| `GOOGLE_PROJECT_NUMBER` | Número del proyecto de Google Cloud (fase 4) |
| `STRAVA_CLIENT_ID` | Id de la app de Strava (fase 7) |
| `STRAVA_CLIENT_SECRET` | Secreto de la app de Strava (fase 7) |

## Puesta en marcha (una vez)

1. **Supabase → SQL Editor:** ejecutar `supabase/migrations/0001_solo_propietario.sql`.
2. **Supabase → Authentication → Sign In / Providers:** activar solo **Google** y desactivar el registro por email.
3. **Google Cloud (proyecto `mi-panel`) → Google Auth Platform:** configurar la pantalla de consentimiento (tipo Externo, modo Pruebas, tu cuenta como usuario de prueba) y crear un **cliente OAuth «Aplicación web»**. En «URI de redirección autorizados» poner `https://<REF>.supabase.co/auth/v1/callback`. Pegar el Client ID y el Client Secret en Supabase (proveedor Google). Scopes de la fase 1: `openid email profile`.
4. **Supabase → Authentication → URL Configuration:** Site URL = la URL de Vercel; en Redirect URLs añadir `https://<tu-app>.vercel.app/auth/callback` (y `http://localhost:3000/auth/callback` para desarrollo).
5. **Vercel:** importar el repositorio y definir las tres variables de entorno.

### Puesta en marcha de la fase 2

1. **Supabase → SQL Editor:** ejecutar `supabase/migrations/0002_conexion_google_y_ajustes.sql`.
2. **Google Cloud → Google Auth Platform:** Acceso a los datos (Data access) → añadir el permiso `.../auth/calendar.readonly`; Público (Audience) → pasar a **En producción** (en Pruebas el permiso caduca a los 7 días); Clientes → en el cliente añadir la URI de redirección `https://<tu-app>.vercel.app/auth/google/callback`.
3. **Vercel:** añadir `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `TOKEN_ENCRYPTION_KEY` y volver a desplegar.
4. Abrir la app → «Conectar Google Calendar».

## Desarrollo

```bash
npm install
cp .env.example .env.local   # rellenar
npm run dev
```

`npm test`, `npm run typecheck` y `npm run lint` deben pasar antes de cada commit.

## Estructura

```
src/proxy.ts               CSP con nonce, refresco de sesión y control de acceso
src/lib/agenda.ts          lógica pura: zonas horarias, huecos, solapes (con tests)
src/lib/cripto.ts          cifrado AES-256-GCM del permiso de Google
src/lib/google.ts          access token a partir del refresh token cifrado
src/lib/calendar.ts        lectura de calendarios y eventos (solo lectura)
src/lib/mis-tareas.ts      validación de la API v1, marcos, tareas para la Agenda, texto del resumen (con tests)
src/lib/mis-tareas-api.ts  llamadas a Mis tareas (solo servidor, caché 60 s, errores)
src/lib/equipo.ts          marca de «PC de Appliant» por dispositivo
src/lib/xlsx.ts            lector de .xlsm/.xlsx (tablas, nombres, hojas; sin macros) (con tests)
src/lib/finanzas.ts        cálculos de Finanzas (con tests)
src/lib/vencimientos.ts    Previsión + cargos repetidos detectados (con tests)
src/lib/inversiones.ts     posiciones, reparto, objetivos y evolución (con tests)
src/lib/precios.ts         cotizaciones de Yahoo y Kraken (con tests)
src/lib/fotos-cartera.ts   foto diaria cifrada de la cartera
src/lib/deporte.ts         semana planificada frente a hecha (con tests)
src/lib/strava.ts          Strava: token cifrado, actividades
src/app/auth/strava/*      conectar, callback y desconectar de Strava
src/lib/agentes.ts         lista de agentes, lectura del resultado, próxima ejecución (con tests)
src/app/agentes            solapa de agentes
src/lib/drive.ts           Drive con drive.file: metadatos y descarga
src/lib/biometria.ts, firma.ts  desbloqueo con huella y fichas firmadas
src/app/api/biometria      registro y desbloqueo WebAuthn
src/app/api/drive/selector datos para el selector de Google
src/components/actividades.tsx  módulo Actividades
src/app/auth/google/*      conectar, callback y desconectar de Calendar
src/app/ajustes            página de ajustes
src/lib/env.ts             variables de entorno y comprobación del propietario
src/lib/supabase/server.ts cliente de Supabase para servidor
src/app/auth/*             login (OAuth), callback y cierre de sesión (POST)
src/app/login, src/app/page.tsx
public/sw.js, offline.html service worker mínimo y página sin conexión
supabase/migrations        SQL a ejecutar en Supabase
```

## Cómo probar la fase 1

1. Abrir la URL en el PC y en el S25 con Chrome → «Instalar app».
2. Entrar con tu cuenta Google: aparece el panel.
3. Probar con otra cuenta Google: debe mostrar «Esta cuenta no tiene acceso».
4. Sin sesión, abrir la URL: redirige a `/login`.
