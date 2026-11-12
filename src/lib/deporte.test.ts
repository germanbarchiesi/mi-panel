import test from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS_MANUALES,
  construirSemana,
  cuerpoStrava,
  diasParaApuntar,
  leerActividad,
  lunesDe,
  tipoManualDePlan,
  tipoPlan,
  tipoStrava,
  validarManual,
  type Hecho,
} from "./deporte.ts";

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

test("entreno a mano: tipos del formulario y su vuelta desde Strava", () => {
  assert.equal(tipoManualDePlan("Natación Panteres"), "natacion");
  assert.equal(tipoManualDePlan("CrossFit WOD"), "crossfit");
  assert.equal(tipoManualDePlan("Pesas piernas"), "fuerza");
  assert.equal(tipoManualDePlan("Paseo"), null);
  assert.equal(tipoStrava(TIPOS_MANUALES.natacion.sportType), "natacion");
  assert.equal(tipoStrava(TIPOS_MANUALES.crossfit.sportType), "fuerza");
  assert.equal(tipoStrava(TIPOS_MANUALES.fuerza.sportType), "fuerza");
});

test("entreno a mano: validación del formulario", () => {
  const hoy = "2026-11-12";
  const bien = { fecha: "2026-11-11", hora: "20:00", tipo: "natacion", minutos: "45", metros: "1500" };
  assert.deepEqual(validarManual(bien, hoy, "09:00"), {
    ok: true,
    entreno: { fecha: "2026-11-11", hora: "20:00", tipo: "natacion", minutos: 45, metros: 1500 },
  });
  // Los metros solo cuentan en natación.
  const cf = validarManual({ ...bien, tipo: "crossfit" }, hoy, "09:00");
  assert.ok(cf.ok && cf.entreno.metros === 0);
  assert.equal(validarManual({ ...bien, metros: "" }, hoy, "09:00").ok, true);
  for (const [campos, error] of [
    [{ ...bien, fecha: "2026-11-05" }, "Elige un día de esta última semana."],
    [{ ...bien, fecha: "2026-11-13" }, "Elige un día de esta última semana."],
    [{ ...bien, fecha: hoy, hora: "21:00" }, "Esa hora aún no ha llegado."],
    [{ ...bien, hora: "25:00" }, "La hora no es válida."],
    [{ ...bien, tipo: "yoga" }, "Elige natación, CrossFit o fuerza."],
    [{ ...bien, minutos: "0" }, "La duración va de 1 a 600 minutos."],
    [{ ...bien, minutos: "45.5" }, "La duración va de 1 a 600 minutos."],
    [{ ...bien, metros: "-10" }, "Los metros van de 0 a 20.000."],
  ] as const) {
    assert.deepEqual(validarManual(campos, hoy, "20:30"), { ok: false, error });
  }
  assert.equal(validarManual({ ...bien, fecha: "2026-11-06" }, hoy, "09:00").ok, true); // 6 días atrás
});

test("entreno a mano: lo que se envía a Strava, con la zona del usuario", () => {
  const e = { fecha: "2026-11-11", hora: "20:00", tipo: "natacion" as const, minutos: 45, metros: 1500 };
  assert.deepEqual(cuerpoStrava(e, 60), {
    name: "Natación",
    sport_type: "Swim",
    start_date_local: "2026-11-11T20:00:00+01:00",
    elapsed_time: "2700",
    description: "Apuntado a mano desde Mi Panel.",
    distance: "1500",
  });
  const sinMetros = cuerpoStrava({ ...e, tipo: "crossfit", metros: 0 }, -330);
  assert.equal(sinMetros.start_date_local, "2026-11-11T20:00:00-05:30");
  assert.equal(sinMetros.sport_type, "Crossfit");
  assert.equal("distance" in sinMetros, false);
});

test("entreno a mano: días que se ofrecen y la sesión que quedó sin hacer", () => {
  // Jueves 12 nov: el martes la natación no se hizo y el miércoles sí.
  const hoy = "2026-11-12";
  const semana = construirSemana(
    [
      { fecha: "2026-11-10", hora: "20:30", titulo: "Natación", minutos: 50 },
      { fecha: "2026-11-11", hora: "20:00", titulo: "CrossFit", minutos: 60 },
      { fecha: "2026-11-12", hora: "21:00", titulo: "CrossFit", minutos: 60 },
    ],
    [{ id: "1", fecha: "2026-11-11", hora: "20:05", nombre: "WOD", sportType: "Crossfit", minutos: 60, metros: 0 }],
    hoy,
  );

  // 22:10: el CrossFit de hoy ya tocaba y no está en Strava.
  const noche = diasParaApuntar(semana, hoy, "22:10");
  assert.equal(noche.opciones.length, 7);
  assert.deepEqual(
    noche.opciones.slice(0, 4).map((o) => o.etiqueta),
    ["Hoy", "Ayer", "Mar 10", "Lun 9"],
  );
  assert.deepEqual(noche.opciones[0], { fecha: hoy, etiqueta: "Hoy", hora: "21:00", sugerencia: { tipo: "crossfit", minutos: 60 } });
  assert.equal(noche.opciones[1].sugerencia, null); // el miércoles ya está hecho
  assert.equal(noche.opciones[1].hora, "20:00");
  assert.deepEqual(noche.opciones[2].sugerencia, { tipo: "natacion", minutos: 50 });
  assert.equal(noche.opciones[2].hora, "20:30");
  assert.equal(noche.opciones[6].fecha, "2026-11-06"); // la semana anterior también se puede apuntar
  assert.equal(noche.elegido, hoy);

  // 10:37: el de hoy aún no toca; ayer está hecho y el martes no se elige solo.
  const manana = diasParaApuntar(semana, hoy, "10:37");
  assert.equal(manana.opciones[0].sugerencia, null);
  assert.equal(manana.opciones[0].hora, "09:30"); // hace una hora, en cuartos
  assert.equal(manana.elegido, hoy);
  assert.equal(diasParaApuntar(semana, hoy, "00:20").opciones[0].hora, "00:00");

  // Si lo que falta es de ayer, se propone ayer.
  const viernes = diasParaApuntar(construirSemana([{ fecha: "2026-11-12", hora: null, titulo: "Natación" }], [], "2026-11-13"), "2026-11-13", "08:00");
  assert.equal(viernes.elegido, "2026-11-12");
  assert.deepEqual(viernes.opciones[1].sugerencia, { tipo: "natacion", minutos: null });
});

test("lee las actividades manuales de Strava (sin tiempo en movimiento)", () => {
  const h = leerActividad({
    id: 5,
    name: "Natación",
    sport_type: "Swim",
    start_date_local: "2026-11-11T20:00:00Z",
    moving_time: 0,
    elapsed_time: 2700,
    distance: 1500,
    manual: true,
  });
  assert.equal(h?.minutos, 45);
  assert.equal(h?.manual, true);
  assert.equal("manual" in (leerActividad({ id: 6, start_date_local: "2026-11-11T20:00:00Z", manual: false }) ?? {}), false);
});
