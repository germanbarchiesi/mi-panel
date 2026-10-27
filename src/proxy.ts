import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwner, supabaseConfig } from "@/lib/env";

// Rutas que se pueden abrir sin sesión. Todo lo demás exige ser el propietario.
const PUBLIC_PATHS = ["/login", "/offline.html"];
const PUBLIC_PREFIXES = ["/auth/"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function buildCsp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // 'strict-dynamic' + nonce: solo corre el JS que Next carga con nonce. Sin scripts de terceros.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'" + (dev ? " ws: wss:" : ""),
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const { url, key } = supabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() valida el token contra Supabase; no se confía en la cookie sin más.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const redirectTo = (path: string, search = "") => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = search;
    const redirect = NextResponse.redirect(target);
    // Conserva las cookies de sesión refrescadas (o borradas) en la redirección.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.headers.set("Content-Security-Policy", csp);
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  };

  if (user && !isOwner(user)) {
    // Sesión válida de otra cuenta: se cierra y se rechaza.
    await supabase.auth.signOut();
    return redirectTo("/login", "?error=denied");
  }

  if (!user && !isPublic(pathname)) {
    return redirectTo("/login");
  }

  if (user && pathname === "/login") {
    return redirectTo("/");
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: [
    // Se excluyen los recursos que el navegador pide SIN cookies (manifest, iconos, service worker)
    // y los estáticos de Next: si pasaran por el login, la app no sería instalable.
    "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)",
  ],
};
