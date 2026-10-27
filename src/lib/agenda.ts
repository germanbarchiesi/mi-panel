// Lógica pura de la Agenda (sin red ni Next): fechas por zona horaria, huecos libres y solapes.
// Se prueba con `npm test`. Importaciones relativas con .ts para poder ejecutarse con node --test.

export const TZ_BARCELONA = "Europe/Madrid";

export type Ventana = { ini: string; fin: string }; // "HH:MM"

export type Ajustes = {
  /** IDs de calendarios a mostrar; null = los seleccionados en Google (menos Mis tareas / Deporte). */
  calendarios: string[] | null;
  lv: Ventana; // ventana de huecos lunes a viernes
  fs: Ventana; // ventana de huecos sábado y domingo
  minHueco: number; // minutos
  horaLocal: boolean; // usar la hora de donde estoy en vez de Barcelona
};

export const AJUSTES_POR_DEFECTO: Ajustes = {
  calendarios: null,
  lv: { ini: "17:00", fin: "22:30" },
  fs: { ini: "09:00", fin: "22:30" },
  minHueco: 45,
  horaLocal: false,
};

export type Evento = {
  clave: string; // para quitar duplicados entre calendarios
  titulo: string;
  calendario: string;
  color?: string;
  todoElDia: boolean;
  libre: boolean; // marcado como "disponible": se muestra pero no ocupa
  inicio?: number; // ms UTC (con hora)
  fin?: number;
  diaIni?: string; // YYYY-MM-DD (todo el día)
  diaFin?: string; // exclusivo
  lugar?: string;
};

export type Hueco = { ini: number; fin: number };

export type Dia = {
  fecha: string; // YYYY-MM-DD en la zona elegida
  esHoy: boolean;
  todoElDia: Evento[];
  eventos: Evento[]; // con hora, ordenados
  huecos: Hueco[];
  solapes: [Evento, Evento][];
};

export function tzOffsetMinutes(ms: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** Instante UTC (ms) de una fecha y hora de pared en una zona horaria. */
export function zonedToUtc(ymd: string, hm: string, tz: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = tzOffsetMinutes(guess, tz);
  let t = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(t, tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return t;
}

export function ymdInTz(ms: number, tz: string): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(new Date(ms)); // en-CA => YYYY-MM-DD
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekday(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
}

export function esZonaValida(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatHora(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

export function formatDia(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function formatDuracion(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function fusionar(intervalos: Hueco[]): Hueco[] {
  const orden = [...intervalos].sort((a, b) => a.ini - b.ini);
  const out: Hueco[] = [];
  for (const iv of orden) {
    const last = out[out.length - 1];
    if (last && iv.ini <= last.fin) last.fin = Math.max(last.fin, iv.fin);
    else out.push({ ...iv });
  }
  return out;
}

export function construirDia(
  ymd: string,
  eventos: Evento[],
  ajustes: Ajustes,
  tz: string,
  ahora: number,
): Dia {
  const diaIni = zonedToUtc(ymd, "00:00", tz);
  const diaFin = zonedToUtc(addDays(ymd, 1), "00:00", tz);
  const esHoy = ymdInTz(ahora, tz) === ymd;

  const todoElDia = eventos.filter(
    (e) => e.todoElDia && e.diaIni !== undefined && e.diaFin !== undefined && e.diaIni <= ymd && ymd < e.diaFin,
  );
  const conHora = eventos
    .filter(
      (e) =>
        !e.todoElDia && e.inicio !== undefined && e.fin !== undefined && e.inicio < diaFin && e.fin > diaIni,
    )
    .sort((a, b) => (a.inicio ?? 0) - (b.inicio ?? 0));

  // Huecos: dentro de la ventana del día, fuera de lo que ocupan los eventos no "libres".
  const dow = weekday(ymd);
  const v = dow === 0 || dow === 6 ? ajustes.fs : ajustes.lv;
  let cursor = zonedToUtc(ymd, v.ini, tz);
  const limite = zonedToUtc(ymd, v.fin, tz);
  if (esHoy) cursor = Math.max(cursor, ahora);

  const ocupados = fusionar(
    conHora
      .filter((e) => !e.libre)
      .map((e) => ({ ini: Math.max(e.inicio as number, diaIni), fin: Math.min(e.fin as number, diaFin) })),
  );

  const huecos: Hueco[] = [];
  const minMs = ajustes.minHueco * 60000;
  for (const b of ocupados) {
    if (b.fin <= cursor) continue;
    if (b.ini >= limite) break;
    if (b.ini > cursor && Math.min(b.ini, limite) - cursor >= minMs) {
      huecos.push({ ini: cursor, fin: Math.min(b.ini, limite) });
    }
    cursor = Math.max(cursor, b.fin);
  }
  if (limite - cursor >= minMs) huecos.push({ ini: cursor, fin: limite });

  // Solapes entre eventos que ocupan (ordenados por inicio).
  const reales = conHora.filter((e) => !e.libre);
  const solapes: [Evento, Evento][] = [];
  for (let i = 0; i < reales.length; i++) {
    for (let j = i + 1; j < reales.length; j++) {
      if ((reales[j].inicio as number) >= (reales[i].fin as number)) break;
      solapes.push([reales[i], reales[j]]);
    }
  }

  return { fecha: ymd, esHoy, todoElDia, eventos: conHora, huecos, solapes };
}
