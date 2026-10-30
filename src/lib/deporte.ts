// Deporte (fase 7): semana planificada (calendario «Deporte») frente a la hecha (Strava).
// Lógica pura: se prueba con `npm test`.

import { addDays, weekday } from "./agenda.ts";

export type Tipo = "natacion" | "fuerza" | "otro";

export type Planificado = { fecha: string; hora: string | null; titulo: string };
export type Hecho = {
  id: string;
  fecha: string; // YYYY-MM-DD local de la actividad
  hora: string; // HH:MM
  nombre: string;
  sportType: string;
  minutos: number;
  metros: number;
};

export type EstadoPlan = "hecho" | "no_hecho" | "pendiente" | "planificado";

export type DiaDeporte = {
  fecha: string;
  esHoy: boolean;
  plan: { titulo: string; hora: string | null; tipo: Tipo; estado: EstadoPlan; hecho?: Hecho }[];
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
        return { titulo: p.titulo, hora: p.hora, tipo, estado, ...(h ? { hecho: h } : {}) };
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
    distance?: number;
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
    minutos: typeof o.moving_time === "number" ? o.moving_time / 60 : 0,
    metros: typeof o.distance === "number" ? o.distance : 0,
  };
}
