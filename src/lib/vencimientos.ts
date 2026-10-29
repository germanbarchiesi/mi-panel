// Vencimientos (fase 5): próximos 30 días a partir de dos fuentes.
//   A · tblProgramados (hoja Previsión): pagos que no son de todos los meses, con su «Día».
//   B · cargos repetidos detectados en tblMovimientos: al menos 3 veces con la misma descripción,
//       cada mes o cada trimestre (±5 días) y con importe estable (±15 %). Se descarta lo que ya
//       está en tblProgramados con la misma categoría e importe parecido.
// Lógica pura: se prueba con `npm test`.

import { SIN_CLASIFICAR, type Datos, type Movimiento, type Programado } from "./finanzas.ts";

export const VENTANA_DIAS = 30;
export const AVISO_PRONTO = 7;
const TOLERANCIA_DIAS = 5;
const TOLERANCIA_IMPORTE = 0.15;
const MIN_REPETICIONES = 3;

export type Periodo = "mensual" | "trimestral" | "anual" | "unico";

export type Vencimiento = {
  fecha: string; // YYYY-MM-DD
  dias: number; // desde hoy (0 = hoy)
  concepto: string;
  categoria: string;
  miParte: number; // € que te corresponden
  total: number;
  origen: "prevision" | "detectado";
  periodo: Periodo;
  pronto: boolean; // a 7 días o menos
};

export type CargoRepetido = {
  descripcion: string;
  categoria: string;
  periodo: "mensual" | "trimestral";
  veces: number;
  ultimo: string; // fecha del último cargo
  importeMedio: number; // total
  miParte: number; // del último cargo
  proximo: string;
  activo: boolean;
  enPrevision: boolean; // ya está en tblProgramados: no se cuenta dos veces
};

// --- Fechas ------------------------------------------------------------------------------

function utc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function diasEntre(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

function ymd(y: number, m: number, d: number): string {
  // Día recortado al último del mes (31 en febrero → 28/29).
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

function sumarMeses(fecha: string, n: number, dia: number): string {
  const [y, m] = fecha.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return ymd(Math.floor(total / 12), (total % 12) + 1, dia);
}

// Redondeo a céntimos como Excel (132,105 → 132,11): primero a milésimas para quitar el error de coma flotante.
const r2 = (x: number) => (Math.sign(x) * Math.round(Math.abs(Math.round(x * 1000)) / 10)) / 100;

// --- A · Previsión -----------------------------------------------------------------------

function periodoDe(frecuencia: string): Periodo | null {
  const f = frecuencia.trim().toLowerCase();
  if (f === "mensual") return "mensual";
  if (f === "trimestral") return "trimestral";
  if (f === "anual") return "anual";
  if (f === "único" || f === "unico") return "unico";
  return null;
}

/** Fechas de cobro de una fila de Previsión dentro de [desde, hasta]. */
export function fechasProgramado(p: Programado, anio: number, desde: string, hasta: string): string[] {
  const periodo = periodoDe(p.frecuencia);
  if (!periodo || p.desde < 1 || p.estado.toLowerCase() !== "pendiente" || p.importe === null || p.importe === 0) {
    return [];
  }
  const dia = p.dia ?? 1;
  // Meses absolutos desde enero del año del libro (1 = enero, 13 = enero del año siguiente).
  // Como el Excel, dentro del año del libro hasta «Hasta»; sin «Hasta», los periódicos y los anuales
  // siguen el año siguiente, porque la ventana de 30 días puede cruzar de año.
  const fin = p.hasta ? p.hasta : periodo === "unico" ? p.desde : 24;
  const paso = periodo === "mensual" ? 1 : periodo === "trimestral" ? 3 : 12;
  const out: string[] = [];
  for (let mes = p.desde; mes <= fin; mes += paso) {
    const f = ymd(anio + Math.floor((mes - 1) / 12), ((mes - 1) % 12) + 1, dia);
    if (f >= desde && f <= hasta) out.push(f);
    if (periodo === "unico") break;
  }
  return out;
}

// --- B · Detección de cargos repetidos -------------------------------------------------------

const NOMBRES_MES =
  /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/g;

/**
 * Descripción normalizada: minúsculas, sin tildes ni signos, sin números cortos (cuotas «03/24»,
 * días) ni nombres de mes, así «Mutua Enero» y «Mutua Febrero» son el mismo cargo. Los números
 * largos (referencias de préstamos o cuentas) se mantienen para no mezclar dos préstamos distintos.
 */
export function normalizar(desc: string): string {
  return desc
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b\d{1,2}\b/g, " ")
    .replace(NOMBRES_MES, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Nombre para mostrar: sin el mes ni el número de cuota («Mutua Septiembre» → «Mutua»). */
export function nombreVisible(desc: string): string {
  const limpio = desc
    .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, " ")
    .replace(
      /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .replace(/[\s,.\-–]+$/, "")
    .trim();
  return limpio || desc;
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const PERIODOS = { mensual: { dias: 30.4, meses: 1 }, trimestral: { dias: 91.3, meses: 3 } } as const;

function periodoDetectado(huecos: number[]): "mensual" | "trimestral" | null {
  for (const p of ["mensual", "trimestral"] as const) {
    const { dias, meses } = PERIODOS[p];
    // Cada hueco debe ser un múltiplo del periodo (±5 días): así un mes sin importar no lo rompe,
    // pero sí exige que al menos la mitad de los huecos sean de un solo periodo.
    const ok = huecos.every((h) => {
      const k = Math.round(h / dias);
      return k >= 1 && k <= 3 && Math.abs(h - k * dias) <= TOLERANCIA_DIAS + (k - 1) * 2;
    });
    const simples = huecos.filter((h) => Math.abs(h - dias) <= TOLERANCIA_DIAS).length;
    if (ok && simples * 2 >= huecos.length && meses) return p;
  }
  return null;
}

export function detectarRepetidos(movs: Movimiento[], programados: Programado[], corte: string | null): CargoRepetido[] {
  const grupos = new Map<string, Movimiento[]>();
  for (const m of movs) {
    if (m.tipo !== "Gasto" || !m.fecha || m.importe <= 0) continue;
    const k = normalizar(m.descripcion);
    if (k.length < 3) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }

  const out: CargoRepetido[] = [];
  for (const lista of grupos.values()) {
    // Varios cargos del mismo día (p. ej. un recibo partido en dos) cuentan como uno, sumados.
    const porDia = new Map<string, Movimiento>();
    for (const m of lista) {
      const prev = porDia.get(m.fecha as string);
      porDia.set(m.fecha as string, prev ? { ...m, importe: prev.importe + m.importe, parte: prev.parte + m.parte } : m);
    }
    const orden = [...porDia.values()].sort((a, b) => (a.fecha as string).localeCompare(b.fecha as string));
    if (orden.length < MIN_REPETICIONES) continue;

    const importes = orden.map((m) => m.importe);
    const med = mediana(importes);
    if (importes.some((x) => Math.abs(x - med) > med * TOLERANCIA_IMPORTE)) continue;

    const huecos = orden.slice(1).map((m, i) => diasEntre(orden[i].fecha as string, m.fecha as string));
    const periodo = periodoDetectado(huecos);
    if (!periodo) continue;

    const ultimo = orden[orden.length - 1];
    const ref = corte ?? (ultimo.fecha as string);
    const dia = Math.round(mediana(orden.map((m) => Number((m.fecha as string).slice(8, 10)))));
    let proximo = sumarMeses(ultimo.fecha as string, PERIODOS[periodo].meses, dia);
    while (proximo <= ref) proximo = sumarMeses(proximo, PERIODOS[periodo].meses, dia);
    // Activo si no se ha saltado más de un cobro antes de la fecha de corte.
    const activo = diasEntre(ultimo.fecha as string, ref) <= PERIODOS[periodo].dias * 1.5 + TOLERANCIA_DIAS;

    const categoria = [...orden].reverse().find((m) => m.categoria !== SIN_CLASIFICAR)?.categoria ?? ultimo.categoria;
    const importeMedio = r2(importes.reduce((s, x) => s + x, 0) / importes.length);
    const enPrevision = programados.some(
      (p) =>
        p.estado.toLowerCase() === "pendiente" &&
        p.categoria === categoria &&
        p.importe !== null &&
        Math.abs(p.importe - importeMedio) <= importeMedio * TOLERANCIA_IMPORTE,
    );

    out.push({
      descripcion: nombreVisible(ultimo.descripcion),
      categoria,
      periodo,
      veces: orden.length,
      ultimo: ultimo.fecha as string,
      importeMedio,
      miParte: r2(ultimo.parte),
      proximo,
      activo,
      enPrevision,
    });
  }
  return out.sort((a, b) => a.proximo.localeCompare(b.proximo));
}

// --- Juntos -------------------------------------------------------------------------------

export type ResultadoVencimientos = {
  hoy: string;
  hasta: string;
  proximos: Vencimiento[];
  repetidos: CargoRepetido[];
  sinColumnaDia: boolean;
};

export function calcularVencimientos(d: Datos, hoy: string): ResultadoVencimientos {
  const hasta = new Date(utc(hoy) + VENTANA_DIAS * 86400000).toISOString().slice(0, 10);
  const proximos: Vencimiento[] = [];

  for (const p of d.programados) {
    for (const fecha of fechasProgramado(p, d.anio, hoy, hasta)) {
      const dias = diasEntre(hoy, fecha);
      proximos.push({
        fecha,
        dias,
        concepto: p.concepto,
        categoria: p.categoria,
        total: r2(p.importe as number),
        miParte: r2((p.importe as number) * p.porcentaje),
        origen: "prevision",
        periodo: periodoDe(p.frecuencia) as Periodo,
        pronto: dias <= AVISO_PRONTO,
      });
    }
  }

  const repetidos = detectarRepetidos(d.movimientos, d.programados, d.fechaCorte);
  for (const c of repetidos) {
    // Solo lo que te toca pagar: un cargo individual de otra persona (tu parte = 0) no es un vencimiento tuyo.
    if (!c.activo || c.enPrevision || c.miParte <= 0) continue;
    // Puede tocar más de una vez en la ventana (mensual): se listan todas.
    let f = c.proximo;
    const dia = Number(c.proximo.slice(8, 10));
    while (f <= hasta) {
      if (f >= hoy) {
        const dias = diasEntre(hoy, f);
        proximos.push({
          fecha: f,
          dias,
          concepto: c.descripcion,
          categoria: c.categoria,
          total: c.importeMedio,
          miParte: c.miParte,
          origen: "detectado",
          periodo: c.periodo,
          pronto: dias <= AVISO_PRONTO,
        });
      }
      f = sumarMeses(f, PERIODOS[c.periodo].meses, dia);
    }
  }

  proximos.sort((a, b) => a.fecha.localeCompare(b.fecha) || b.miParte - a.miParte);
  return { hoy, hasta, proximos, repetidos, sinColumnaDia: !d.tieneColumnaDia };
}
