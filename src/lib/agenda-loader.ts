import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  TZ_BARCELONA,
  addDays,
  construirDia,
  esZonaValida,
  type Ajustes,
  type Dia,
  type Evento,
  ymdInTz,
  zonedToUtc,
} from "@/lib/agenda";
import { listarCalendarios, listarEventos, excluidoPorDefecto, type CalendarioInfo } from "@/lib/calendar";
import { FaltaMigracion, GoogleReconectar, accessToken } from "@/lib/google";

export type ResultadoAgenda =
  | { estado: "sin_conectar" }
  | { estado: "reconectar" }
  | { estado: "falta_migracion" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; tz: string; dias: Dia[]; calendarios: string[] };

/** Zona horaria: Barcelona, o la del dispositivo (cookie "tz") si el usuario lo activó en Ajustes. */
export async function zonaHoraria(ajustes: Ajustes): Promise<string> {
  if (!ajustes.horaLocal) return TZ_BARCELONA;
  const tz = (await cookies()).get("tz")?.value;
  return tz && esZonaValida(tz) ? tz : TZ_BARCELONA;
}

export function calendariosActivos(todos: CalendarioInfo[], ajustes: Ajustes): CalendarioInfo[] {
  if (ajustes.calendarios) return todos.filter((c) => ajustes.calendarios?.includes(c.id));
  return todos.filter((c) => c.seleccionadoEnGoogle && !excluidoPorDefecto(c.nombre));
}

export async function cargarAgenda(
  supabase: SupabaseClient,
  userId: string,
  ajustes: Ajustes,
  tz: string,
): Promise<ResultadoAgenda> {
  try {
    const token = await accessToken(supabase, userId);
    const todos = await listarCalendarios(token);
    const activos = calendariosActivos(todos, ajustes);

    const ahora = Date.now();
    const hoy = ymdInTz(ahora, tz);
    const desde = zonedToUtc(hoy, "00:00", tz);
    const hasta = zonedToUtc(addDays(hoy, 8), "00:00", tz); // hoy + 7 días

    const porCalendario = await Promise.all(activos.map((c) => listarEventos(token, c, desde, hasta)));

    // Un mismo evento puede estar en dos calendarios (p. ej. el compartido): se cuenta una vez.
    const vistos = new Set<string>();
    const eventos: Evento[] = [];
    for (const e of porCalendario.flat()) {
      if (vistos.has(e.clave)) continue;
      vistos.add(e.clave);
      eventos.push(e);
    }

    const dias = Array.from({ length: 8 }, (_, i) => construirDia(addDays(hoy, i), eventos, ajustes, tz, ahora));
    return { estado: "ok", tz, dias, calendarios: activos.map((c) => c.nombre) };
  } catch (e) {
    if (e instanceof GoogleReconectar) return { estado: e.motivo === "sin_conectar" ? "sin_conectar" : "reconectar" };
    if (e instanceof FaltaMigracion) return { estado: "falta_migracion" };
    return { estado: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" };
  }
}
