import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { descifrar } from "@/lib/cripto";
import { olvidarToken } from "@/lib/google";
import { desconectar as desconectarStrava } from "@/lib/strava";
import { bloquear } from "@/lib/biometria";
import { admin } from "@/lib/admin";
import { supabaseSecretKey } from "@/lib/env";

/**
 * Botón de emergencia: revoca Google y Strava, borra sus tokens, quita las notificaciones,
 * bloquea Finanzas y cierra la sesión en TODOS los dispositivos. La clave de Mis tareas se revoca
 * desde Mis tareas. Cada paso es independiente: si uno falla, los demás se hacen igual.
 */
export async function emergencia(supabase: SupabaseClient, userId: string) {
  try {
    const { data } = await supabase.from("conexiones_google").select("refresh_token_cifrado").eq("user_id", userId).maybeSingle();
    if (data) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: descifrar(data.refresh_token_cifrado, userId) }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => undefined);
    }
  } catch {
    // se borra igualmente
  }
  await supabase.from("conexiones_google").delete().eq("user_id", userId);
  olvidarToken(userId);
  await desconectarStrava(supabase, userId).catch(() => undefined);
  if (supabaseSecretKey()) {
    await admin().from("suscripciones_push").delete().eq("user_id", userId);
  }
  await bloquear();
  await supabase.auth.signOut({ scope: "global" });
}
