import "server-only";
import type { Activo, Cotizacion } from "./inversiones.ts";

// Último cierre de cada activo: Yahoo (ETF, fondos, acciones; no oficial) y Kraken (cripto, API
// pública). Solo servidor; sin claves. Se pide un precio por activo como mucho cada 6 horas.
// Si una cotización falla, se devuelve null y el panel usa el precio del Excel con su fecha.

const TTL = 6 * 3600_000;
const TTL_FALLO = 15 * 60_000;
const TICKER_YAHOO = /^[A-Za-z0-9.\-=^]{1,20}$/;
const PAR_KRAKEN = /^[A-Z0-9]{5,12}$/;

type Entrada = { expira: number; valor: Promise<Cotizacion | null> };
const cache = new Map<string, Entrada>();

async function obtenerJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Mi Panel)" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Respuesta de /v8/finance/chart → precio (en su divisa), divisa y fecha. */
export function leerYahoo(j: unknown): { precio: number; divisa: string; fecha: string } | null {
  const r = (j as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | {
        meta?: { regularMarketPrice?: number; regularMarketTime?: number; currency?: string };
        timestamp?: number[];
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }
    | undefined;
  if (!r?.meta) return null;
  let precio = r.meta.regularMarketPrice;
  let t = r.meta.regularMarketTime;
  if (!(typeof precio === "number" && precio > 0)) {
    const cierres = r.indicators?.quote?.[0]?.close ?? [];
    for (let i = cierres.length - 1; i >= 0; i--) {
      const c = cierres[i];
      if (typeof c === "number" && c > 0) {
        precio = c;
        t = r.timestamp?.[i];
        break;
      }
    }
  }
  if (!(typeof precio === "number" && precio > 0) || typeof t !== "number") return null;
  let divisa = (r.meta.currency ?? "EUR").toUpperCase();
  // Bolsa de Londres en peniques: GBp / GBX → libras.
  if (r.meta.currency === "GBp" || divisa === "GBX") {
    precio = precio / 100;
    divisa = "GBP";
  }
  return { precio, divisa, fecha: iso(t * 1000) };
}

/** Respuesta de /0/public/Ticker → último precio negociado. */
export function leerKraken(j: unknown): number | null {
  const o = j as { error?: unknown[]; result?: Record<string, { c?: [string, string] }> };
  if (!o?.result || (o.error && o.error.length)) return null;
  const primero = Object.values(o.result)[0];
  const p = Number(primero?.c?.[0]);
  return Number.isFinite(p) && p > 0 ? p : null;
}

async function yahoo(ticker: string): Promise<{ precio: number; divisa: string; fecha: string } | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const j = await obtenerJson(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
      );
      const r = leerYahoo(j);
      if (r) return r;
    } catch {
      // se prueba el otro servidor
    }
  }
  return null;
}

async function cambioAEur(divisa: string): Promise<number | null> {
  if (divisa === "EUR") return 1;
  if (!/^[A-Z]{3}$/.test(divisa)) return null;
  const r = await yahoo(`${divisa}EUR=X`);
  return r ? r.precio : null;
}

async function pedirCotizacion(a: Activo, hoy: string): Promise<Cotizacion | null> {
  if (a.fuente === "Kraken") {
    if (!PAR_KRAKEN.test(a.ticker)) return null;
    try {
      const p = leerKraken(await obtenerJson(`https://api.kraken.com/0/public/Ticker?pair=${a.ticker}`));
      // Los pares de Mi Panel son en euros (p. ej. XBTEUR), como en el Excel.
      return p ? { precio: p, fecha: hoy, fuente: "Kraken" } : null;
    } catch {
      return null;
    }
  }
  if (a.fuente === "Yahoo") {
    if (!TICKER_YAHOO.test(a.ticker)) return null;
    const r = await yahoo(a.ticker);
    if (!r) return null;
    const fx = await cambioAEur(r.divisa);
    return fx ? { precio: r.precio * fx, fecha: r.fecha, fuente: "Yahoo" } : null;
  }
  return null;
}

/** Cotizaciones por nombre de activo (null = sin cotización de mercado). */
export async function cotizaciones(activos: Activo[], hoy: string): Promise<Map<string, Cotizacion | null>> {
  const ahora = Date.now();
  const out = new Map<string, Cotizacion | null>();
  await Promise.all(
    activos
      .filter((a) => (a.fuente === "Yahoo" || a.fuente === "Kraken") && a.participaciones > 0 && a.ticker)
      .map(async (a) => {
        const clave = `${a.fuente}:${a.ticker}`;
        let e = cache.get(clave);
        if (!e || e.expira <= ahora) {
          const valor = pedirCotizacion(a, hoy);
          e = { expira: ahora + TTL, valor };
          cache.set(clave, e);
          valor.then((v) => {
            if (!v) cache.set(clave, { expira: Date.now() + TTL_FALLO, valor });
          });
        }
        out.set(a.activo, await e.valor);
      }),
  );
  return out;
}
