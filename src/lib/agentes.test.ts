import test from "node:test";
import assert from "node:assert/strict";
import { AGENTES, enlaceSeguro, ordenar, parsearResultado, proximaEjecucion, type Tarjeta } from "./agentes.ts";

// Ejemplo del plan técnico (sección «Agentes»).
const EJEMPLO = JSON.stringify({
  agente: "Alerta vuelos noviembre 2027",
  grupo: "Viaje Tailandia",
  ejecutado: "2026-10-26T08:55:00+01:00",
  estado: "sin_novedades",
  titular: "Vuelos nov 2027: todavía no están a la venta.",
  puntos: [],
  enlace: "",
  privado: false,
});

test("lee el JSON de ejemplo del plan", () => {
  const r = parsearResultado(EJEMPLO);
  assert.ok(r);
  assert.equal(r.ejecutado, Date.parse("2026-10-26T07:55:00Z"));
  assert.equal(r.estado, "sin_novedades");
  assert.equal(r.titular, "Vuelos nov 2027: todavía no están a la venta.");
  assert.deepEqual(r.puntos, []);
  assert.equal(r.enlace, null);
});

test("tolera ```json``` alrededor; recorta puntos; rechaza lo que no sirve", () => {
  const r = parsearResultado(
    "```json\n" +
      JSON.stringify({
        ejecutado: "2026-11-01T08:50:00+01:00",
        estado: "raro",
        titular: "  ¡Fechas   confirmadas!  ",
        puntos: ["a", "b", "c", "d", 5],
        enlace: "https://www.tourismthailand.org/x",
      }) +
      "\n```",
  );
  assert.equal(r?.estado, "novedad"); // estado desconocido → novedad (se muestra)
  assert.equal(r?.titular, "¡Fechas confirmadas!");
  assert.deepEqual(r?.puntos, ["a", "b", "c"]);
  assert.equal(r?.enlace, "https://www.tourismthailand.org/x");
  assert.equal(parsearResultado(null), null);
  assert.equal(parsearResultado("no es json"), null);
  assert.equal(parsearResultado(JSON.stringify({ ejecutado: "ayer", titular: "x" })), null);
  assert.equal(parsearResultado(JSON.stringify({ ejecutado: "2026-10-26T08:55:00Z" })), null); // sin titular
});

test("solo enlaces https", () => {
  assert.equal(enlaceSeguro("javascript:alert(1)"), null);
  assert.equal(enlaceSeguro("http://ejemplo.com"), null);
  assert.equal(enlaceSeguro("data:text/html,x"), null);
  assert.equal(enlaceSeguro("https://claude.ai/artifact/abc"), "https://claude.ai/artifact/abc");
});

test("próxima ejecución en hora de Madrid: semanal, días 1 y 15, y cambio de hora", () => {
  const ahora = Date.parse("2026-10-30T11:00:00Z"); // viernes
  const vuelos = AGENTES.find((a) => a.clave === "vuelos")!; // lunes 8:53
  assert.equal(proximaEjecucion(vuelos.cron, ahora), Date.parse("2026-11-02T07:53:00Z"));
  const yipeng = AGENTES.find((a) => a.clave === "yipeng")!; // días 1 y 15, 8:47
  assert.equal(proximaEjecucion(yipeng.cron, ahora), Date.parse("2026-11-01T07:47:00Z"));
  const inv = AGENTES.find((a) => a.clave === "inversiones")!; // domingos 9:47
  assert.equal(proximaEjecucion(inv.cron, ahora), Date.parse("2026-11-01T08:47:00Z"));
  // En verano (UTC+2) la misma hora local es una hora antes en UTC.
  assert.equal(proximaEjecucion(vuelos.cron, Date.parse("2026-07-01T00:00:00Z")), Date.parse("2026-07-06T06:53:00Z"));
});

test("orden: alertas y novedades primero, luego lo más reciente, sin resultado al final", () => {
  const t = (clave: string, estado: Tarjeta["resultado"]): Tarjeta => ({
    ...AGENTES[0],
    clave,
    resultado: estado,
    proxima: null,
    ficheroCreado: true,
  });
  const r = (estado: "alerta" | "novedad" | "sin_novedades", ejecutado: number) => ({
    estado,
    ejecutado,
    titular: "x",
    puntos: [],
    enlace: null,
  });
  const orden = ordenar([
    t("a", r("sin_novedades", 3)),
    t("b", null),
    t("c", r("novedad", 1)),
    t("d", r("sin_novedades", 5)),
    t("e", r("alerta", 0)),
  ]).map((x) => x.clave);
  assert.deepEqual(orden, ["e", "c", "d", "a", "b"]);
});
