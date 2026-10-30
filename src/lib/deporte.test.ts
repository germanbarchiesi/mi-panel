import test from "node:test";
import assert from "node:assert/strict";
import { construirSemana, leerActividad, lunesDe, tipoPlan, tipoStrava, type Hecho } from "./deporte.ts";

const h = (id: string, fecha: string, sportType: string, extra: Partial<Hecho> = {}): Hecho => ({
  id,
  fecha,
  hora: "20:30",
  nombre: sportType,
  sportType,
  minutos: 45,
  metros: 0,
  ...extra,
});

test("tipos: natación, y fuerza y CrossFit juntos; los paseos no cuentan", () => {
  assert.equal(tipoStrava("Swim"), "natacion");
  assert.equal(tipoStrava("WeightTraining"), "fuerza");
  assert.equal(tipoStrava("Crossfit"), "fuerza");
  assert.equal(tipoStrava("Walk"), null);
  assert.equal(tipoPlan("Natación Panteres"), "natacion");
  assert.equal(tipoPlan("CrossFit"), "fuerza");
  assert.equal(tipoPlan("Gimnasio piernas"), "fuerza");
  assert.equal(tipoPlan("Pádel"), "otro");
});

test("lunesDe: semana de lunes a domingo", () => {
  assert.equal(lunesDe("2026-10-30"), "2026-10-26"); // viernes
  assert.equal(lunesDe("2026-11-01"), "2026-10-26"); // domingo
  assert.equal(lunesDe("2026-10-26"), "2026-10-26"); // lunes
});

test("semana planificada frente a hecha: cumplido, no hecho, pendiente, planificado y extra", () => {
  const plan = [
    { fecha: "2026-10-26", hora: "20:30", titulo: "Natación" }, // hecho
    { fecha: "2026-10-27", hora: "20:00", titulo: "CrossFit" }, // no hecho (solo un paseo)
    { fecha: "2026-10-29", hora: null, titulo: "Fuerza" }, // hecho con WeightTraining
    { fecha: "2026-10-30", hora: "19:00", titulo: "Natación" }, // hoy, pendiente
    { fecha: "2026-11-01", hora: "10:00", titulo: "CrossFit" }, // domingo, planificado
  ];
  const hechos = [
    h("1", "2026-10-26", "Swim", { metros: 2750, minutos: 43 }),
    h("2", "2026-10-27", "Walk"),
    h("3", "2026-10-29", "WeightTraining", { minutos: 51 }),
    h("4", "2026-10-29", "Swim", { metros: 1000, minutos: 20 }), // extra sin plan
    h("5", "2026-10-22", "Swim"), // semana anterior: fuera
  ];
  const s = construirSemana(plan, hechos, "2026-10-30");
  assert.equal(s.desde, "2026-10-26");
  assert.equal(s.hasta, "2026-11-01");
  const estados = s.dias.flatMap((d) => d.plan.map((p) => `${d.fecha} ${p.titulo} ${p.estado}`));
  assert.deepEqual(estados, [
    "2026-10-26 Natación hecho",
    "2026-10-27 CrossFit no_hecho",
    "2026-10-29 Fuerza hecho",
    "2026-10-30 Natación pendiente",
    "2026-11-01 CrossFit planificado",
  ]);
  assert.equal(s.planificados, 5);
  assert.equal(s.cumplidos, 2);
  assert.equal(s.pendientes, 2);
  assert.equal(s.extras, 1);
  assert.deepEqual(s.sesiones, { natacion: 2, fuerza: 1 });
  assert.equal(s.metrosNatacion, 3750);
  assert.equal(s.minutos, 114); // el paseo no cuenta
  assert.equal(s.dias[4].esHoy, true);
});

test("sin calendario «Deporte»: solo lo hecho, como extras", () => {
  const s = construirSemana([], [h("1", "2026-10-29", "WeightTraining")], "2026-10-30");
  assert.equal(s.planificados, 0);
  assert.equal(s.extras, 1);
});

test("lee actividades de la API de Strava con su hora local", () => {
  assert.deepEqual(
    leerActividad({
      id: 20782892759,
      name: "Evening Weight Training",
      sport_type: "WeightTraining",
      start_date_local: "2026-10-29T19:44:47Z",
      moving_time: 3051,
      distance: 0,
    }),
    {
      id: "20782892759",
      fecha: "2026-10-29",
      hora: "19:44",
      nombre: "Evening Weight Training",
      sportType: "WeightTraining",
      minutos: 50.85,
      metros: 0,
    },
  );
  assert.equal(leerActividad({ id: 1 }), null);
  assert.equal(leerActividad(null), null);
});
