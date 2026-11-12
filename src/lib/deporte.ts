// Deporte (fase 7): semana planificada (calendario «Deporte») frente a la hecha (Strava).
// Lógica pura: se prueba con `npm test`.

import { addDays, weekday } from "./agenda.ts";

export type Tipo = "natacion" | "fuerza" | "otro";

/** `minutos`: lo que dura el evento del calendario (si tiene hora). */
export type Planificado = { fecha: string; hora: string | null; titulo: string; minutos?: number };
export type Hecho = {
  id: string;
  fecha: string; // YYYY-MM-DD local de la actividad
  hora: string; // HH:MM
  nombre: string;
  sportType: string;
  minutos: number;
  metros: number;
  /** Apuntada a mano (en Strava o desde Mi Panel), no registrada con el reloj. */
  manual?: boolean;
};

export type EstadoPlan = "hecho" | "no_hecho" | "pendiente" | "planificado";

export type DiaDeporte = {
  fecha: string;
  esHoy: boolean;
  plan: { titulo: string; hora: string | null; minutos?: number; tipo: Tipo; estado: EstadoPlan; hecho?: Hecho }[];
  extras: Hecho[]; // hecho sin planificar (natación o fuerza)
};

export type Semana = {
  desde: string; // lunes
  hasta: string; // domingo
  dias: DiaDeporte[];
  planificados: number;
  cumplidos: number;
  pendientes: number; // hoy o más adelante
  extras: number;
  minutos: number; // de natación y fuerza
  metrosNatacion: number;
  sesiones: { natacion: number; fuerza: number };
};

/** Tipo de una actividad de Strava. CrossFit se registra a menudo como WeightTraining: van juntos. */
export function tipoStrava(sportType: string): Tipo | null {
  if (sportType === "Swim") return "natacion";
  if (["WeightTraining", "Crossfit", "Workout", "HighIntensityIntervalTraining"].includes(sportType)) return "fuerza";
  return null; // paseos, etc.: no cuentan
}

/** Tipo de un evento planificado, por su título. */
export function tipoPlan(titulo: string): Tipo {
  const t = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (/(natac|nadar|swim|piscina|panteres)/.test(t)) return "natacion";
  if (/(crossfit|cross fit|fuerza|pesas|gym|gimnas|wod|piernas|legs)/.test(t)) return "fuerza";
  return "otro";
}

/** Lunes de la semana de una fecha. */
export function lunesDe(ymd: string): string {
  const dow = weekday(ymd); // 0 = domingo
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

export function construirSemana(planificados: Planificado[], hechos: Hecho[], hoy: string): Semana {
  const desde = lunesDe(hoy);
  const hasta = addDays(desde, 6);
  const cuentan = hechos.filter((h) => tipoStrava(h.sportType) !== null && h.fecha >= desde && h.fecha <= hasta);
  const usados = new Set<string>();

  const dias: DiaDeporte[] = Array.from({ length: 7 }, (_, i) => {
    const fecha = addDays(desde, i);
    const delDia = cuentan.filter((h) => h.fecha === fecha).sort((a, b) => a.hora.localeCompare(b.hora));
    const plan = planificados
      .filter((p) => p.fecha === fecha)
      .sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""))
      .map((p) => {
        const tipo = tipoPlan(p.titulo);
        // Se empareja con una actividad del mismo tipo de ese día (o de cualquier tipo si el plan es «otro»).
        const h = delDia.find((x) => !usados.has(x.id) && (tipo === "otro" || tipoStrava(x.sportType) === tipo));
        if (h) usados.add(h.id);
        const estado: EstadoPlan = h ? "hecho" : fecha < hoy ? "no_hecho" : fecha === hoy ? "pendiente" : "planificado";
        return {
          titulo: p.titulo,
          hora: p.hora,
          ...(p.minutos ? { minutos: p.minutos } : {}),
          tipo,
          estado,
          ...(h ? { hecho: h } : {}),
        };
      });
    return { fecha, esHoy: fecha === hoy, plan, extras: [] as Hecho[] };
  });
  for (const d of dias) d.extras = cuentan.filter((h) => h.fecha === d.fecha && !usados.has(h.id));

  const planes = dias.flatMap((d) => d.plan);
  return {
    desde,
    hasta,
    dias,
    planificados: planes.length,
    cumplidos: planes.filter((p) => p.estado === "hecho").length,
    pendientes: planes.filter((p) => p.estado === "pendiente" || p.estado === "planificado").length,
    extras: dias.reduce((s, d) => s + d.extras.length, 0),
    minutos: Math.round(cuentan.reduce((s, h) => s + h.minutos, 0)),
    metrosNatacion: Math.round(cuentan.filter((h) => h.sportType === "Swim").reduce((s, h) => s + h.metros, 0)),
    sesiones: {
      natacion: cuentan.filter((h) => tipoStrava(h.sportType) === "natacion").length,
      fuerza: cuentan.filter((h) => tipoStrava(h.sportType) === "fuerza").length,
    },
  };
}

/** Actividad de la API de Strava (/athlete/activities) → Hecho. Ignora lo que no tenga forma válida. */
export function leerActividad(a: unknown): Hecho | null {
  const o = a as {
    id?: number | string;
    name?: string;
    sport_type?: string;
    type?: string;
    start_date_local?: string;
    moving_time?: number;
    elapsed_time?: number;
    distance?: number;
    manual?: boolean;
  };
  const local = o?.start_date_local;
  if (!o || (typeof o.id !== "number" && typeof o.id !== "string") || typeof local !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null;
  return {
    id: String(o.id),
    // start_date_local trae una «Z» pero es la hora local de donde se hizo la actividad.
    fecha: local.slice(0, 10),
    hora: local.slice(11, 16),
    nombre: (typeof o.name === "string" ? o.name : "").slice(0, 120),
    sportType: typeof o.sport_type === "string" ? o.sport_type : typeof o.type === "string" ? o.type : "",
    // Las manuales no tienen tiempo en movimiento: se usa el total.
    minutos: (typeof o.moving_time === "number" && o.moving_time > 0 ? o.moving_time : typeof o.elapsed_time === "number" ? o.elapsed_time : 0) / 60,
    metros: typeof o.distance === "number" ? o.distance : 0,
    ...(o.manual === true ? { manual: true } : {}),
  };
}

// --- Entreno apuntado a mano (se crea como actividad manual en Strava) -------------------------

export type TipoManual = "natacion" | "crossfit" | "fuerza";

/** Lo que se ofrece en el formulario y cómo se guarda en Strava (tipoStrava los vuelve a reconocer). */
export const TIPOS_MANUALES: Record<TipoManual, { nombre: string; sportType: string }> = {
  natacion: { nombre: "Natación", sportType: "Swim" },
  crossfit: { nombre: "CrossFit", sportType: "Crossfit" },
  fuerza: { nombre: "Fuerza", sportType: "WeightTraining" },
};

/** Cuántos días atrás se puede apuntar (hoy incluido): una semana. */
export const DIAS_APUNTAR = 7;

/** Tipo del formulario que corresponde a una sesión planificada, por su título. */
export function tipoManualDePlan(titulo: string): TipoManual | null {
  const tipo = tipoPlan(titulo);
  if (tipo === "natacion") return "natacion";
  if (tipo !== "fuerza") return null;
  const t = titulo.toLowerCase();
  return /(crossfit|cross fit|wod)/.test(t) ? "crossfit" : "fuerza";
}

/**
 * Un día que se puede apuntar. `hora`: la hora de inicio que se propone. `sugerencia`: la sesión
 * planificada que quedó sin hacer ese día (tipo y duración del evento), si la hay.
 */
export type OpcionDia = {
  fecha: string;
  etiqueta: string;
  hora: string;
  sugerencia: { tipo: TipoManual; minutos: number | null } | null;
};

const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const HORA_POR_DEFECTO = "20:00";

/** Hoy, sin sesión que proponer: el entreno que acaba de terminar (hace una hora, en cuartos). */
function horaReciente(ahora: string): string {
  const [h, m] = ahora.split(":").map(Number);
  const min = Math.max(0, h * 60 + m - (m % 15) - 60);
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/**
 * Días que se pueden apuntar (de hoy hacia atrás, `ahora` en «HH:MM») con lo que se propone para cada uno.
 * La sesión de hoy solo se propone si su hora ya ha pasado. `elegido`: hoy o ayer si tienen una sesión sin
 * hacer (en ese orden); si no, hoy. Las de días anteriores se ven en la lista, pero no se eligen solas.
 */
export function diasParaApuntar(semana: Semana, hoy: string, ahora: string): { opciones: OpcionDia[]; elegido: string } {
  const opciones: OpcionDia[] = [];
  for (let i = 0; i < DIAS_APUNTAR; i++) {
    const fecha = addDays(hoy, -i);
    const dia = semana.dias.find((d) => d.fecha === fecha);
    const falta = dia?.plan.find(
      (p) =>
        (p.estado === "no_hecho" || (p.estado === "pendiente" && (p.hora === null || p.hora <= ahora))) &&
        tipoManualDePlan(p.titulo),
    );
    const etiqueta = i === 0 ? "Hoy" : i === 1 ? "Ayer" : `${DIA_CORTO[weekday(fecha)]} ${Number(fecha.slice(8))}`;
    opciones.push({
      fecha,
      etiqueta,
      hora: falta?.hora ?? (i === 0 ? horaReciente(ahora) : HORA_POR_DEFECTO),
      sugerencia: falta ? { tipo: tipoManualDePlan(falta.titulo) as TipoManual, minutos: falta.minutos ?? null } : null,
    });
  }
  const elegido = opciones[0].sugerencia || !opciones[1].sugerencia ? hoy : opciones[1].fecha;
  return { opciones, elegido };
}

export type EntrenoManual = { fecha: string; hora: string; tipo: TipoManual; minutos: number; metros: number };

/**
 * Comprueba lo que llega del formulario. `hoy` y `ahora` («HH:MM») en la zona del usuario: no se puede
 * apuntar más de una semana atrás ni algo que aún no ha empezado.
 */
export function validarManual(
  campos: { fecha?: unknown; hora?: unknown; tipo?: unknown; minutos?: unknown; metros?: unknown },
  hoy: string,
  ahora: string,
): { ok: true; entreno: EntrenoManual } | { ok: false; error: string } {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const fecha = texto(campos.fecha);
  const hora = texto(campos.hora);
  const tipo = texto(campos.tipo);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy || fecha < addDays(hoy, -(DIAS_APUNTAR - 1)))
    return { ok: false, error: "Elige un día de esta última semana." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { ok: false, error: "La hora no es válida." };
  if (fecha === hoy && hora > ahora) return { ok: false, error: "Esa hora aún no ha llegado." };
  if (!(tipo in TIPOS_MANUALES)) return { ok: false, error: "Elige natación, CrossFit o fuerza." };
  const minutos = Number(texto(campos.minutos));
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 600) return { ok: false, error: "La duración va de 1 a 600 minutos." };
  const crudo = texto(campos.metros);
  const metros = tipo === "natacion" && crudo !== "" ? Number(crudo) : 0;
  if (!Number.isInteger(metros) || metros < 0 || metros > 20000) return { ok: false, error: "Los metros van de 0 a 20.000." };
  return { ok: true, entreno: { fecha, hora, tipo: tipo as TipoManual, minutos, metros } };
}

/** Campos del POST /activities de Strava. `offsetMin`: diferencia de la zona del usuario con UTC ese día. */
export function cuerpoStrava(e: EntrenoManual, offsetMin: number): Record<string, string> {
  const signo = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const zona = `${signo}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const t = TIPOS_MANUALES[e.tipo];
  return {
    name: t.nombre,
    sport_type: t.sportType,
    start_date_local: `${e.fecha}T${e.hora}:00${zona}`,
    elapsed_time: String(e.minutos * 60),
    description: "Apuntado a mano desde Mi Panel.",
    ...(e.metros > 0 ? { distance: String(e.metros) } : {}),
  };
}
