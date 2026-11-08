import test from "node:test";
import assert from "node:assert/strict";
import { componerResumen, decidir, horaHablada, type DatosResumen } from "./resumen.ts";

const madrid = (iso: string) => Date.parse(iso);

test("cuándo: 6:30 prepara, 7:00 notifica, solo de lunes a viernes, en la hora de Madrid", () => {
  // Lunes 9 nov 2026; Madrid = UTC+1.
  assert.deepEqual(decidir(madrid("2026-11-09T05:00:00Z"), "Europe/Madrid", null), { accion: "nada", fecha: "2026-11-09" }); // 6:00
  assert.equal(decidir(madrid("2026-11-09T05:30:00Z"), "Europe/Madrid", null).accion, "preparar"); // 6:30
  assert.equal(
    decidir(madrid("2026-11-09T06:00:00Z"), "Europe/Madrid", { preparado: true, notificado: false }).accion,
    "notificar",
  ); // 7:00
  assert.equal(
    decidir(madrid("2026-11-09T06:30:00Z"), "Europe/Madrid", { preparado: true, notificado: true }).accion,
    "nada",
  );
  // Si la llamada de las 6:30 se perdió, a las 7:00 hace las dos cosas.
  assert.equal(decidir(madrid("2026-11-09T06:00:00Z"), "Europe/Madrid", null).accion, "preparar_y_notificar");
  // Pasadas las 10:00 ya no se manda.
  assert.equal(decidir(madrid("2026-11-09T09:00:00Z"), "Europe/Madrid", null).accion, "nada");
  // Sábado 7 nov.
  assert.equal(decidir(madrid("2026-11-07T05:30:00Z"), "Europe/Madrid", null).accion, "nada");
});

test("cuándo: sigue la zona del viaje y el horario de verano", () => {
  // Bangkok (UTC+7): lunes 9 nov a las 6:30 de allí = 23:30 UTC del domingo.
  assert.deepEqual(decidir(madrid("2026-11-08T23:30:00Z"), "Asia/Bangkok", null), { accion: "preparar", fecha: "2026-11-09" });
  // Verano en Madrid (UTC+2): lunes 6 jul 2026 a las 7:00 = 5:00 UTC.
  assert.equal(
    decidir(madrid("2026-07-06T05:00:00Z"), "Europe/Madrid", { preparado: true, notificado: false }).accion,
    "notificar",
  );
});

test("horas para la voz", () => {
  assert.equal(horaHablada("10:30"), "las 10 y media");
  assert.equal(horaHablada("13:00"), "la una");
  assert.equal(horaHablada("17:15"), "las 5 y cuarto");
  assert.equal(horaHablada("08:45"), "las 9 menos cuarto");
  assert.equal(horaHablada("12:45"), "la una menos cuarto");
  assert.equal(horaHablada("19:20"), "las 7 y 20");
  assert.equal(horaHablada("00:00"), "las 12");
});

const base: DatosResumen = {
  fecha: "2026-11-09",
  agenda: {
    eventos: [
      { titulo: "Segundo pago a Esquiades", hora: null },
      { titulo: "Reunión de equipo 🚀", hora: "10:30" },
    ],
    primerHueco: { ini: "17:00", fin: "19:00" },
  },
  tareas: {
    ok: true,
    hoy: [
      { titulo: "Llamar al fontanero", hora: "10:30", prioridad: "alta", ambito: "personal" },
      { titulo: "Revisar horas", hora: null, prioridad: null, ambito: "trabajo" },
    ],
    arrastradas: 2,
    reunion: ["Anna"],
  },
  vencimientos: { semana: [{ concepto: "Mutua", dias: 1 }], mes: 3 },
  finanzas: { ritmo: "atencion", pendientes: 4, mes: "noviembre" },
  deporte: [{ titulo: "Natación", hora: "20:30" }],
  cartera: { variacion: 0.0123 },
  agentes: ["Alerta vuelos noviembre 2027"],
};

test("texto del resumen: todos los módulos, sin importes", () => {
  const t = componerResumen(base);
  assert.equal(
    t,
    "Buenos días. Hoy es lunes 9 de noviembre. " +
      "En la agenda, 2 eventos: Segundo pago a Esquiades y Reunión de equipo a las 10 y media. " +
      "Tu primer hueco libre es de las 5 a las 7. " +
      "Tareas para hoy: 1 de trabajo y 1 personal. " +
      "La primera con hora, a las 10 y media: Llamar al fontanero. " +
      "Arrastras 2 tareas de días anteriores. " +
      "Prioridad alta: Llamar al fontanero. " +
      "Hoy te ves con Anna. " +
      "Vencimientos esta semana: Mutua mañana. " +
      "Y 2 vencimientos más en los próximos 30 días. " +
      "Atención: el gasto de noviembre va algo más rápido que tu media. " +
      "Tienes 4 movimientos sin clasificar. " +
      "Deporte hoy: Natación a las 8 y media. " +
      "La cartera sube un 1,2 por ciento desde la última foto. " +
      "Novedades de tus agentes: Alerta vuelos noviembre 2027. " +
      "Que tengas buen día.",
  );
  assert.ok(!/€|euro/i.test(t));
});

test("texto del resumen: Mis tareas caída, módulos vacíos y agenda ilegible", () => {
  const t = componerResumen({
    ...base,
    agenda: null,
    tareas: { ok: false },
    vencimientos: { semana: [], mes: 0 },
    finanzas: null,
    deporte: [],
    cartera: null,
    agentes: [],
  });
  assert.equal(
    t,
    "Buenos días. Hoy es lunes 9 de noviembre. No he podido leer la agenda. " +
      "Mis tareas no ha respondido, así que hoy no incluyo tus tareas. Que tengas buen día.",
  );
});

test("texto del resumen: la primera tarea con hora es la más temprana", () => {
  const t = componerResumen({
    ...base,
    tareas: {
      ok: true,
      hoy: [
        { titulo: "Tarde", hora: "18:00", prioridad: null, ambito: "personal" },
        { titulo: "Temprano", hora: "08:30", prioridad: null, ambito: "trabajo" },
      ],
      arrastradas: 0,
      reunion: [],
    },
  });
  assert.match(t, /La primera con hora, a las 8 y media: Temprano\./);
});
