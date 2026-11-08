// Línea del día: el día de la Agenda como una banda horaria (ocupado, tareas y huecos libres).
// Lógica pura: posiciones en horas de reloj (0–24) en la zona horaria del panel. Se prueba con `npm test`.

import { esVariosDias, formatHora, type Dia } from "./agenda.ts";

export type TipoTramo = "evento" | "libre" | "tarea";

export type Tramo = {
  tipo: TipoTramo;
  ini: number; // horas decimales (0–24)
  fin: number;
  carril: number; // 0 = arriba
  titulo: string;
  texto: string; // «10:30–11:15»
  color?: string;
};

export type Linea = {
  desde: number; // hora entera
  hasta: number;
  carriles: number; // 1–3
  tramos: Tramo[];
  huecos: { ini: number; fin: number; texto: string }[];
  marcas: number[]; // horas con etiqueta (múltiplos de 3)
};

export const MAX_CARRILES = 3;
const DESDE_POR_DEFECTO = 7;
const HASTA_POR_DEFECTO = 23;

/** Hora de reloj (decimal) de un instante dentro del día: 0 al empezar y 24 al acabar. */
export function horaDelDia(ms: number, dia: Pick<Dia, "ini" | "fin">, tz: string): number {
  if (ms <= dia.ini) return 0;
  if (ms >= dia.fin) return 24;
  const [h, m] = formatHora(ms, tz).split(":").map(Number);
  return h + m / 60;
}

function hm(ms: number, tz: string) {
  return formatHora(ms, tz);
}

export function construirLinea(dia: Dia, tz: string): Linea {
  const conHora = dia.eventos.filter((e) => e.inicio !== undefined && e.fin !== undefined && !esVariosDias(e));
  const base = conHora
    .map((e) => {
      const ini = Math.max(e.inicio as number, dia.ini);
      const fin = Math.min(e.fin as number, dia.fin);
      return {
        tipo: (e.tarea ? "tarea" : e.libre ? "libre" : "evento") as TipoTramo,
        ini: horaDelDia(ini, dia, tz),
        fin: horaDelDia(fin, dia, tz),
        titulo: e.titulo,
        texto: `${hm(ini, tz)}–${fin >= dia.fin ? "24:00" : hm(fin, tz)}`,
        color: e.color,
      };
    })
    .filter((t) => t.fin > t.ini)
    .sort((a, b) => a.ini - b.ini || b.fin - a.fin);

  // Carriles: cada tramo va al primero que ya esté libre a su hora; como mucho tres.
  const finCarril: number[] = [];
  const tramos: Tramo[] = base.map((t) => {
    let c = finCarril.findIndex((f) => f <= t.ini);
    if (c < 0) c = finCarril.length < MAX_CARRILES ? finCarril.length : MAX_CARRILES - 1;
    finCarril[c] = Math.max(finCarril[c] ?? 0, t.fin);
    return { ...t, carril: c };
  });

  const huecos = dia.huecos.map((h) => ({
    ini: horaDelDia(h.ini, dia, tz),
    fin: horaDelDia(h.fin, dia, tz),
    texto: `${hm(h.ini, tz)}–${h.fin >= dia.fin ? "24:00" : hm(h.fin, tz)}`,
  }));

  const inicios = [...tramos.map((t) => t.ini), ...huecos.map((h) => h.ini)];
  const finales = [...tramos.map((t) => t.fin), ...huecos.map((h) => h.fin)];
  const desde = Math.max(0, Math.min(DESDE_POR_DEFECTO, ...inicios.map(Math.floor)));
  const hasta = Math.min(24, Math.max(HASTA_POR_DEFECTO, ...finales.map(Math.ceil)));
  const marcas: number[] = [];
  for (let h = Math.ceil(desde / 3) * 3; h <= hasta; h += 3) if (h > desde && h < hasta) marcas.push(h);

  return { desde, hasta, carriles: Math.max(1, finCarril.length), tramos, huecos, marcas };
}

/** Posición (0–100 %) de una hora dentro de la línea. */
export function posicion(hora: number, l: Pick<Linea, "desde" | "hasta">): number {
  const p = ((hora - l.desde) / (l.hasta - l.desde)) * 100;
  return Math.min(100, Math.max(0, Math.round(p * 100) / 100));
}
