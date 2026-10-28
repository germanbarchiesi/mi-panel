// Cálculos de Finanzas a partir de la V6 del Excel, replicando el Resumen mensual / Resumen anual.
// Lógica pura (sin red ni Next): se prueba con `npm test`.
//
// Reglas (plan técnico, «Datos de la V6 del Excel»):
// - El mes es la columna «Mes» (Enero…Diciembre), no la fecha.
// - Ingresado = Σ «Corresponde Germán» con Tipo Ingreso, sin «Movimiento sin clasificar».
// - Gastado = Σ «Corresponde Germán» con Tipo Gasto − Tipo Ajuste, salvo Sueldo, Alquiler Habitación
//   y Movimiento sin clasificar. Los traspasos no cuentan.
// - Ahorro = Ingresado − Gastado; tasa = Ahorro / Ingresado.
// - Pendientes = movimientos del mes en «Movimiento sin clasificar», sin traspasos, con su importe.
// - Mes cerrado = ya pasó, tiene gastos y no tiene pendientes. Media de referencia = la de los cerrados.
// - Fecha de corte = la más antigua de «Último movimiento importado» entre las cuentas.

import { LibroInvalido, serialAFecha, type Celda, type Libro, type Tabla } from "./xlsx.ts";

export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const SIN_CLASIFICAR = "Movimiento sin clasificar";
const FUERA_DE_GASTOS = new Set(["Sueldo", "Alquiler Habitación", SIN_CLASIFICAR]);

export type Movimiento = {
  fecha: string | null; // YYYY-MM-DD
  mes: number; // 1-12
  tipo: string; // Gasto, Ingreso, Ajuste, Traspaso
  descripcion: string;
  importe: number;
  categoria: string;
  parte: number; // «Corresponde Germán»
};

export type Datos = {
  anio: number;
  movimientos: Movimiento[];
  categorias: string[];
  fechaCorte: string | null; // YYYY-MM-DD
};

// --- Lectura del libro --------------------------------------------------------------------

export const LECTURA = {
  tablas: ["tblMovimientos", "tblCuentas"],
  nombres: ["cfgAnio"],
  hojas: ["Categorías"],
};

function columna(t: Tabla, nombre: string): number {
  const i = t.columnas.findIndex((c) => c.toLowerCase() === nombre.toLowerCase());
  if (i < 0) throw new LibroInvalido(`Falta la columna «${nombre}» en ${t.nombre}`);
  return i;
}

function num(v: Celda): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

function txt(v: Celda): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function fecha(v: Celda): string | null {
  if (typeof v === "number" && v > 0) return serialAFecha(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

export function datosDelLibro(libro: Libro): Datos {
  const mov = libro.tablas.get("tblMovimientos");
  const cuentas = libro.tablas.get("tblCuentas");
  if (!mov || !cuentas) throw new LibroInvalido("Faltan tablas");

  const c = {
    fecha: columna(mov, "Fecha"),
    mes: columna(mov, "Mes"),
    tipo: columna(mov, "Tipo"),
    desc: columna(mov, "Descripción"),
    importe: columna(mov, "Importe"),
    cat: columna(mov, "Categoría"),
    parte: columna(mov, "Corresponde Germán"),
  };

  const movimientos: Movimiento[] = [];
  for (const f of mov.filas) {
    const mes = MESES.indexOf(txt(f[c.mes])) + 1;
    if (mes < 1) continue; // fila sin mes válido: el Excel tampoco la cuenta
    movimientos.push({
      fecha: fecha(f[c.fecha]),
      mes,
      tipo: txt(f[c.tipo]),
      descripcion: txt(f[c.desc]).slice(0, 200),
      importe: num(f[c.importe]),
      categoria: txt(f[c.cat]),
      parte: num(f[c.parte]),
    });
  }

  // Solo «Último movimiento importado»: el IBAN y el resto de columnas no se leen.
  const ci = columna(cuentas, "Último movimiento importado");
  const cortes = cuentas.filas.map((f) => fecha(f[ci])).filter((x): x is string => x !== null);
  const fechaCorte = cortes.length ? cortes.sort()[0] : null;

  const hojaCat = libro.hojas.get("Categorías") ?? [];
  const categorias = hojaCat
    .slice(1)
    .map((f) => txt(f?.[0] ?? null))
    .filter(Boolean);

  const anio = num(libro.nombres.get("cfgAnio") ?? null);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new LibroInvalido("cfgAnio no es un año");

  return { anio, movimientos, categorias, fechaCorte };
}

// --- Cálculos ----------------------------------------------------------------------------

// Se suma en milésimas enteras (las partes compartidas tienen medios céntimos, p. ej. 23,095)
// y se redondea a céntimos al final, como muestra Excel.
const mil = (x: number) => Math.round(x * 1000);
const aEuros = (m: number) => Math.sign(m) * Math.round(Math.abs(m) / 10) / 100;

export type Mes = {
  mes: number;
  ingresado: number;
  gastado: number;
  ahorro: number;
  tasa: number | null; // 0-1; null si no hay ingresos
  porCategoria: { categoria: string; gastado: number }[]; // de mayor a menor, sin ceros
  pendientes: { n: number; importe: number };
  tieneGastos: boolean;
};

export function calcularMes(movs: Movimiento[], mes: number): Mes {
  let ing = 0;
  let gas = 0;
  let pendN = 0;
  let pendImp = 0;
  let conGastos = false;
  const cats = new Map<string, number>();
  for (const m of movs) {
    if (m.mes !== mes) continue;
    if (m.categoria === SIN_CLASIFICAR && m.tipo !== "Traspaso") {
      pendN++;
      pendImp += mil(m.importe);
    }
    if (m.tipo === "Ingreso" && m.categoria !== SIN_CLASIFICAR) ing += mil(m.parte);
    if ((m.tipo === "Gasto" || m.tipo === "Ajuste") && !FUERA_DE_GASTOS.has(m.categoria)) {
      const v = (m.tipo === "Gasto" ? 1 : -1) * mil(m.parte);
      gas += v;
      cats.set(m.categoria, (cats.get(m.categoria) ?? 0) + v);
      if (m.tipo === "Gasto" && m.parte !== 0) conGastos = true;
    }
  }
  const ingresado = aEuros(ing);
  const gastado = aEuros(gas);
  const ahorro = aEuros(ing - gas);
  return {
    mes,
    ingresado,
    gastado,
    ahorro,
    tasa: ing > 0 ? (ing - gas) / ing : null,
    porCategoria: [...cats]
      .map(([categoria, v]) => ({ categoria, gastado: aEuros(v) }))
      .filter((c) => c.gastado !== 0)
      .sort((a, b) => b.gastado - a.gastado),
    pendientes: { n: pendN, importe: aEuros(pendImp) },
    tieneGastos: conGastos,
  };
}

/** Mes «actual» del libro: 13 si el año ya pasó, 0 si aún no empezó (como el nombre mesActual del Excel). */
export function mesActualDelLibro(anio: number, hoy: string): number {
  const [y, m] = hoy.split("-").map(Number);
  if (y > anio) return 13;
  if (y < anio) return 0;
  return m;
}

export function cerrado(m: Mes, mesActual: number): boolean {
  return m.mes < mesActual && m.tieneGastos && m.pendientes.n === 0;
}

export type Ritmo = {
  desvio: number; // puntos porcentuales: + gastas más rápido que tu media
  estado: "bien" | "atencion" | "riesgo";
  cierreEstimado: number;
};

export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Desvío = gastado / media − día de corte / días del mes. +10 a +20 «Atención»; más de +20 «En riesgo». */
export function ritmo(gastado: number, media: number, diaCorte: number, dias: number): Ritmo | null {
  if (media <= 0 || diaCorte <= 0) return null;
  // Redondeado a centésimas de punto para que +10,00 no quede en +9,999… por la coma flotante.
  const desvio = Math.round((gastado / media - diaCorte / dias) * 10000) / 100;
  return {
    desvio,
    estado: desvio > 20 ? "riesgo" : desvio >= 10 ? "atencion" : "bien",
    cierreEstimado: Math.round((gastado / diaCorte) * dias * 100) / 100,
  };
}

export type Resumen = {
  anio: number;
  mes: number; // mes mostrado (el de la fecha de corte)
  actual: Mes;
  anterior: Mes | null;
  mediaCerrados: number | null;
  mesesCerrados: number;
  ritmo: Ritmo | null;
  diaCorte: number;
  diasMes: number;
  fechaCorte: string | null;
  top5: { categoria: string; gastado: number }[];
  pendientesAnio: { mes: number; n: number; importe: number }[]; // meses pasados o en curso con pendientes
};

/**
 * Resumen para el panel. Se muestra el mes de la fecha de corte (el último con datos importados);
 * si no hay fecha de corte, el mes en curso.
 */
export function resumir(d: Datos, hoy: string): Resumen {
  const mesActual = mesActualDelLibro(d.anio, hoy);
  const meses = MESES.map((_, i) => calcularMes(d.movimientos, i + 1));
  const cerrados = meses.filter((m) => cerrado(m, mesActual));
  const media = cerrados.length
    ? aEuros(cerrados.reduce((s, m) => s + mil(m.gastado), 0) / cerrados.length)
    : null;

  const [cy, cm, cd] = (d.fechaCorte ?? "").split("-").map(Number);
  const corteEnAnio = d.fechaCorte !== null && cy === d.anio;
  const mes = corteEnAnio ? cm : Math.min(12, Math.max(1, mesActual));
  const diasMes = diasDelMes(d.anio, mes);
  const diaCorte = corteEnAnio ? cd : 0;

  const actual = meses[mes - 1];
  return {
    anio: d.anio,
    mes,
    actual,
    anterior: mes > 1 ? meses[mes - 2] : null,
    mediaCerrados: media,
    mesesCerrados: cerrados.length,
    ritmo: media !== null ? ritmo(actual.gastado, media, diaCorte, diasMes) : null,
    diaCorte,
    diasMes,
    fechaCorte: d.fechaCorte,
    top5: actual.porCategoria.slice(0, 5),
    pendientesAnio: meses
      .filter((m) => m.mes <= Math.max(mes, Math.min(mesActual, 12)) && m.pendientes.n > 0)
      .map((m) => ({ mes: m.mes, ...m.pendientes })),
  };
}
