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
  };
}

export async function cargarAjustes(supabase: SupabaseClient, userId: string): Promise<Ajustes> {
  const { data } = await supabase.from("ajustes").select("datos").eq("user_id", userId).maybeSingle();
  return normalizarAjustes(data?.datos);
}

export async function guardarAjustes(supabase: SupabaseClient, userId: string, ajustes: Ajustes) {
  return supabase
    .from("ajustes")
    .upsert({ user_id: userId, datos: ajustes, actualizado: new Date().toISOString() });
}
