import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerLibro } from "./xlsx.ts";
import { LECTURA_INVERSIONES, datosInversiones, evolucionMensual, valorar, type Cotizacion } from "./inversiones.ts";
import { cotizaciones, leerKraken, leerYahoo } from "./precios.ts";

// Cartera inventada (la V6 real aún no tiene posiciones).
const datos = datosInversiones(
  leerLibro(readFileSync(new URL("./fixtures/inversiones-prueba.xlsx", import.meta.url)), LECTURA_INVERSIONES),
);

test("lee tblActivos, tblEvolucion, invAportado e invBanda", () => {
  assert.equal(datos.activos.length, 5);
  assert.equal(datos.activos[1].ticker, "VWCE.DE");
  assert.equal(datos.activos[1].pesoObjetivo, 0.8);
  assert.equal(datos.activos[0].valorExcel, 500);
  assert.equal(datos.evolucion.length, 4);
  assert.equal(datos.aportadoTotal, 1990);
  assert.equal(datos.banda, 0.05);
});

test("un libro sin tablas de inversiones no falla: sin posiciones", () => {
  const vacio = datosInversiones({ tablas: new Map(), nombres: new Map(), hojas: new Map() });
  const r = valorar(vacio, new Map(), "2026-10-30");
  assert.equal(r.hayPosiciones, false);
  assert.equal(r.valor, 0);
});

test("valora con el cierre de mercado y, si falla, con el precio del Excel", () => {
  const cots = new Map<string, Cotizacion | null>([
    ["ETF Mundo", { precio: 110, fecha: "2026-10-29", fuente: "Yahoo" }],
    ["Bitcoin", null], // falló Kraken
  ]);
  const r = valorar(datos, cots, "2026-10-30");
  assert.equal(r.valor, 2300); // 1100 + 500 + 200 + 500 de liquidez
  assert.equal(r.liquidez, 500);
  assert.equal(r.aportado, 1990);
  assert.equal(r.ganancia, 310);
  assert.equal(r.preciosDesdeExcel, 1);
  const etf = r.posiciones.find((p) => p.activo === "ETF Mundo");
  assert.equal(etf?.origenPrecio, "mercado");
  assert.equal(etf?.plusvalia, 200);
  assert.equal(r.posiciones.find((p) => p.activo === "Bitcoin")?.origenPrecio, "excel");
  assert.equal(r.posiciones.find((p) => p.activo === "Vendido"), undefined); // 0 participaciones
});

test("reparto por bolsa y clase, y desvío frente al objetivo con la banda", () => {
  const r = valorar(datos, new Map([["ETF Mundo", { precio: 110, fecha: "2026-10-29", fuente: "Yahoo" as const }]]), "2026-10-30");
  assert.deepEqual(
    r.porBolsa.map((b) => [b.nombre, b.valor]),
    [
      ["Largo plazo", 1600],
      ["Colchón", 700],
    ],
  );
  assert.deepEqual(
    r.porClase.map((c) => c.nombre),
    ["Renta variable", "Cripto", "Liquidez", "Renta fija"],
  );
  const etf = r.objetivos.find((o) => o.nombre === "ETF Mundo");
  assert.ok(Math.abs((etf?.peso ?? 0) - 0.6875) < 1e-9);
  assert.equal(etf?.fueraDeBanda, true);
  assert.ok(r.alertas.some((a) => a.startsWith("ETF Mundo: -11.3 puntos")));
});

test("rentabilidad del año desde la última foto del año anterior, y evolución mensual", () => {
  const r = valorar(datos, new Map([["ETF Mundo", { precio: 110, fecha: "2026-10-29", fuente: "Yahoo" as const }]]), "2026-10-30");
  assert.equal(r.rentAnio?.desde, "2025-12-31");
  assert.equal(r.rentAnio?.ganancia, 210); // 310 − (1100 − 1000)
  assert.ok(Math.abs((r.rentAnio?.rentabilidad ?? 0) - 210 / 2090) < 1e-9);
  assert.deepEqual(
    r.evolucionMensual.map((p) => [p.fecha, p.valor]),
    [
      ["2025-12-31", 1100],
      ["2026-06-30", 1450],
      ["2026-09-30", 1700], // la última de septiembre
      ["2026-10-30", 2300], // hoy
    ],
  );
  assert.equal(evolucionMensual([]).length, 0);
});

test("lee las respuestas de Yahoo (con peniques) y Kraken", () => {
  const y = leerYahoo({
    chart: { result: [{ meta: { regularMarketPrice: 123.4, regularMarketTime: 1793300000, currency: "EUR" } }] },
  });
  assert.deepEqual(y, { precio: 123.4, divisa: "EUR", fecha: "2026-10-29" });
  const gbp = leerYahoo({
    chart: {
      result: [
        {
          meta: { currency: "GBp" },
          timestamp: [1793200000, 1793300000],
          indicators: { quote: [{ close: [500, null] }] },
        },
      ],
    },
  });
  assert.deepEqual(gbp, { precio: 5, divisa: "GBP", fecha: "2026-10-28" });
  assert.equal(leerYahoo({ chart: { result: [] } }), null);
  assert.equal(leerKraken({ error: [], result: { XXBTZEUR: { c: ["60000.5", "0.1"] } } }), 60000.5);
  assert.equal(leerKraken({ error: ["EQuery:Unknown asset pair"] }), null);
});

test("cotizaciones: convierte a euros, no llama con tickers no válidos y usa caché", async () => {
  const llamadas: string[] = [];
  globalThis.fetch = (async (url: string) => {
    llamadas.push(url);
    const json = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (url.includes("USDEUR%3DX")) {
      return json({ chart: { result: [{ meta: { regularMarketPrice: 0.9, regularMarketTime: 1793300000, currency: "EUR" } }] } });
    }
    if (url.includes("AAPL")) {
      return json({ chart: { result: [{ meta: { regularMarketPrice: 200, regularMarketTime: 1793300000, currency: "USD" } }] } });
    }
    if (url.includes("kraken")) return json({ error: [], result: { XXBTZEUR: { c: ["60000", "1"] } } });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  const base = datos.activos[1];
  const activos = [
    { ...base, activo: "Apple", ticker: "AAPL", divisa: "USD" },
    { ...datos.activos[2] },
    { ...base, activo: "Raro", ticker: "x;y" },
  ];
  const c = await cotizaciones(activos, "2026-10-30");
  assert.equal(c.get("Apple")?.precio, 180); // 200 USD × 0,9
  assert.equal(c.get("Bitcoin")?.precio, 60000);
  assert.equal(c.get("Raro"), null);
  assert.ok(!llamadas.some((u) => u.includes("x%3By") || u.includes("x;y")));
  const n = llamadas.length;
  await cotizaciones(activos, "2026-10-30");
  assert.equal(llamadas.length, n); // caché
});
