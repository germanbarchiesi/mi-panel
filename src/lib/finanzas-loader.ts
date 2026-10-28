import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FicheroElegido } from "@/lib/ajustes";
import { FicheroNoDisponible, descargar, metadatos } from "@/lib/drive";
import { LECTURA, datosDelLibro, resumir, type Datos, type Resumen } from "@/lib/finanzas";
import { FaltaMigracion, GoogleReconectar, SCOPE_DRIVE_FILE, accessToken, scopesConcedidos, tieneScope } from "@/lib/google";
import { LibroInvalido, leerLibro } from "@/lib/xlsx";

// Lee el Excel elegido de Drive al abrir el panel. Los movimientos solo viven en la memoria del
// servidor (nunca en la base de datos); se vuelve a descargar solo si el fichero cambió en Drive.

export type ResultadoFinanzas =
  | { estado: "sin_drive" }
  | { estado: "sin_excel" }
  | { estado: "reconectar" }
  | { estado: "no_disponible" }
  | { estado: "invalido"; mensaje: string }
  | { estado: "error" }
  | { estado: "ok"; resumen: Resumen; fichero: { nombre: string; modificado: string } };

let cache: { clave: string; datos: Datos } | null = null;

export async function cargarFinanzas(
  supabase: SupabaseClient,
  userId: string,
  excel: FicheroElegido | null,
  hoy: string,
): Promise<ResultadoFinanzas> {
  try {
    if (!tieneScope(await scopesConcedidos(supabase, userId), SCOPE_DRIVE_FILE)) return { estado: "sin_drive" };
    if (!excel) return { estado: "sin_excel" };
    const token = await accessToken(supabase, userId);
    const meta = await metadatos(token, excel.id);
    const clave = `${userId}:${meta.id}:${meta.version}`;
    if (cache?.clave !== clave) {
      cache = null;
      const datos = datosDelLibro(leerLibro(await descargar(token, meta), LECTURA));
      cache = { clave, datos };
    }
    return { estado: "ok", resumen: resumir(cache.datos, hoy), fichero: { nombre: meta.nombre, modificado: meta.modificado } };
  } catch (e) {
    if (e instanceof GoogleReconectar || e instanceof FaltaMigracion) return { estado: "reconectar" };
    if (e instanceof FicheroNoDisponible) return { estado: "no_disponible" };
    if (e instanceof LibroInvalido) return { estado: "invalido", mensaje: e.message };
    return { estado: "error" };
  }
}
