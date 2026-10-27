import type { SupabaseClient } from "@supabase/supabase-js";
import { googleConfig } from "@/lib/env";
import { descifrar } from "@/lib/cripto";

export const SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar.readonly";

/** El usuario no ha conectado Google, o Google revocó/caducó el permiso. */
export class GoogleReconectar extends Error {
  constructor(public motivo: "sin_conectar" | "revocado") {
    super(motivo);
  }
}

/** Falta ejecutar la migración SQL (la tabla no existe). */
export class FaltaMigracion extends Error {}

const cache = new Map<string, { token: string; caduca: number }>();

export async function accessToken(supabase: SupabaseClient, userId: string): Promise<string> {
  const hit = cache.get(userId);
  if (hit && hit.caduca > Date.now() + 60_000) return hit.token;

  const { data, error } = await supabase
    .from("conexiones_google")
    .select("refresh_token_cifrado")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") throw new FaltaMigracion();
    throw new Error(`Supabase: ${error.message}`);
  }
  if (!data) throw new GoogleReconectar("sin_conectar");

  const refresh = descifrar(data.refresh_token_cifrado, userId);
  const { clientId, clientSecret } = googleConfig();

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") throw new GoogleReconectar("revocado");
    throw new Error(`Google token: ${res.status} ${body.error ?? ""}`.trim());
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(userId, { token: json.access_token, caduca: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

export function olvidarToken(userId: string) {
  cache.delete(userId);
}
