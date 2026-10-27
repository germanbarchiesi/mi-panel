import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { googleConfig, isOwner } from "@/lib/env";
import { cifrar } from "@/lib/cripto";
import { SCOPE_CALENDAR, olvidarToken } from "@/lib/google";

function iguales(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { origin } = url;

  const fallo = (codigo: string) => {
    const r = NextResponse.redirect(`${origin}/ajustes?error=${codigo}`);
    r.cookies.set("g_oauth", "", { path: "/auth/google", maxAge: 0 });
    return r;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return NextResponse.redirect(`${origin}/login`);

  if (url.searchParams.get("error")) return fallo("denegado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const raw = (await cookies()).get("g_oauth")?.value;
  if (!code || !state || !raw) return fallo("estado");

  let guardado: { state: string; verifier: string };
  try {
    guardado = JSON.parse(raw);
  } catch {
    return fallo("estado");
  }
  if (!iguales(guardado.state, state)) return fallo("estado");

  const { clientId, clientSecret } = googleConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: guardado.verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return fallo("canje");

  const tokens = (await res.json()) as { refresh_token?: string; scope?: string };
  if (!tokens.refresh_token) return fallo("sin_refresh");
  // El usuario puede desmarcar el permiso en la pantalla de Google: se exige.
  if (!(tokens.scope ?? "").split(" ").includes(SCOPE_CALENDAR)) return fallo("sin_permiso");

  const { error } = await supabase.from("conexiones_google").upsert({
    user_id: user.id,
    refresh_token_cifrado: cifrar(tokens.refresh_token, user.id),
    scopes: tokens.scope ?? "",
    actualizado: new Date().toISOString(),
  });
  if (error) return fallo(error.code === "42P01" || error.code === "PGRST205" ? "migracion" : "guardar");

  olvidarToken(user.id);
  const ok = NextResponse.redirect(`${origin}/`);
  ok.cookies.set("g_oauth", "", { path: "/auth/google", maxAge: 0 });
  return ok;
}
