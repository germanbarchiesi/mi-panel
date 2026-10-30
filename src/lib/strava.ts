import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cifrar, descifrar } from "@/lib/cripto";
import { stravaConfig } from "@/lib/env";
import { leerActividad, type Hecho } from "@/lib/deporte";

// Strava con permiso de solo lectura de actividades. El refresh token se guarda cifrado y Strava
// puede cambiarlo en cada renovación: se vuelve a guardar si cambia.

export const SCOPE_STRAVA = "activity:read_all";

export class StravaReconectar extends Error {
  constructor(public motivo: "sin_conectar" | "revocado" | "sin_configurar" | "falta_migracion") {
    super(motivo);
  }
}

const aad = (userId: string) => `${userId}|strava`;
const tokens = new Map<string, { token: string; caduca: number }>();
const actividades = new Map<string, { expira: number; datos: Hecho[] }>();

export function olvidarStrava(userId: string) {
  tokens.delete(userId);
  for (const k of actividades.keys()) if (k.startsWith(`${userId}|`)) actividades.delete(k);
}

export async function canjear(params: Record<string, string>) {
  const cfg = stravaConfig();
  if (!cfg) throw new StravaReconectar("sin_configurar");
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 400 || res.status === 401) throw new StravaReconectar("revocado");
  if (!res.ok) throw new Error(`Strava token ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_at: number };
}

export async function guardarConexion(supabase: SupabaseClient, userId: string, refresh: string, scopes: string) {
  return supabase.from("conexiones_strava").upsert({
    user_id: userId,
    refresh_token_cifrado: cifrar(refresh, aad(userId)),
    scopes,
    actualizado: new Date().toISOString(),
  });
}

export async function leerConexion(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("conexiones_strava")
    .select("refresh_token_cifrado,scopes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") throw new StravaReconectar("falta_migracion");
    throw new Error(`Supabase: ${error.message}`);
  }
  if (!data) return null;
  return { refresh: descifrar(data.refresh_token_cifrado, aad(userId)), scopes: data.scopes as string };
}

async function accessToken(supabase: SupabaseClient, userId: string): Promise<string> {
  const hit = tokens.get(userId);
  if (hit && hit.caduca > Date.now() + 120_000) return hit.token;
  if (!stravaConfig()) throw new StravaReconectar("sin_configurar");
  const con = await leerConexion(supabase, userId);
  if (!con) throw new StravaReconectar("sin_conectar");
  const t = await canjear({ grant_type: "refresh_token", refresh_token: con.refresh });
  if (t.refresh_token && t.refresh_token !== con.refresh) await guardarConexion(supabase, userId, t.refresh_token, con.scopes);
  tokens.set(userId, { token: t.access_token, caduca: t.expires_at * 1000 });
  return t.access_token;
}

/** Actividades entre dos instantes (s UTC), con 10 minutos de caché. No se guardan. */
export async function listarActividades(
  supabase: SupabaseClient,
  userId: string,
  desdeS: number,
  hastaS: number,
): Promise<Hecho[]> {
  const clave = `${userId}|${desdeS}|${hastaS}`;
  const hit = actividades.get(clave);
  if (hit && hit.expira > Date.now()) return hit.datos;
  const token = await accessToken(supabase, userId);
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?${new URLSearchParams({
      after: String(desdeS),
      before: String(hastaS),
      per_page: "100",
    })}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) },
  );
  if (res.status === 401) {
    tokens.delete(userId);
    throw new StravaReconectar("revocado");
  }
  if (!res.ok) throw new Error(`Strava ${res.status}`);
  const lista = (await res.json()) as unknown[];
  const datos = (Array.isArray(lista) ? lista : []).map(leerActividad).filter((x): x is Hecho => x !== null);
  actividades.set(clave, { expira: Date.now() + 10 * 60_000, datos });
  return datos;
}

/** Revoca el permiso en Strava (si se puede) y borra el token guardado. */
export async function desconectar(supabase: SupabaseClient, userId: string) {
  try {
    const t = await accessToken(supabase, userId);
    await fetch("https://www.strava.com/oauth/deauthorize", {
      method: "POST",
      headers: { Authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // aunque falle la revocación, se borra el token guardado
  }
  await supabase.from("conexiones_strava").delete().eq("user_id", userId);
  olvidarStrava(userId);
}
