// Inversiones (fase 6): posiciones de tblActivos valoradas con el último cierre de cada activo,
// reparto por clase y bolsa frente a tu % objetivo, y evolución mensual (Excel + fotos diarias).
// Lógica pura: se prueba con `npm test`. Los precios los trae precios.ts (solo servidor).

import { serialAFecha, type Celda, type Libro, type Tabla } from "./xlsx.ts";

export const LECTURA_INVERSIONES = {
  tablasOpcionales: ["tblActivos", "tblEvolucion"],
  nombresOpcionales: ["invAportado", "invTIR", "invBanda"],
};

export type Fuente = "Yahoo" | "Kraken" | "Manual" | "Liquidez" | "Otra";

export type Activo = {
  activo: string;
  ticker: string;
  fuente: Fuente;
  clase: string;
  divisa: string;
  broker: string;
  bolsa: string; // «Largo plazo» o «Colchón»
  pesoObjetivo: number | null; // 0-1, solo en Largo plazo
  participaciones: number;
  coste: number; // coste de lo que queda (€)
  aportado: number;
  precioExcel: number | null; // € (lo que dejó la macro)
  fechaPrecioExcel: string | null;
  valorExcel: number; // € (para la liquidez)
};

export type PuntoEvolucion = { fecha: string; aportado: number; valor: number };

export type DatosInversiones = {
  activos: Activo[];
  evolucion: PuntoEvolucion[];
  aportadoTotal: number | null; // invAportado
  tir: number | null; // invTIR
  banda: number; // invBanda (desvío tolerado)
};

// --- Lectura ------------------------------------------------------------------------------

function col(t: Tabla, nombre: string): number {
  return t.columnas.findIndex((c) => c.toLowerCase() === nombre.toLowerCase());
}

function num(v: Celda | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

function txt(v: Celda | undefined): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function fecha(v: Celda | undefined): string | null {
  if (typeof v === "number" && v > 0) return serialAFecha(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function fuente(v: string): Fuente {
  const f = v.toLowerCase();
  if (f === "yahoo") return "Yahoo";
  if (f === "kraken") return "Kraken";
  if (f === "manual") return "Manual";
  if (f === "liquidez") return "Liquidez";
  return "Otra";
}

export function datosInversiones(libro: Libro): DatosInversiones {
  const activos: Activo[] = [];
  const t = libro.tablas.get("tblActivos");
  if (t) {
    const c = (n: string) => col(t, n);
    const i = {
      activo: c("Activo"),
      ticker: c("Ticker"),
      fuente: c("Fuente"),
      clase: c("Clase"),
      divisa: c("Divisa"),
      broker: c("Bróker"),
      bolsa: c("Bolsa"),
      peso: c("Peso objetivo"),
      part: c("Participaciones"),
      coste: c("Coste"),
      aportado: c("Aportado"),
      precio: c("Precio"),
      precioManual: c("Precio manual"),
      fechaPrecio: c("Fecha precio"),
      valor: c("Valor"),
    };
    for (const f of t.filas) {
      const g = (k: number) => (k >= 0 ? f[k] : null);
      const nombre = txt(g(i.activo)).slice(0, 120);
      if (!nombre) continue;
      const fu = fuente(txt(g(i.fuente)));
      const precio = num(g(i.precio)) || num(g(i.precioManual));
      const peso = g(i.peso);
      activos.push({
        activo: nombre,
        ticker: txt(g(i.ticker)).slice(0, 30),
        fuente: fu,
        clase: txt(g(i.clase)) || (fu === "Liquidez" ? "Liquidez" : "Sin clase"),
        divisa: (txt(g(i.divisa)) || "EUR").toUpperCase().slice(0, 5),
        broker: txt(g(i.broker)),
        bolsa: txt(g(i.bolsa)) || "Largo plazo",
        pesoObjetivo: typeof peso === "number" ? peso : null,
        participaciones: num(g(i.part)),
        coste: num(g(i.coste)),
        aportado: num(g(i.aportado)),
        precioExcel: precio > 0 ? precio : null,
        fechaPrecioExcel: fecha(g(i.fechaPrecio)),
        valorExcel: num(g(i.valor)),
      });
    }
  }

  const evolucion: PuntoEvolucion[] = [];
  const e = libro.tablas.get("tblEvolucion");
  if (e) {
    const [cf, ca, cv] = [col(e, "Fecha"), col(e, "Aportado neto"), col(e, "Valor")];
    for (const f of e.filas) {
      const d = cf >= 0 ? fecha(f[cf]) : null;
      if (!d) continue;
      evolucion.push({ fecha: d, aportado: num(f[ca]), valor: num(f[cv]) });
    }
  }

  const n = (k: string) => {
    const v = libro.nombres.get(k);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const banda = n("invBanda");
  return {
    activos,
    evolucion,
    aportadoTotal: n("invAportado"),
    tir: n("invTIR"),
    banda: banda !== null && banda > 0 && banda < 1 ? banda : 0.05,
  };
}

// --- Cálculo ------------------------------------------------------------------------------

/** Precio de mercado en € con su fecha; si es null, se usa el del Excel. */
export type Cotizacion = { precio: number; fecha: string; fuente: "Yahoo" | "Kraken" };

export type Posicion = {
  activo: string;
  clase: string;
  bolsa: string;
  participaciones: number;
  precio: number | null;
  fechaPrecio: string | null;
  origenPrecio: "mercado" | "excel" | "sin precio";
  valor: number;
  coste: number;
  plusvalia: number;
  rentabilidad: number | null; // sobre el coste
  peso: number; // sobre el total
};

export type Reparto = {
  nombre: string;
  valor: number;
  peso: number; // dentro de su grupo
  objetivo: number | null;
  desvio: number | null; // peso − objetivo
  fueraDeBanda: boolean;
};

export type ResumenInversiones = {
  hayPosiciones: boolean;
  valor: number;
  liquidez: number;
  aportado: number;
  ganancia: number;
  rentabilidad: number | null; // ganancia / aportado
  tir: number | null;
  rentAnio: { ganancia: number; rentabilidad: number | null; desde: string } | null;
  posiciones: Posicion[];
  porClase: Reparto[];
  porBolsa: Reparto[];
  objetivos: Reparto[]; // activos de Largo plazo con % objetivo
  alertas: string[];
  preciosDesdeExcel: number; // posiciones valoradas con el precio del Excel (falló la descarga)
  evolucionMensual: PuntoEvolucion[]; // último punto de cada mes, últimos 12
};

const r2 = (x: number) => Math.round(x * 100) / 100;

function grupo(items: { nombre: string; valor: number }[]): Reparto[] {
  const total = items.reduce((s, x) => s + x.valor, 0);
  const m = new Map<string, number>();
  for (const x of items) m.set(x.nombre, (m.get(x.nombre) ?? 0) + x.valor);
  return [...m]
    .map(([nombre, valor]) => ({
      nombre,
      valor: r2(valor),
      peso: total > 0 ? valor / total : 0,
      objetivo: null,
      desvio: null,
      fueraDeBanda: false,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/** Último punto de cada mes (fotos del Excel y del panel juntas), los 12 meses más recientes. */
export function evolucionMensual(puntos: PuntoEvolucion[]): PuntoEvolucion[] {
  const porMes = new Map<string, PuntoEvolucion>();
  for (const p of [...puntos].sort((a, b) => a.fecha.localeCompare(b.fecha))) porMes.set(p.fecha.slice(0, 7), p);
  return [...porMes.values()].slice(-12);
}

export function valorar(
  d: DatosInversiones,
  cotizaciones: Map<string, Cotizacion | null>,
  hoy: string,
  fotos: PuntoEvolucion[] = [],
): ResumenInversiones {
  const posiciones: Posicion[] = [];
  let liquidez = 0;
  let preciosDesdeExcel = 0;

  for (const a of d.activos) {
    if (a.fuente === "Liquidez") {
      liquidez += a.valorExcel;
      continue;
    }
    if (a.participaciones <= 0) continue;
    const cot = cotizaciones.get(a.activo) ?? null;
    let precio: number | null = null;
    let fechaPrecio: string | null = null;
    let origenPrecio: Posicion["origenPrecio"] = "sin precio";
    if (cot) {
      precio = cot.precio;
      fechaPrecio = cot.fecha;
      origenPrecio = "mercado";
    } else if (a.precioExcel !== null) {
      precio = a.precioExcel;
      fechaPrecio = a.fechaPrecioExcel;
      origenPrecio = "excel";
      if (a.fuente === "Yahoo" || a.fuente === "Kraken") preciosDesdeExcel++;
    }
    const valor = precio !== null ? a.participaciones * precio : a.coste;
    posiciones.push({
      activo: a.activo,
      clase: a.clase,
      bolsa: a.bolsa,
      participaciones: a.participaciones,
      precio,
      fechaPrecio,
      origenPrecio,
      valor: r2(valor),
      coste: r2(a.coste),
      plusvalia: r2(valor - a.coste),
      rentabilidad: a.coste > 0 ? valor / a.coste - 1 : null,
      peso: 0,
    });
  }

  const invertido = posiciones.reduce((s, p) => s + p.valor, 0);
  const valor = r2(invertido + liquidez);
  for (const p of posiciones) p.peso = valor > 0 ? p.valor / valor : 0;
  posiciones.sort((a, b) => b.valor - a.valor);

  const aportado = r2(d.aportadoTotal ?? d.activos.reduce((s, a) => s + a.aportado, 0));
  const ganancia = r2(valor - aportado);

  // Reparto por clase (con la liquidez) y por bolsa.
  const items = [
    ...posiciones.map((p) => ({ nombre: p.clase, bolsa: p.bolsa, valor: p.valor })),
    ...d.activos
      .filter((a) => a.fuente === "Liquidez" && a.valorExcel > 0)
      .map((a) => ({ nombre: "Liquidez", bolsa: a.bolsa, valor: a.valorExcel })),
  ];
  const porClase = grupo(items);
  const porBolsa = grupo(items.map((x) => ({ nombre: x.bolsa, valor: x.valor })));

  // Objetivos: dentro de «Largo plazo», cada activo con su % objetivo.
  const largo = d.activos.filter((a) => a.bolsa.toLowerCase() === "largo plazo");
  const valorLargo = largo.reduce((s, a) => {
    const p = posiciones.find((x) => x.activo === a.activo);
    return s + (a.fuente === "Liquidez" ? a.valorExcel : (p?.valor ?? 0));
  }, 0);
  const objetivos: Reparto[] = largo
    .filter((a) => a.pesoObjetivo !== null)
    .map((a) => {
      const v = posiciones.find((x) => x.activo === a.activo)?.valor ?? 0;
      const peso = valorLargo > 0 ? v / valorLargo : 0;
      const desvio = peso - (a.pesoObjetivo as number);
      return {
        nombre: a.activo,
        valor: r2(v),
        peso,
        objetivo: a.pesoObjetivo,
        desvio,
        fueraDeBanda: valorLargo > 0 && Math.abs(desvio) > d.banda,
      };
    });

  // Rentabilidad del año: ganancia desde el último punto del año anterior (o el primero del año).
  let rentAnio: ResumenInversiones["rentAnio"] = null;
  const anio = hoy.slice(0, 4);
  const todos = [...d.evolucion, ...fotos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const base = [...todos].reverse().find((p) => p.fecha < `${anio}-01-01`) ?? todos.find((p) => p.fecha.startsWith(anio));
  if (base && valor > 0) {
    const gananciaAnio = r2(ganancia - (base.valor - base.aportado));
    const capital = base.valor + Math.max(0, aportado - base.aportado);
    rentAnio = { ganancia: gananciaAnio, rentabilidad: capital > 0 ? gananciaAnio / capital : null, desde: base.fecha };
  }

  const alertas: string[] = [];
  for (const o of objetivos.filter((x) => x.fueraDeBanda)) {
    const pp = Math.round((o.desvio as number) * 1000) / 10;
    alertas.push(`${o.nombre}: ${pp > 0 ? "+" : ""}${pp} puntos frente a tu objetivo`);
  }
  if (preciosDesdeExcel > 0) {
    alertas.push(`${preciosDesdeExcel} ${preciosDesdeExcel === 1 ? "activo valorado" : "activos valorados"} con el precio del Excel`);
  }

  return {
    hayPosiciones: posiciones.length > 0 || liquidez > 0,
    valor,
    liquidez: r2(liquidez),
    aportado,
    ganancia,
    rentabilidad: aportado > 0 ? ganancia / aportado : null,
    tir: d.tir,
    rentAnio,
    posiciones,
    porClase,
    porBolsa,
    objetivos,
    alertas,
    preciosDesdeExcel,
    evolucionMensual: evolucionMensual([...todos, ...(valor > 0 ? [{ fecha: hoy, aportado, valor }] : [])]),
  };
}
