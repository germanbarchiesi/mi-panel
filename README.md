# Mi Panel

PWA personal (Next.js 16 + Supabase + Vercel). Plan técnico completo en el documento «Mi Panel · plan técnico».

**Estado: Fase 1 · Base** — login con Google restringido a una cuenta, PWA instalable y cabeceras de seguridad.

## Qué incluye la fase 1

- **Login con Google** vía Supabase Auth (PKCE, iniciado desde el servidor).
- **Solo el propietario entra**, con tres barreras: `ALLOWED_EMAIL` comprobado en el proxy y en el callback, comprobación del proveedor y email verificado, y un trigger SQL en Supabase que impide crear cualquier otro usuario (`supabase/migrations/0001_solo_propietario.sql`).
- **PWA instalable**: manifest, iconos (any + maskable), service worker mínimo. Solo guarda iconos y la página sin conexión; nunca páginas ni datos.
- **Cabeceras**: CSP con nonce por petición y `strict-dynamic`, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP/CORP. Sin analítica ni scripts de terceros.
- Respuestas de páginas con `Cache-Control: no-store`.

## Variables de entorno

Ver `.env.example`. En producción se definen **solo en Vercel**. Nunca en el código ni en el chat.

| Variable | Qué es |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable (`sb_publishable_…`). Nunca la `service_role`/secret |
| `ALLOWED_EMAIL` | Único email autorizado |

## Puesta en marcha (una vez)

1. **Supabase → SQL Editor:** ejecutar `supabase/migrations/0001_solo_propietario.sql`.
2. **Supabase → Authentication → Sign In / Providers:** activar solo **Google** y desactivar el registro por email.
3. **Google Cloud (proyecto `mi-panel`) → Google Auth Platform:** configurar la pantalla de consentimiento (tipo Externo, modo Pruebas, tu cuenta como usuario de prueba) y crear un **cliente OAuth «Aplicación web»**. En «URI de redirección autorizados» poner `https://<REF>.supabase.co/auth/v1/callback`. Pegar el Client ID y el Client Secret en Supabase (proveedor Google). Scopes de la fase 1: `openid email profile`.
4. **Supabase → Authentication → URL Configuration:** Site URL = la URL de Vercel; en Redirect URLs añadir `https://<tu-app>.vercel.app/auth/callback` (y `http://localhost:3000/auth/callback` para desarrollo).
5. **Vercel:** importar el repositorio y definir las tres variables de entorno.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # rellenar
npm run dev
```

`npm run typecheck` y `npm run lint` deben pasar antes de cada commit.

## Estructura

```
src/proxy.ts               CSP con nonce, refresco de sesión y control de acceso
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
