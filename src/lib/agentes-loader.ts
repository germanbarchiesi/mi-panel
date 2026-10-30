import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FicherosAgentes } from "@/lib/ajustes";
import { AGENTES, ordenar, parsearResultado, proximaEjecucion, type Tarjeta } from "@/lib/agentes";
import { descripcion } from "@/lib/drive";
import { GoogleReconectar, SCOPE_DRIVE_FILE, accessToken, scopesConcedidos, tieneScope } from "@/lib/google";

export type ResultadoAgentes =
  | { estado: "sin_drive" }
  | { estado: "sin_carpeta" }
  | { estado: "error" }
  | { estado: "ok"; tarjetas: Tarjeta[] };

/**
 * Lee la descripción de cada fichero de agente. Las tarjetas privadas (inversiones) solo se leen con
 * el desbloqueo por huella vigente y nunca en el PC de trabajo: el servidor ni las pide a Drive.
 */
export async function cargarAgentes(
  supabase: SupabaseClient,
  userId: string,
  ficheros: FicherosAgentes | null,
  opciones: { privadas: boolean },
): Promise<ResultadoAgentes> {
  try {
    if (!tieneScope(await scopesConcedidos(supabase, userId), SCOPE_DRIVE_FILE)) return { estado: "sin_drive" };
    if (!ficheros) return { estado: "sin_carpeta" };
    const token = await accessToken(supabase, userId);
    const ahora = Date.now();
    const tarjetas = await Promise.all(
      AGENTES.filter((a) => opciones.privadas || !a.privado).map(async (a): Promise<Tarjeta> => {
        const id = ficheros.ficheros[a.clave];
        const d = id ? await descripcion(token, id) : null;
        return { ...a, resultado: parsearResultado(d?.texto), proxima: proximaEjecucion(a.cron, ahora), ficheroCreado: !!d };
      }),
    );
    return { estado: "ok", tarjetas: ordenar(tarjetas) };
  } catch (e) {
    return { estado: e instanceof GoogleReconectar ? "sin_drive" : "error" };
  }
}
