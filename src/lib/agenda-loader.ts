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
import {
  listarCalendarios,
  listarEventos,
  excluidoPorDefecto,
  esCalendarioMisTareas,
  type CalendarioInfo,
} from "@/lib/calendar";
import { FaltaMigracion, GoogleReconectar, accessToken } from "@/lib/google";
import { ocupadoAEventos, type Ambito, type Fallo } from "@/lib/mis-tareas";
import { pedirOcupado } from "@/lib/mis-tareas-api";

export type ResultadoAgenda =
  | { estado: "sin_conectar" }
  | { estado: "reconectar" }
  | { estado: "falta_migracion" }
  | { estado: "error"; mensaje: string }
  | { estado: "ok"; tz: string; dias: Dia[]; calendarios: string[]; tareas: "ok" | Fallo };

/** «Hoy» de Mi Panel (YYYY-MM-DD) en su zona horaria. Es lo que se envía a Mis tareas como fecha. */
export function hoyEn(tz: string): string {
  return ymdInTz(Date.now(), tz);
}

/** Zona horaria: Barcelona, o la del dispositivo (cookie "tz") si el usuario lo activó en Ajustes. */
export async function zonaHoraria(ajustes: Ajustes): Promise<string> {
  if (!ajustes.horaLocal) return TZ_BARCELONA;
  const tz = (await cookies()).get("tz")?.value;
  return tz && esZonaValida(tz) ? tz : TZ_BARCELONA;
}

export function calendariosActivos(todos: CalendarioInfo[], ajustes: Ajustes): CalendarioInfo[] {
  const leibles = todos.filter((c) => !esCalendarioMisTareas(c.nombre));
  if (ajustes.calendarios) return leibles.filter((c) => ajustes.calendarios?.includes(c.id));
  return leibles.filter((c) => c.seleccionadoEnGoogle && !excluidoPorDefecto(c.nombre));
}

export async function cargarAgenda(
  supabase: SupabaseClient,
  userId: string,
  ajustes: Ajustes,
  tz: string,
  ambito?: Ambito,
): Promise<ResultadoAgenda> {
  const ahora = Date.now();
  const hoy = ymdInTz(ahora, tz);
  // Tareas con hora de Mis tareas (hoy + 7 días), en paralelo con Google. Si falla, la Agenda sigue.
  const tareasP = pedirOcupado(hoy, 8, ambito).catch(() => ({ ok: false as const, fallo: "respuesta" as const }));
  try {
    const token = await accessToken(supabase, userId);
    const todos = await listarCalendarios(token);
    const activos = calendariosActivos(todos, ajustes);

    const desde = zonedToUtc(hoy, "00:00", tz);
    const hasta = zonedToUtc(addDays(hoy, 8), "00:00", tz); // hoy + 7 días

    const [porCalendario, tareas] = await Promise.all([
      Promise.all(activos.map((c) => listarEventos(token, c, desde, hasta))),
      tareasP,
    ]);

    // Un mismo evento puede estar en dos calendarios (p. ej. el compartido): se cuenta una vez.
    const vistos = new Set<string>();
    const eventos: Evento[] = [];
    for (const e of porCalendario.flat()) {
      if (vistos.has(e.clave)) continue;
      vistos.add(e.clave);
      eventos.push(e);
    }
    if (tareas.ok) eventos.push(...ocupadoAEventos(tareas.datos, tz));

    const dias = Array.from({ length: 8 }, (_, i) => construirDia(addDays(hoy, i), eventos, ajustes, tz, ahora));
    return {
      estado: "ok",
      tz,
      dias,
      calendarios: activos.map((c) => c.nombre),
      tareas: tareas.ok ? "ok" : tareas.fallo,
    };
  } catch (e) {
    if (e instanceof GoogleReconectar) return { estado: e.motivo === "sin_conectar" ? "sin_conectar" : "reconectar" };
    if (e instanceof FaltaMigracion) return { estado: "falta_migracion" };
    return { estado: "error", mensaje: e instanceof Error ? e.message : "Error desconocido" };
  }
}
