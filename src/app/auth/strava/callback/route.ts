import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";
import { SCOPE_STRAVA, StravaReconectar, canjear, guardarConexion, olvidarStrava } from "@/lib/strava";

function iguales(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { origin } = url;
  const fallo = (codigo: string) => {
    const r = NextResponse.redirect(`${origin}/ajustes?error=${codigo}#deporte`);
    r.cookies.set("s_oauth", "", { path: "/auth/strava", maxAge: 0 });
    return r;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return NextResponse.redirect(`${origin}/login`);

  if (url.searchParams.get("error")) return fallo("strava_denegado");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const guardado = (await cookies()).get("s_oauth")?.value;
  if (!code || !state || !guardado || !iguales(guardado, state)) return fallo("estado");

  // El usuario puede desmarcar «ver actividades» en la pantalla de Strava: se exige.
  const scopes = url.searchParams.get("scope") ?? "";
  if (!scopes.split(",").some((s) => s === SCOPE_STRAVA || s === "activity:read")) return fallo("strava_permiso");

  try {
    const t = await canjear({ code, grant_type: "authorization_code" });
    const { error } = await guardarConexion(supabase, user.id, t.refresh_token, scopes);
    if (error) return fallo(error.code === "42P01" || error.code === "PGRST205" ? "strava_migracion" : "guardar");
  } catch (e) {
    return fallo(e instanceof StravaReconectar && e.motivo === "sin_configurar" ? "strava_config" : "strava_canje");
  }
  olvidarStrava(user.id);
  const ok = NextResponse.redirect(`${origin}/?ok=strava`);
  ok.cookies.set("s_oauth", "", { path: "/auth/strava", maxAge: 0 });
  return ok;
}
