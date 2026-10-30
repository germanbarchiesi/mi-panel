// Lector mínimo de libros de Excel (.xlsx / .xlsm) para el panel: tablas con nombre (ListObjects),
// nombres definidos de una celda y hojas sueltas. Lee SOLO los valores que guardó Excel: nunca
// ejecuta macros (vbaProject.bin ni se descomprime) ni recalcula fórmulas.
// Sin red ni Next: se prueba con `npm test`.

import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

export type Celda = number | string | boolean | null;
export type Tabla = { nombre: string; hoja: string; columnas: string[]; filas: Celda[][] };
export type Libro = {
  tablas: Map<string, Tabla>;
  nombres: Map<string, Celda>;
  hojas: Map<string, Celda[][]>; // hojas pedidas por nombre, como matriz desde A1
};

export class LibroInvalido extends Error {}

const MAX_TOTAL = 80 * 1024 * 1024; // límite de tamaño descomprimido (protección contra zip bombs)
const MAX_FICHERO = 40 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false, // se decodifican abajo en una sola pasada (incluye &#NNN;)
  isArray: (name) =>
    ["sheet", "definedName", "Relationship", "row", "c", "si", "r", "tableColumn"].includes(name),
});

type Nodo = Record<string, unknown>;

function xml(ficheros: Record<string, Uint8Array>, ruta: string): Nodo | null {
  const f = ficheros[ruta];
  if (!f) return null;
  return parser.parse(new TextDecoder().decode(f)) as Nodo;
}

function arr<T = Nodo>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : v === undefined || v === null ? [] : [v as T];
}

const ENT: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENT[e.toLowerCase()] ?? m;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

function texto(v: unknown): string {
  if (typeof v === "string") return decodificar(v);
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "#text" in (v as Nodo)) return decodificar(String((v as Nodo)["#text"]));
  return "";
}

/** Atributo XML decodificado. */
function at(n: Nodo, nombre: string): string {
  const v = n[`@${nombre}`];
  return v === undefined || v === null ? "" : decodificar(String(v));
}

/** "AB12" → { col: 27, fila: 11 } (base 0). */
export function refCelda(ref: string): { col: number; fila: number } {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(ref.trim().toUpperCase());
  if (!m) throw new LibroInvalido(`Referencia no válida: ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, fila: Number(m[2]) - 1 };
}

function rango(ref: string) {
  const [a, b] = ref.split(":");
  const ini = refCelda(a);
  const fin = refCelda(b ?? a);
  return { ini, fin };
}

function resolver(base: string, objetivo: string): string {
  if (objetivo.startsWith("/")) return objetivo.slice(1);
  const partes = base.split("/").slice(0, -1);
  for (const p of objetivo.split("/")) {
    if (p === "..") partes.pop();
    else if (p !== ".") partes.push(p);
  }
  return partes.join("/");
}

function relaciones(ficheros: Record<string, Uint8Array>, ruta: string): Map<string, string> {
  const dir = ruta.split("/").slice(0, -1).join("/");
  const nombre = ruta.split("/").pop();
  const rels = xml(ficheros, `${dir}/_rels/${nombre}.rels`);
  const m = new Map<string, string>();
  for (const r of arr((rels?.Relationships as Nodo | undefined)?.Relationship)) {
    m.set(at(r, "Id"), resolver(ruta, at(r, "Target")));
  }
  return m;
}

function cadenasCompartidas(ficheros: Record<string, Uint8Array>): string[] {
  const doc = xml(ficheros, "xl/sharedStrings.xml");
  return arr((doc?.sst as Nodo | undefined)?.si).map((si) => {
    if (si.t !== undefined) return texto(si.t);
    return arr(si.r)
      .map((r) => texto(r.t))
      .join("");
  });
}

function leerHoja(ficheros: Record<string, Uint8Array>, ruta: string, ss: string[]): Celda[][] {
  const doc = xml(ficheros, ruta);
  const filas: Celda[][] = [];
  for (const row of arr((doc?.worksheet as Nodo | undefined)?.sheetData as unknown as Nodo).flatMap((sd) => arr(sd.row))) {
    for (const c of arr(row.c)) {
      const r = c["@r"];
      if (typeof r !== "string") continue;
      const { col, fila } = refCelda(r);
      const t = c["@t"];
      const v = texto(c.v);
      let valor: Celda = null;
      if (t === "s") valor = ss[Number(v)] ?? null;
      else if (t === "inlineStr") valor = texto((c.is as Nodo | undefined)?.t);
      else if (t === "str") valor = v;
      else if (t === "b") valor = v === "1";
      else if (t === "e") valor = null; // #N/A, #DIV/0!… se tratan como vacío
      else if (v !== "") {
        const n = Number(v);
        valor = Number.isFinite(n) ? n : v;
      }
      (filas[fila] ??= [])[col] = valor;
    }
  }
  return filas;
}

/**
 * Lee del libro solo lo pedido. Lanza LibroInvalido si el fichero no es un libro de Excel
 * o falta alguna tabla, nombre u hoja pedidos.
 */
export function leerLibro(
  datos: Uint8Array,
  pedir: {
    tablas?: string[];
    nombres?: string[];
    hojas?: string[];
    /** Se leen si existen; si faltan, no es un error (módulos que pueden no estar en el libro). */
    tablasOpcionales?: string[];
    nombresOpcionales?: string[];
  },
): Libro {
  let total = 0;
  let ficheros: Record<string, Uint8Array>;
  try {
    ficheros = unzipSync(datos, {
      filter: (f) => {
        if (!f.name.endsWith(".xml") && !f.name.endsWith(".rels")) return false; // ni macros ni imágenes
        if (f.originalSize > MAX_FICHERO) throw new LibroInvalido("Fichero interno demasiado grande");
        total += f.originalSize;
        if (total > MAX_TOTAL) throw new LibroInvalido("Libro demasiado grande");
        return true;
      },
    });
  } catch (e) {
    if (e instanceof LibroInvalido) throw e;
    throw new LibroInvalido("No es un libro de Excel válido");
  }

  const wb = xml(ficheros, "xl/workbook.xml")?.workbook as Nodo | undefined;
  if (!wb) throw new LibroInvalido("No es un libro de Excel válido");
  const relsWb = relaciones(ficheros, "xl/workbook.xml");
  const rutaHoja = new Map<string, string>(); // nombre de hoja → ruta
  for (const s of arr((wb.sheets as Nodo | undefined)?.sheet)) {
    const ruta = relsWb.get(at(s, "r:id"));
    if (ruta) rutaHoja.set(at(s, "name"), ruta);
  }

  const ss = cadenasCompartidas(ficheros);
  const cacheHojas = new Map<string, Celda[][]>();
  const hoja = (ruta: string) => {
    if (!cacheHojas.has(ruta)) cacheHojas.set(ruta, leerHoja(ficheros, ruta, ss));
    return cacheHojas.get(ruta) as Celda[][];
  };
  const nombrePorRuta = new Map([...rutaHoja].map(([n, r]) => [r, n]));

  // Tablas: cada hoja enlaza sus tablas en sus .rels.
  const tablas = new Map<string, Tabla>();
  const obligatorias = new Set(pedir.tablas ?? []);
  const pedidas = new Set([...obligatorias, ...(pedir.tablasOpcionales ?? [])]);
  if (pedidas.size) {
    for (const rutaH of rutaHoja.values()) {
      for (const destino of relaciones(ficheros, rutaH).values()) {
        if (!destino.includes("/tables/")) continue;
        const tb = xml(ficheros, destino)?.table as Nodo | undefined;
        const nombre = tb ? (at(tb, "name") || at(tb, "displayName")) : "";
        if (!tb || !pedidas.has(nombre)) continue;
        const { ini, fin } = rango(at(tb, "ref"));
        const cab = tb["@headerRowCount"] === "0" ? 0 : 1;
        const tot = Number(tb["@totalsRowCount"] ?? 0) || 0;
        const columnas = arr((tb.tableColumns as Nodo | undefined)?.tableColumn).map((c) => at(c, "name").trim());
        const m = hoja(rutaH);
        const filas: Celda[][] = [];
        for (let f = ini.fila + cab; f <= fin.fila - tot; f++) {
          const fila: Celda[] = [];
          for (let c = ini.col; c <= fin.col; c++) fila.push(m[f]?.[c] ?? null);
          if (fila.some((x) => x !== null && x !== "")) filas.push(fila);
        }
        tablas.set(nombre, { nombre, hoja: nombrePorRuta.get(rutaH) ?? "", columnas, filas });
      }
    }
    for (const t of obligatorias) if (!tablas.has(t)) throw new LibroInvalido(`Falta la tabla ${t}`);
  }

  // Nombres definidos de una sola celda (p. ej. cfgAnio = Config!$B$2).
  const nombres = new Map<string, Celda>();
  const definidos = new Map<string, string>();
  for (const d of arr((wb.definedNames as Nodo | undefined)?.definedName)) {
    if (d["@localSheetId"] !== undefined) continue;
    definidos.set(at(d, "name"), texto(d));
  }
  const opcionales = new Set(pedir.nombresOpcionales ?? []);
  for (const n of [...(pedir.nombres ?? []), ...opcionales]) {
    const def = definidos.get(n);
    const m = def && /^'?(.+?)'?!(\$?[A-Z]{1,3}\$?\d+)$/.exec(def.trim());
    const ruta = m ? rutaHoja.get(m[1].replace(/''/g, "'")) : undefined;
    if (!m || !ruta) {
      if (opcionales.has(n)) continue;
      throw new LibroInvalido(`Falta el nombre ${n} o no es una sola celda`);
    }
    const { col, fila } = refCelda(m[2]);
    nombres.set(n, hoja(ruta)[fila]?.[col] ?? null);
  }

  const hojas = new Map<string, Celda[][]>();
  for (const h of pedir.hojas ?? []) {
    const ruta = rutaHoja.get(h);
    if (!ruta) throw new LibroInvalido(`Falta la hoja ${h}`);
    hojas.set(h, hoja(ruta));
  }

  return { tablas, nombres, hojas };
}

/** Número de serie de Excel (sistema 1900) → "YYYY-MM-DD". */
export function serialAFecha(n: number): string {
  const ms = Math.round((n - 25569) * 86400000); // 25569 = 1970-01-01
  return new Date(ms).toISOString().slice(0, 10);
}
