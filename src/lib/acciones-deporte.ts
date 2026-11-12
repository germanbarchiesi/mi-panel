"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";
import { addDays, formatHora, ymdInTz, zonedToUtc } from "@/lib/agenda";
import { cargarAjustesYEstado } from "@/lib/ajustes";
import { zonaHoraria } from "@/lib/agenda-loader";
import { TIPOS_MANUALES, cuerpoStrava, tipoStrava, validarManual } from "@/lib/deporte";
import { StravaLimite, StravaRechazo, StravaReconectar, StravaSinEscritura, crearActividad, listarActividades } from "@/lib/strava";

export type EstadoApuntar =
  | { estado: "inicial" }
  | { estado: "ok"; mensaje: string; enlace: string | null }
  | { estado: "duplicado"; mensaje: string; fecha: string; tipo: string }
  | { estado: "error"; mensaje: string; reconectar?: boolean };

const DIA = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "long", day: "numeric" });

function nombreDia(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  return DIA.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * Apunta a mano un entreno que el reloj no registró: lo crea como actividad manual en Strava, que es
 * de donde el panel lee lo hecho. Si ese día ya hay uno del mismo tipo, pide confirmación (`forzar`).
 */
export async function apuntarEntreno(_: EstadoApuntar, form: FormData): Promise<EstadoApuntar> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return { estado: "error", mensaje: "La sesión ha caducado. Vuelve a entrar." };

  const { ajustes } = await cargarAjustesYEstado(supabase, user.id);
  const tz = await zonaHoraria(ajustes);
  const ahora = Date.now();
  const v = validarManual(
    {
      fecha: form.get("fecha"),
      hora: form.get("hora"),
      tipo: form.get("tipo"),
      minutos: form.get("minutos"),
      metros: form.get("metros"),
    },
    ymdInTz(ahora, tz),
    formatHora(ahora, tz),
  );
  if (!v.ok) return { estado: "error", mensaje: v.error };
  const e = v.entreno;
  const tipo = TIPOS_MANUALES[e.tipo];

  try {
    // ¿Ya hay en Strava algo del mismo tipo ese día? (por ejemplo, el reloj sincronizó tarde). Sin caché.
    if (form.get("forzar") !== "1") {
      const ini = zonedToUtc(e.fecha, "00:00", tz);
      const fin = zonedToUtc(addDays(e.fecha, 1), "00:00", tz);
      const mismo = (await listarActividades(supabase, user.id, ini / 1000, fin / 1000, { fresco: true })).find(
        (h) => h.fecha === e.fecha && tipoStrava(h.sportType) === tipoStrava(tipo.sportType),
      );
      if (mismo) {
        return {
          estado: "duplicado",
          fecha: e.fecha,
          tipo: e.tipo,
          mensaje: `El ${nombreDia(e.fecha)} ya hay en Strava «${mismo.nombre || tipo.nombre}» a las ${mismo.hora} (${Math.round(mismo.minutos)} min). ¿Es otra sesión?`,
        };
      }
    }

    const [y, m, d] = e.fecha.split("-").map(Number);
    const [hh, mm] = e.hora.split(":").map(Number);
    const offsetMin = Math.round((Date.UTC(y, m - 1, d, hh, mm) - zonedToUtc(e.fecha, e.hora, tz)) / 60_000);
    const id = await crearActividad(supabase, user.id, cuerpoStrava(e, offsetMin));
    revalidatePath("/");
    return {
      estado: "ok",
      mensaje: `Guardado en Strava: ${tipo.nombre}, ${nombreDia(e.fecha)} a las ${e.hora}, ${e.minutos} min${e.metros ? ` y ${e.metros} m` : ""}.`,
      enlace: id ? `https://www.strava.com/activities/${encodeURIComponent(id)}` : null,
    };
  } catch (err) {
    if (err instanceof StravaSinEscritura) {
      return {
        estado: "error",
        mensaje: "Strava no deja a Mi Panel crear actividades. Reconecta Strava y marca «subir actividades».",
        reconectar: true,
      };
    }
    if (err instanceof StravaReconectar) {
      return { estado: "error", mensaje: "Strava no está conectado o ha cerrado el permiso. Reconéctalo.", reconectar: true };
    }
    if (err instanceof StravaLimite) return { estado: "error", mensaje: "Strava no acepta más peticiones ahora mismo. Prueba en unos minutos." };
    if (err instanceof StravaRechazo) {
      console.error("apuntarEntreno", err.message);
      return { estado: "error", mensaje: `Strava no ha aceptado el entreno (error ${err.status}). No se ha guardado nada.` };
    }
    console.error("apuntarEntreno", err instanceof Error ? err.message : err);
    // Pudo guardarse aunque no llegara la respuesta: al repetir, la comprobación de arriba lo detecta.
    return { estado: "error", mensaje: "Strava no ha respondido. Vuelve a intentarlo: si ya se había guardado, te avisaré." };
  }
}
