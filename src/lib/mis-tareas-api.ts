import "server-only";
import {
  RespuestaInvalida,
  esFecha,
  parsearOcupado,
  parsearResumen,
  type Ambito,
  type Fallo,
  type Ocupado,
  type Resumen,
} from "./mis-tareas.ts";

// Llamadas a la API v1 de Mis tareas. SOLO servidor: la clave (MIS_TAREAS_API_KEY) nunca llega
// al navegador. Caché en memoria de 60 s como máximo y peticiones con no-store: las tareas no se
// guardan en la base de datos ni en la caché de Vercel.

export type ResultadoMT<T> = { ok: true; datos: T; obtenido: number } | { ok: false; fallo: Fallo };

const TTL_OK = 60_000; // máximo permitido por el plan
const TTL_FALLO = 15_000; // evita insistir en cada render si Mis tareas está caída
const CLAVE = /^mt_[0-9a-f]{64}$/i;

type Config = { base: string; clave: string };

function config(): Config | null {
  const url = process.env.MIS_TAREAS_API_URL?.trim();
  const clave = process.env.MIS_TAREAS_API_KEY?.trim();
  if (!url || !clave || !CLAVE.test(clave)) return null;
  try {
    const u = new URL(url);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) return null;
    return { base: u.origin, clave };
  } catch {
    return null;
  }
}

/** Dirección de Mis tareas para el enlace «Abrir Mis tareas» (sin la clave). */
export function urlMisTareas(): string | null {
  return config()?.base ?? null;
}

const cache = new Map<string, { expira: number; valor: Promise<ResultadoMT<unknown>> }>();
let bloqueadoHasta = 0; // tras un 429, no se vuelve a llamar hasta que pase Retry-After

async function pedir<T>(ruta: string, params: Record<string, string>, parsear: (j: unknown) => T): Promise<ResultadoMT<T>> {
  const cfg = config();
  if (!cfg) return { ok: false, fallo: "sin_configurar" };

  const qs = new URLSearchParams(params).toString();
  const clave = `${ruta}?${qs}`;
  const ahora = Date.now();
  const hit = cache.get(clave);
  if (hit && hit.expira > ahora) return hit.valor as Promise<ResultadoMT<T>>;
  if (ahora < bloqueadoHasta) return { ok: false, fallo: "limite" };

  const valor = (async (): Promise<ResultadoMT<T>> => {
    let res: Response;
    try {
      res = await fetch(`${cfg.base}${ruta}?${qs}`, {
        headers: { Authorization: `Bearer ${cfg.clave}`, Accept: "application/json" },
        cache: "no-store",
        redirect: "error", // la clave nunca se reenvía a otro sitio
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { ok: false, fallo: "red" };
    }
    if (res.status === 401) return { ok: false, fallo: "clave" };
    if (res.status === 400) return { ok: false, fallo: "peticion" };
    if (res.status === 429) {
      const s = Number(res.headers.get("retry-after"));
      bloqueadoHasta = Date.now() + (Number.isFinite(s) && s > 0 ? Math.min(s, 600) : 60) * 1000;
      return { ok: false, fallo: "limite" };
    }
    if (!res.ok) return { ok: false, fallo: res.status >= 500 ? "caido" : "respuesta" };
    try {
      return { ok: true, datos: parsear(await res.json()), obtenido: Date.now() };
    } catch (e) {
      if (!(e instanceof RespuestaInvalida) && !(e instanceof SyntaxError)) throw e;
      return { ok: false, fallo: "respuesta" };
    }
  })();

  cache.set(clave, { expira: ahora + TTL_OK, valor });
  valor.then((r) => {
    if (!r.ok) cache.set(clave, { expira: r.fallo === "limite" ? bloqueadoHasta : Date.now() + TTL_FALLO, valor });
  });
  for (const [k, v] of cache) if (v.expira <= ahora) cache.delete(k); // limpieza
  return valor;
}

export function pedirResumen(fecha: string, ambito?: Ambito): Promise<ResultadoMT<Resumen>> {
  if (!esFecha(fecha)) throw new Error("fecha no válida");
  return pedir("/api/v1/resumen", { fecha, ...(ambito ? { ambito } : {}) }, parsearResumen);
}

export function pedirOcupado(desde: string, dias: number, ambito?: Ambito): Promise<ResultadoMT<Ocupado>> {
  if (!esFecha(desde)) throw new Error("fecha no válida");
  const d = Math.min(14, Math.max(1, Math.round(dias)));
  return pedir("/api/v1/ocupado", { desde, dias: String(d), ...(ambito ? { ambito } : {}) }, parsearOcupado);
}
