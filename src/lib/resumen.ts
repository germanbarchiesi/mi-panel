// Resumen de las 7:00 (fase 9): cuándo actuar y qué decir. Plantilla, sin IA y sin importes.
// Lógica pura: se prueba con `npm test`.

import { addDays, weekday, ymdInTz } from "./agenda.ts";

// --- Cuándo -----------------------------------------------------------------------------

export type Accion = "nada" | "preparar" | "notificar" | "preparar_y_notificar";

function horaLocal(ahora: number, tz: string): { min: number; ymd: string; dow: number } {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
    new Date(ahora),
  );
  const h = Number(p.find((x) => x.type === "hour")?.value);
  const m = Number(p.find((x) => x.type === "minute")?.value);
  const ymd = ymdInTz(ahora, tz);
  return { min: h * 60 + m, ymd, dow: weekday(ymd) };
}

export const PREPARAR = 6 * 60 + 30;
export const NOTIFICAR = 7 * 60;
export const FIN_VENTANA = 10 * 60; // si a las 10:00 no se hizo, ese día ya no se manda

/**
 * Supabase Cron llama cada 30 min; aquí se decide qué toca en la zona del usuario. Solo de lunes a
 * viernes. Si una llamada se pierde, la siguiente recupera lo pendiente dentro de la ventana.
 */
export function decidir(
  ahora: number,
  tz: string,
  estado: { preparado: boolean; notificado: boolean } | null,
): { accion: Accion; fecha: string } {
  const { min, ymd, dow } = horaLocal(ahora, tz);
  if (dow === 0 || dow === 6 || min < PREPARAR || min >= FIN_VENTANA) return { accion: "nada", fecha: ymd };
  if (!estado?.preparado) return { accion: min >= NOTIFICAR ? "preparar_y_notificar" : "preparar", fecha: ymd };
  if (!estado.notificado && min >= NOTIFICAR) return { accion: "notificar", fecha: ymd };
  return { accion: "nada", fecha: ymd };
}

// --- Qué ----------------------------------------------------------------------------------

export type DatosResumen = {
  fecha: string; // YYYY-MM-DD
  agenda: {
    eventos: { titulo: string; hora: string | null }[]; // hora null = todo el día
    primerHueco: { ini: string; fin: string } | null;
  } | null;
  tareas:
    | { ok: true; hoy: { titulo: string; hora: string | null; prioridad: string | null; ambito: string }[]; arrastradas: number; reunion: string[] }
    | { ok: false }
    | null;
  vencimientos: { semana: { concepto: string; dias: number }[]; mes: number } | null;
  finanzas: { ritmo: "bien" | "atencion" | "riesgo" | null; pendientes: number; mes: string } | null;
  deporte: { titulo: string; hora: string | null }[] | null;
  cartera: { variacion: number } | null; // fracción desde la foto anterior (0,012 = +1,2 %)
  agentes: string[]; // con novedades
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «10:30» → «las 10 y media»; «13:00» → «la una»… legible para la voz del móvil y para Piper. */
export function horaHablada(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const hh = h % 12 === 1 ? "la una" : `las ${h === 0 ? 12 : h > 12 ? h - 12 : h}`;
  const mm = m === 0 ? "" : m === 15 ? " y cuarto" : m === 30 ? " y media" : m === 45 ? " menos cuarto" : ` y ${m}`;
  // «menos cuarto» se refiere a la hora siguiente.
  if (m === 45) {
    const s = (h + 1) % 24;
    return `${s % 12 === 1 ? "la una" : `las ${s === 0 ? 12 : s > 12 ? s - 12 : s}`}${mm}`;
  }
  return `${hh}${mm}`;
}

function lista(xs: string[]): string {
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

function n(k: number, uno: string, varios: string): string {
  return `${k} ${k === 1 ? uno : varios}`;
}

function limpiar(t: string): string {
  // Fuera emojis y símbolos que la voz lee mal; espacios normales.
  return t
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function cuando(dias: number): string {
  return dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`;
}

/** Texto del resumen (≈ 1–2 minutos). Sin importes: la cartera solo en porcentaje. */
export function componerResumen(d: DatosResumen): string {
  const [, mo, da] = d.fecha.split("-").map(Number);
  const partes: string[] = [`Buenos días. Hoy es ${DIAS[weekday(d.fecha)]} ${da} de ${MESES[mo - 1]}.`];

  // Agenda
  if (d.agenda) {
    const ev = d.agenda.eventos;
    if (ev.length === 0) partes.push("No tienes eventos en la agenda.");
    else {
      const desc = ev.slice(0, 5).map((e) => (e.hora ? `${limpiar(e.titulo)} a ${horaHablada(e.hora)}` : limpiar(e.titulo)));
      partes.push(`En la agenda, ${n(ev.length, "evento", "eventos")}: ${lista(desc)}${ev.length > 5 ? ", y alguno más" : ""}.`);
    }
    if (d.agenda.primerHueco) {
      partes.push(`Tu primer hueco libre es de ${horaHablada(d.agenda.primerHueco.ini)} a ${horaHablada(d.agenda.primerHueco.fin)}.`);
    }
  } else partes.push("No he podido leer la agenda.");

  // Tareas
  if (d.tareas?.ok) {
    const t = d.tareas;
    const trabajo = t.hoy.filter((x) => x.ambito === "trabajo").length;
    const personal = t.hoy.filter((x) => x.ambito === "personal").length;
    if (t.hoy.length === 0 && t.arrastradas === 0) partes.push("Tareas: nada pendiente para hoy.");
    else {
      const grupos = [
        ...(trabajo ? [`${trabajo} de trabajo`] : []),
        ...(personal ? [`${personal} ${personal === 1 ? "personal" : "personales"}`] : []),
      ];
      if (grupos.length) partes.push(`Tareas para hoy: ${lista(grupos)}.`);
      const primera = t.hoy.filter((x) => x.hora).sort((a, b) => (a.hora as string).localeCompare(b.hora as string))[0];
      if (primera) partes.push(`La primera con hora, a ${horaHablada(primera.hora as string)}: ${limpiar(primera.titulo)}.`);
      if (t.arrastradas) partes.push(`${t.arrastradas === 1 ? "Arrastras una tarea" : `Arrastras ${t.arrastradas} tareas`} de días anteriores.`);
      const altas = t.hoy.filter((x) => x.prioridad === "alta").map((x) => limpiar(x.titulo));
      if (altas.length) partes.push(`Prioridad alta: ${lista(altas.slice(0, 3))}.`);
    }
    if (t.reunion.length) partes.push(`Hoy te ves con ${lista(t.reunion.slice(0, 4))}.`);
  } else if (d.tareas) partes.push("Mis tareas no ha respondido, así que hoy no incluyo tus tareas.");

  // Vencimientos (sin importes)
  if (d.vencimientos) {
    const s = d.vencimientos.semana;
    if (s.length) {
      partes.push(
        `Vencimientos esta semana: ${lista(s.slice(0, 4).map((v) => `${limpiar(v.concepto)} ${cuando(v.dias)}`))}.`,
      );
    }
    const resto = d.vencimientos.mes - s.length;
    if (resto > 0) partes.push(`Y ${n(resto, "vencimiento más", "vencimientos más")} en los próximos 30 días.`);
  }

  // Finanzas
  if (d.finanzas) {
    const r = d.finanzas.ritmo;
    if (r) {
      partes.push(
        r === "bien"
          ? `El gasto de ${d.finanzas.mes} va bien.`
          : r === "atencion"
            ? `Atención: el gasto de ${d.finanzas.mes} va algo más rápido que tu media.`
            : `Cuidado: el gasto de ${d.finanzas.mes} va bastante por encima de tu media.`,
      );
    }
    if (d.finanzas.pendientes > 0) partes.push(`Tienes ${n(d.finanzas.pendientes, "movimiento", "movimientos")} sin clasificar.`);
  }

  // Deporte
  if (d.deporte && d.deporte.length) {
    partes.push(
      `Deporte hoy: ${lista(d.deporte.slice(0, 3).map((p) => (p.hora ? `${limpiar(p.titulo)} a ${horaHablada(p.hora)}` : limpiar(p.titulo))))}.`,
    );
  }

  // Cartera (solo porcentaje)
  if (d.cartera && Number.isFinite(d.cartera.variacion)) {
    const pct = Math.round(Math.abs(d.cartera.variacion) * 1000) / 10;
    const txt = String(pct).replace(".", ",");
    partes.push(
      pct < 0.1
        ? "La cartera está igual que en la última foto."
        : `La cartera ${d.cartera.variacion > 0 ? "sube" : "baja"} un ${txt} por ciento desde la última foto.`,
    );
  }

  if (d.agentes.length) partes.push(`Novedades de tus agentes: ${lista(d.agentes.slice(0, 3).map(limpiar))}.`);

  partes.push("Que tengas buen día.");
  return partes.join(" ");
}

/** Días hasta una fecha (para limpiar el feed a los 7 días). */
export function hace(ymd: string, dias: number): string {
  return addDays(ymd, -dias);
}
