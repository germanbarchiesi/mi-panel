// Lógica pura de la integración con Mis tareas (API v1, solo lectura): validación de las
// respuestas, separación por ámbito, tareas con hora para la Agenda y texto del resumen.
// Sin red ni Next: se prueba con `npm test`. Las llamadas viven en mis-tareas-api.ts (solo servidor).

import { zonedToUtc, type Evento } from "./agenda.ts";

export type Ambito = "trabajo" | "personal";
export type Seleccion = Ambito | "todo";
export type Prioridad = "alta" | "media" | "baja";

export type Etiqueta = { nombre: string; color: string | null };

export type TareaHoy = {
  id: string;
  titulo: string;
  hora: string | null; // "HH:MM"
  duracionMin: number | null;
  prioridad: Prioridad | null;
  ambito: Ambito;
  proyectos: Etiqueta[];
  etiquetas: Etiqueta[];
  personas: string[];
};

export type TareaArrastrada = {
  id: string;
  titulo: string;
  dias: number;
  prioridad: Prioridad | null;
  ambito: Ambito;
};

export type TemasPersona = { persona: string; reunionHoy: boolean; temas: string[] };

export type Resumen = {
  fecha: string;
  zonaHoraria: string;
  hoy: TareaHoy[];
  arrastradas: TareaArrastrada[];
  temas: TemasPersona[];
};

export type TareaOcupada = {
  id: string;
  fecha: string;
  hora: string;
  duracionMin: number | null;
  titulo: string;
  ambito: Ambito;
};

export type Ocupado = { desde: string; dias: number; zonaHoraria: string; ocupado: TareaOcupada[] };

export class RespuestaInvalida extends Error {}

export type Fallo = "sin_configurar" | "clave" | "peticion" | "limite" | "caido" | "red" | "respuesta";

export const MENSAJES_FALLO: Record<Fallo, string> = {
  sin_configurar: "Falta configurar MIS_TAREAS_API_URL o MIS_TAREAS_API_KEY en Vercel.",
  clave: "Mis tareas ha rechazado la clave (401). Crea una nueva en Mis tareas y cámbiala en Vercel.",
  peticion: "Mis tareas no ha aceptado la petición (400).",
  limite: "Demasiadas consultas a Mis tareas (429). Se reintenta en un minuto.",
  caido: "Mis tareas no responde ahora mismo (error del servidor).",
  red: "No se ha podido contactar con Mis tareas.",
  respuesta: "Mis tareas ha respondido con un formato inesperado.",
};


const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_TEXTO = 300;
const MAX_ITEMS = 200;

export function esFecha(s: unknown): s is string {
  return typeof s === "string" && YMD.test(s);
}

export function parsearSeleccion(v: unknown): Seleccion | null {
  return v === "trabajo" || v === "personal" || v === "todo" ? v : null;
}

/** Ámbito con el que abre el módulo: Trabajo en el PC de Appliant, Todo en el resto. */
export function seleccionInicial(pedida: unknown, equipoTrabajo: boolean): Seleccion {
  return parsearSeleccion(pedida) ?? (equipoTrabajo ? "trabajo" : "todo");
}

/** Parámetro &ambito= para la API: no se envía en «Todo». */
export function ambitoApi(sel: Seleccion): Ambito | undefined {
  return sel === "todo" ? undefined : sel;
}

// --- Validación -------------------------------------------------------------------------
// Todo lo que viene de la API se trata como no confiable: tipos comprobados, textos recortados
// y colores solo si son #RRGGBB (se usan en estilos en línea).

type Obj = Record<string, unknown>;

function obj(v: unknown, campo: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new RespuestaInvalida(`${campo}: no es un objeto`);
  return v as Obj;
}

function lista(v: unknown, campo: string): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new RespuestaInvalida(`${campo}: no es una lista`);
  return v.slice(0, MAX_ITEMS);
}

function texto(v: unknown, campo: string): string {
  if (typeof v !== "string") throw new RespuestaInvalida(`${campo}: falta el texto`);
  const t = v.trim().slice(0, MAX_TEXTO);
  return t || "(sin título)";
}

function textoOpcional(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_TEXTO) : null;
}

function ambito(v: unknown, campo: string): Ambito {
  if (v === "trabajo" || v === "personal") return v;
  throw new RespuestaInvalida(`${campo}: ámbito desconocido`);
}

function prioridad(v: unknown): Prioridad | null {
  return v === "alta" || v === "media" || v === "baja" ? v : null;
}

function hora(v: unknown): string | null {
  return typeof v === "string" && HM.test(v) ? v : null;
}

function minutos(v: unknown): number | null {
  const n = Number(v);
  return v !== null && v !== undefined && Number.isFinite(n) && n > 0 && n <= 24 * 60 ? Math.round(n) : null;
}

function etiquetas(v: unknown, campo: string): Etiqueta[] {
  return lista(v, campo).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Obj;
    const nombre = textoOpcional(o.nombre);
    if (!nombre) return [];
    return [{ nombre, color: typeof o.color === "string" && HEX.test(o.color) ? o.color : null }];
  });
}

function personas(v: unknown): string[] {
  return lista(v, "personas").flatMap((x) => {
    // Lista de nombres; se acepta también { nombre } por si la API lo cambia dentro de la v1.
    const n = typeof x === "string" ? textoOpcional(x) : x && typeof x === "object" ? textoOpcional((x as Obj).nombre) : null;
    return n ? [n] : [];
  });
}

function version1(o: Obj) {
  if (o.version !== 1) throw new RespuestaInvalida(`versión ${String(o.version)} no soportada`);
}

export function parsearResumen(json: unknown): Resumen {
  const o = obj(json, "resumen");
  version1(o);
  if (!esFecha(o.fecha)) throw new RespuestaInvalida("resumen: fecha no válida");

  const hoy = lista(o.pendientes_hoy, "pendientes_hoy").map((x, i): TareaHoy => {
    const t = obj(x, `pendientes_hoy[${i}]`);
    const h = hora(t.hora);
    return {
      id: texto(t.id, "id"),
      titulo: texto(t.titulo, "titulo"),
      hora: h,
      duracionMin: h ? minutos(t.duracion_min) : null,
      prioridad: prioridad(t.prioridad),
      ambito: ambito(t.ambito, `pendientes_hoy[${i}].ambito`),
      proyectos: etiquetas(t.proyectos, "proyectos"),
      etiquetas: etiquetas(t.etiquetas, "etiquetas"),
      personas: personas(t.personas),
    };
  });

  const arrastradas = lista(o.arrastradas, "arrastradas").map((x, i): TareaArrastrada => {
    const t = obj(x, `arrastradas[${i}]`);
    const d = Number(t.dias_arrastrada);
    return {
      id: texto(t.id, "id"),
      titulo: texto(t.titulo, "titulo"),
      dias: Number.isFinite(d) && d >= 1 ? Math.floor(d) : 1,
      prioridad: prioridad(t.prioridad),
      ambito: ambito(t.ambito, `arrastradas[${i}].ambito`),
    };
  });

  const temas = lista(o.temas_por_persona, "temas_por_persona").flatMap((x, i): TemasPersona[] => {
    const t = obj(x, `temas_por_persona[${i}]`);
    const persona = textoOpcional(t.persona);
    const ts = lista(t.temas, "temas").flatMap((s) => {
      const v = textoOpcional(s);
      return v ? [v] : [];
    });
    return persona && ts.length ? [{ persona, reunionHoy: t.reunion_hoy === true, temas: ts }] : [];
  });

  return {
    fecha: o.fecha,
    zonaHoraria: typeof o.zona_horaria === "string" ? o.zona_horaria : "",
    hoy,
    arrastradas,
    temas,
  };
}

export function parsearOcupado(json: unknown): Ocupado {
  const o = obj(json, "ocupado");
  version1(o);
  if (!esFecha(o.desde)) throw new RespuestaInvalida("ocupado: fecha «desde» no válida");
  const ocupado = lista(o.ocupado, "ocupado").flatMap((x, i): TareaOcupada[] => {
    const t = obj(x, `ocupado[${i}]`);
    const h = hora(t.hora);
    // La API solo devuelve tareas con hora; si alguna llega sin hora o sin fecha, se ignora.
    if (!h || !esFecha(t.fecha)) return [];
    return [
      {
        id: texto(t.id, "id"),
        fecha: t.fecha,
        hora: h,
        duracionMin: minutos(t.duracion_min),
        titulo: texto(t.titulo, "titulo"),
        ambito: ambito(t.ambito, `ocupado[${i}].ambito`),
      },
    ];
  });
  return {
    desde: o.desde,
    dias: Number(o.dias) || 0,
    zonaHoraria: typeof o.zona_horaria === "string" ? o.zona_horaria : "",
    ocupado,
  };
}

// --- Presentación -----------------------------------------------------------------------

export type Marco = { ambito: Ambito; hoy: TareaHoy[]; arrastradas: TareaArrastrada[] };

/** Marcos a mostrar según el selector: Trabajo y Personal en «Todo», uno solo en los demás. */
export function marcos(r: Resumen, sel: Seleccion): Marco[] {
  const ambitos: Ambito[] = sel === "todo" ? ["trabajo", "personal"] : [sel];
  return ambitos.map((a) => ({
    ambito: a,
    hoy: r.hoy.filter((t) => t.ambito === a),
    arrastradas: r.arrastradas.filter((t) => t.ambito === a),
  }));
}

/** Temas por persona, primero con quien te ves hoy (orden estable dentro de cada grupo). */
export function temasOrdenados(r: Resumen): TemasPersona[] {
  return [...r.temas.filter((t) => t.reunionHoy), ...r.temas.filter((t) => !t.reunionHoy)];
}

export function textoArrastre(dias: number): string {
  return `↻ ${dias} ${dias === 1 ? "día" : "días"}`;
}

/** Duración por defecto de una tarea con hora sin duración. */
export const DURACION_POR_DEFECTO = 30;

/** Tareas con hora convertidas en eventos de la Agenda (ocupan y cuentan para huecos y solapes). */
export function ocupadoAEventos(o: Ocupado, tz: string): Evento[] {
  return o.ocupado.map((t) => {
    const inicio = zonedToUtc(t.fecha, t.hora, tz);
    return {
      clave: `mis-tareas|${t.id}|${t.fecha}`,
      titulo: t.titulo,
      calendario: "Mis tareas",
      todoElDia: false,
      libre: false,
      tarea: true,
      inicio,
      fin: inicio + (t.duracionMin ?? DURACION_POR_DEFECTO) * 60000,
    };
  });
}

/** Párrafo de tareas para el resumen de las 7:00 (fase 9). Sin notas ni importes. */
export function textoResumen(r: Resumen): string {
  const n = r.hoy.length;
  if (n === 0 && r.arrastradas.length === 0) return "Tareas: nada pendiente para hoy.";

  const frases: string[] = [];
  frases.push(n === 0 ? "Hoy no tienes tareas nuevas." : `Hoy tienes ${n} ${n === 1 ? "tarea" : "tareas"}.`);

  const primera = r.hoy.find((t) => t.hora);
  if (primera) frases.push(`La primera con hora, a las ${primera.hora}: ${primera.titulo}.`);

  const a = r.arrastradas.length;
  if (a > 0) frases.push(`${a} ${a === 1 ? "viene arrastrada" : "vienen arrastradas"} de días anteriores.`);

  const altas = [...r.hoy, ...r.arrastradas].filter((t) => t.prioridad === "alta").map((t) => t.titulo);
  if (altas.length) frases.push(`Prioridad alta: ${altas.join("; ")}.`);

  const reunion = r.temas.filter((t) => t.reunionHoy).map((t) => t.persona);
  if (reunion.length) frases.push(`Hoy te ves con ${unir(reunion)}.`);

  return frases.join(" ");
}

function unir(xs: string[]): string {
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}
