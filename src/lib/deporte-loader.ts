import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, formatHora, ymdInTz, zonedToUtc } from "@/lib/agenda";
import { listarCalendarios, listarEventos } from "@/lib/calendar";
import { GoogleReconectar, accessToken } from "@/lib/google";
import { construirSemana, lunesDe, type Planificado, type Semana } from "@/lib/deporte";
import { StravaReconectar, listarActividades } from "@/lib/strava";

// Semana planificada (calendario «Deporte» de Google) frente a la hecha (Strava). Nada se guarda.

export type EstadoStrava = "ok" | StravaReconectar["motivo"] | "error";
export type EstadoCalendario = "ok" | "sin_calendario" | "sin_google" | "error";

export type ResultadoDeporte = { semana: Semana; strava: EstadoStrava; calendario: EstadoCalendario };

const ES_DEPORTE = /^deporte$/i;

export async function cargarDeporte(supabase: SupabaseClient, userId: string, tz: string, hoy: string): Promise<ResultadoDeporte> {
  const lunes = lunesDe(hoy);
  const ini = zonedToUtc(lunes, "00:00", tz);
  const fin = zonedToUtc(addDays(lunes, 7), "00:00", tz);

  const plan = (async (): Promise<{ estado: EstadoCalendario; lista: Planificado[] }> => {
    try {
      const token = await accessToken(supabase, userId);
      const cal = (await listarCalendarios(token)).find((c) => ES_DEPORTE.test(c.nombre.trim()));
      if (!cal) return { estado: "sin_calendario", lista: [] };
      const lista: Planificado[] = [];
      for (const e of await listarEventos(token, cal, ini, fin)) {
        if (e.todoElDia && e.diaIni && e.diaFin) {
          for (let d = e.diaIni; d < e.diaFin; d = addDays(d, 1)) lista.push({ fecha: d, hora: null, titulo: e.titulo });
        } else if (e.inicio !== undefined) {
          lista.push({ fecha: ymdInTz(e.inicio, tz), hora: formatHora(e.inicio, tz), titulo: e.titulo });
        }
      }
      return { estado: "ok", lista };
    } catch (e) {
      return { estado: e instanceof GoogleReconectar ? "sin_google" : "error", lista: [] };
    }
  })();

  const hechos = (async () => {
    try {
      return { estado: "ok" as EstadoStrava, lista: await listarActividades(supabase, userId, ini / 1000, fin / 1000) };
    } catch (e) {
      return { estado: (e instanceof StravaReconectar ? e.motivo : "error") as EstadoStrava, lista: [] };
    }
  })();

  const [p, h] = await Promise.all([plan, hechos]);
  return { semana: construirSemana(p.lista, h.lista, hoy), strava: h.estado, calendario: p.estado };
}
