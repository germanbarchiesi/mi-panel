import type { SupabaseClient } from "@supabase/supabase-js";
import { AJUSTES_POR_DEFECTO, type Ajustes, type Ventana } from "@/lib/agenda";

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function ventana(v: unknown, por_defecto: Ventana): Ventana {
  const o = (v ?? {}) as Partial<Ventana>;
  if (typeof o.ini === "string" && typeof o.fin === "string" && HM.test(o.ini) && HM.test(o.fin) && o.ini < o.fin) {
    return { ini: o.ini, fin: o.fin };
  }
  return por_defecto;
}

/** Normaliza lo guardado: cualquier dato raro vuelve al valor por defecto. */
export function normalizarAjustes(datos: unknown): Ajustes {
  const d = (datos ?? {}) as Record<string, unknown>;
  const min = Number(d.minHueco);
  return {
    calendarios: Array.isArray(d.calendarios) ? d.calendarios.filter((x): x is string => typeof x === "string") : null,
    lv: ventana(d.lv, AJUSTES_POR_DEFECTO.lv),
    fs: ventana(d.fs, AJUSTES_POR_DEFECTO.fs),
    minHueco: Number.isFinite(min) && min >= 15 && min <= 240 ? Math.round(min) : AJUSTES_POR_DEFECTO.minHueco,
    horaLocal: d.horaLocal === true,
    variosDiasComoContexto: d.variosDiasComoContexto !== false, // por defecto, sí
  };
}

export async function cargarAjustes(supabase: SupabaseClient, userId: string): Promise<Ajustes> {
  return (await cargarAjustesYEstado(supabase, userId)).ajustes;
}

/** Ajustes y hora de la última respuesta correcta de Mis tareas (no se guarda ninguna tarea). */
export async function cargarAjustesYEstado(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ajustes: Ajustes; misTareasUltimoOk: number | null; excel: FicheroElegido | null }> {
  const { data } = await supabase.from("ajustes").select("datos").eq("user_id", userId).maybeSingle();
  const raw = (data?.datos ?? {}) as Record<string, unknown>;
  const t = typeof raw.misTareasUltimoOk === "string" ? Date.parse(raw.misTareasUltimoOk) : NaN;
  return { ajustes: normalizarAjustes(raw), misTareasUltimoOk: Number.isFinite(t) ? t : null, excel: ficheroElegido(raw.excel) };
}

/** Excel de cuentas elegido con el selector de Google: solo su id y su nombre. */
export type FicheroElegido = { id: string; nombre: string };

function ficheroElegido(v: unknown): FicheroElegido | null {
  const o = (v ?? {}) as Record<string, unknown>;
  return typeof o.id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(o.id) && typeof o.nombre === "string"
    ? { id: o.id, nombre: o.nombre.slice(0, 200) }
    : null;
}

export async function guardarExcel(supabase: SupabaseClient, userId: string, excel: FicheroElegido | null) {
  const datos = { ...(await leerDatos(supabase, userId)), excel };
  return supabase.from("ajustes").upsert({ user_id: userId, datos, actualizado: new Date().toISOString() });
}

async function leerDatos(supabase: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("ajustes").select("datos").eq("user_id", userId).maybeSingle();
  return (data?.datos ?? {}) as Record<string, unknown>;
}

export async function guardarAjustes(supabase: SupabaseClient, userId: string, ajustes: Ajustes) {
  // Se conservan los demás campos guardados (p. ej. misTareasUltimoOk).
  const datos = { ...(await leerDatos(supabase, userId)), ...ajustes };
  return supabase.from("ajustes").upsert({ user_id: userId, datos, actualizado: new Date().toISOString() });
}

const CADA = 5 * 60_000;

/**
 * Anota la hora de la última respuesta correcta de Mis tareas. Para no escribir en cada carga,
 * solo si la anterior tiene más de 5 minutos. Fallar aquí no debe romper el panel.
 */
export async function registrarOkMisTareas(
  supabase: SupabaseClient,
  userId: string,
  anterior: number | null,
  ahora: number,
) {
  if (anterior !== null && ahora - anterior < CADA) return;
  try {
    const datos = { ...(await leerDatos(supabase, userId)), misTareasUltimoOk: new Date(ahora).toISOString() };
    await supabase.from("ajustes").upsert({ user_id: userId, datos, actualizado: new Date().toISOString() });
  } catch {
    // Sin consecuencias: solo se pierde la hora mostrada en Ajustes.
  }
}
