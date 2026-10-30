// Agentes (fase 8): tarjetas con el último resultado de cada tarea programada de Claude.
// El puente es Drive: la app crea un fichero por agente en «Mi Panel · Agentes» (así lo puede
// leer con drive.file) y cada tarea escribe su resultado, en JSON, en la DESCRIPCIÓN de su fichero.
// Todo lo que llega de ahí es dato no confiable: se valida y se recorta. Lógica pura con tests.

import { addDays, weekday, ymdInTz, zonedToUtc } from "./agenda.ts";

export const CARPETA_AGENTES = "Mi Panel · Agentes";
export const TZ_AGENTES = "Europe/Madrid";

export type DefAgente = {
  clave: string;
  nombre: string;
  grupo: string;
  fichero: string;
  cron: string; // "m h dom * dow", hora de Madrid
  programacion: string;
  privado: boolean;
};

/** Las tareas programadas que tienen tarjeta. El nombre del fichero es el que buscan las tareas. */
export const AGENTES: DefAgente[] = [
  {
    clave: "vuelos",
    nombre: "Alerta vuelos noviembre 2027",
    grupo: "Viaje Tailandia",
    fichero: "mi-panel-agente-vuelos.json",
    cron: "53 8 * * 1",
    programacion: "Lunes, 8:53",
    privado: false,
  },
  {
    clave: "yipeng",
    nombre: "Alerta Yi Peng 2027",
    grupo: "Viaje Tailandia",
    fichero: "mi-panel-agente-yipeng.json",
    cron: "47 8 1,15 * *",
    programacion: "Días 1 y 15, 8:47",
    privado: false,
  },
  {
    clave: "regalo",
    nombre: "Monitor regalo cumple Mati",
    grupo: "Regalo Mati",
    fichero: "mi-panel-agente-regalo.json",
    cron: "36 8 1,15 * *",
    programacion: "Días 1 y 15, 8:36",
    privado: false,
  },
  {
    clave: "inversiones",
    nombre: "Informe semanal de inversiones",
    grupo: "Inversiones",
    fichero: "mi-panel-agente-inversiones.json",
    cron: "47 9 * * 0",
    programacion: "Domingos, 9:47",
    privado: true,
  },
];

export type Estado = "alerta" | "novedad" | "error" | "sin_novedades";

export type Resultado = {
  ejecutado: number; // ms
  estado: Estado;
  titular: string;
  puntos: string[];
  enlace: string | null;
};

const ESTADOS: Estado[] = ["alerta", "novedad", "error", "sin_novedades"];
const MAX_TITULAR = 200;
const MAX_PUNTO = 200;

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Solo enlaces https (nada de javascript:, data:…). */
export function enlaceSeguro(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** JSON escrito por la tarea → Resultado; null si no hay o no es válido. */
export function parsearResultado(bruto: string | null | undefined): Resultado | null {
  if (!bruto || bruto.length > 20_000) return null;
  let o: Record<string, unknown>;
  try {
    // La tarea a veces lo envuelve en ```json … ```: se toma del primer { al último }.
    const ini = bruto.indexOf("{");
    const fin = bruto.lastIndexOf("}");
    if (ini < 0 || fin <= ini) return null;
    o = JSON.parse(bruto.slice(ini, fin + 1));
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const ejecutado = typeof o.ejecutado === "string" ? Date.parse(o.ejecutado) : NaN;
  if (!Number.isFinite(ejecutado)) return null;
  const estado = ESTADOS.includes(o.estado as Estado) ? (o.estado as Estado) : "novedad";
  const titular = texto(o.titular, MAX_TITULAR);
  if (!titular) return null;
  const puntos = (Array.isArray(o.puntos) ? o.puntos : [])
    .map((p) => texto(p, MAX_PUNTO))
    .filter(Boolean)
    .slice(0, 3);
  return { ejecutado, estado, titular, puntos, enlace: enlaceSeguro(o.enlace) };
}

function lista(campo: string, min: number, max: number): number[] | null {
  if (campo === "*") return null;
  const xs = campo.split(",").map(Number);
  if (xs.some((x) => !Number.isInteger(x) || x < min || x > max)) throw new Error(`cron no válido: ${campo}`);
  return xs;
}

/** Próxima ejecución de un cron sencillo («m h dom * dow») en una zona horaria. */
export function proximaEjecucion(cron: string, ahora: number, tz = TZ_AGENTES): number | null {
  const [m, h, dom, mes, dow] = cron.trim().split(/\s+/);
  if (mes !== "*") return null;
  const dias = lista(dom, 1, 31);
  const semana = lista(dow, 0, 6);
  const hm = `${String(Number(h)).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}`;
  const hoy = ymdInTz(ahora, tz);
  for (let i = 0; i < 70; i++) {
    const d = addDays(hoy, i);
    if (dias && !dias.includes(Number(d.slice(8, 10)))) continue;
    if (semana && !semana.includes(weekday(d))) continue;
    const t = zonedToUtc(d, hm, tz);
    if (t > ahora) return t;
  }
  return null;
}

export type Tarjeta = DefAgente & { resultado: Resultado | null; proxima: number | null; ficheroCreado: boolean };

const ORDEN: Record<Estado, number> = { alerta: 0, novedad: 1, error: 2, sin_novedades: 3 };

/** Novedades y alertas primero; luego lo más reciente; las que nunca han escrito, al final. */
export function ordenar(ts: Tarjeta[]): Tarjeta[] {
  return [...ts].sort((a, b) => {
    const ea = a.resultado ? ORDEN[a.resultado.estado] : 9;
    const eb = b.resultado ? ORDEN[b.resultado.estado] : 9;
    if (ea !== eb) return ea - eb;
    return (b.resultado?.ejecutado ?? 0) - (a.resultado?.ejecutado ?? 0);
  });
}

/** Contenido inicial del fichero (la tarea escribe luego en la descripción). */
export function contenidoInicial(a: DefAgente): string {
  return JSON.stringify(
    {
      agente: a.nombre,
      grupo: a.grupo,
      nota: "Fichero de Mi Panel. La tarea programada escribe su último resultado en la descripción de este fichero. No lo borres ni lo renombres.",
    },
    null,
    2,
  );
}
