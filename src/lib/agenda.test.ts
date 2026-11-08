import test from "node:test";
import assert from "node:assert/strict";
import {
  AJUSTES_POR_DEFECTO,
  addDays,
  construirDia,
  formatDuracion,
  situacion,
  tramoDelDia,
  weekday,
  ymdInTz,
  zonedToUtc,
  type Evento,
} from "./agenda.ts";
import { cifrar, descifrar } from "./cripto.ts";

const TZ = "Europe/Madrid";

function ev(titulo: string, ymd: string, ini: string, fin: string, extra: Partial<Evento> = {}): Evento {
  return {
    clave: titulo + ymd + ini,
    titulo,
    calendario: "Mi calendario",
    todoElDia: false,
    libre: false,
    inicio: zonedToUtc(ymd, ini, TZ),
    fin: zonedToUtc(ymd, fin, TZ),
    ...extra,
  };
}

test("zonedToUtc respeta el horario de verano y de invierno", () => {
  // 27 oct 2026 (ya en horario de invierno, UTC+1): 12:00 Madrid = 11:00 UTC
  assert.equal(zonedToUtc("2026-10-27", "12:00", TZ), Date.UTC(2026, 9, 27, 11, 0));
  // 15 jul 2026 (verano, UTC+2): 12:00 Madrid = 10:00 UTC
  assert.equal(zonedToUtc("2026-07-15", "12:00", TZ), Date.UTC(2026, 6, 15, 10, 0));
});

test("el día del cambio de hora de octubre dura 25 horas", () => {
  const ini = zonedToUtc("2026-10-25", "00:00", TZ);
  const fin = zonedToUtc("2026-10-26", "00:00", TZ);
  assert.equal((fin - ini) / 3600000, 25);
});

test("ymdInTz y addDays", () => {
  assert.equal(ymdInTz(Date.UTC(2026, 9, 27, 23, 30), TZ), "2026-10-28"); // 00:30 del día siguiente en Madrid
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(weekday("2026-10-27"), 2); // martes
});

test("huecos de un día laborable: ventana 17:00-22:30, mínimo 45 min", () => {
  const ymd = "2026-10-28"; // miércoles
  const ahora = zonedToUtc("2026-10-27", "08:00", TZ); // otro día
  const eventos = [
    ev("Reunión", ymd, "10:00", "11:00"), // fuera de la ventana: no afecta
    ev("Cena", ymd, "20:00", "21:00"),
    ev("Llamada corta", ymd, "21:20", "22:00"), // deja 20 min antes y 30 después
  ];
  const dia = construirDia(ymd, eventos, AJUSTES_POR_DEFECTO, TZ, ahora);
  assert.deepEqual(
    dia.huecos.map((h) => [h.ini, h.fin]),
    [[zonedToUtc(ymd, "17:00", TZ), zonedToUtc(ymd, "20:00", TZ)]],
  );
});

test("hoy: los huecos empiezan en el momento actual", () => {
  const ymd = "2026-10-27";
  const ahora = zonedToUtc(ymd, "18:10", TZ);
  const dia = construirDia(ymd, [], AJUSTES_POR_DEFECTO, TZ, ahora);
  assert.equal(dia.esHoy, true);
  assert.deepEqual(dia.huecos, [{ ini: ahora, fin: zonedToUtc(ymd, "22:30", TZ) }]);
});

test("fin de semana usa su propia ventana", () => {
  const ymd = "2026-10-31"; // sábado
  const ahora = zonedToUtc("2026-10-27", "08:00", TZ);
  const dia = construirDia(ymd, [ev("Comida", ymd, "13:00", "15:00")], AJUSTES_POR_DEFECTO, TZ, ahora);
  assert.deepEqual(
    dia.huecos.map((h) => [h.ini, h.fin]),
    [
      [zonedToUtc(ymd, "09:00", TZ), zonedToUtc(ymd, "13:00", TZ)],
      [zonedToUtc(ymd, "15:00", TZ), zonedToUtc(ymd, "22:30", TZ)],
    ],
  );
});

test("un evento marcado como libre no ocupa ni solapa", () => {
  const ymd = "2026-10-28";
  const ahora = zonedToUtc("2026-10-27", "08:00", TZ);
  const eventos = [ev("Recordatorio", ymd, "18:00", "19:00", { libre: true }), ev("Clase", ymd, "18:30", "19:30")];
  const dia = construirDia(ymd, eventos, AJUSTES_POR_DEFECTO, TZ, ahora);
  assert.equal(dia.solapes.length, 0);
  assert.equal(dia.eventos.length, 2); // se muestra
  assert.deepEqual(dia.huecos[0], { ini: zonedToUtc(ymd, "17:00", TZ), fin: zonedToUtc(ymd, "18:30", TZ) });
});

test("detecta solapes entre eventos que ocupan", () => {
  const ymd = "2026-10-28";
  const ahora = zonedToUtc("2026-10-27", "08:00", TZ);
  const eventos = [ev("A", ymd, "10:00", "11:30"), ev("B", ymd, "11:00", "12:00"), ev("C", ymd, "12:00", "13:00")];
  const dia = construirDia(ymd, eventos, AJUSTES_POR_DEFECTO, TZ, ahora);
  assert.equal(dia.solapes.length, 1);
  assert.deepEqual([dia.solapes[0][0].titulo, dia.solapes[0][1].titulo], ["A", "B"]);
});

test("eventos de todo el día: fin exclusivo y no ocupan huecos", () => {
  const ahora = zonedToUtc("2026-10-27", "08:00", TZ);
  const e: Evento = {
    clave: "viaje",
    titulo: "Viaje",
    calendario: "Mi calendario",
    todoElDia: true,
    libre: false,
    diaIni: "2026-10-28",
    diaFin: "2026-10-30",
  };
  assert.equal(construirDia("2026-10-28", [e], AJUSTES_POR_DEFECTO, TZ, ahora).todoElDia.length, 1);
  assert.equal(construirDia("2026-10-29", [e], AJUSTES_POR_DEFECTO, TZ, ahora).todoElDia.length, 1);
  assert.equal(construirDia("2026-10-30", [e], AJUSTES_POR_DEFECTO, TZ, ahora).todoElDia.length, 0);
  assert.equal(construirDia("2026-10-28", [e], AJUSTES_POR_DEFECTO, TZ, ahora).huecos.length, 1);
});

test("formatDuracion", () => {
  assert.equal(formatDuracion(45), "45 min");
  assert.equal(formatDuracion(90), "1 h 30 min");
  assert.equal(formatDuracion(120), "2 h");
});

test("cifrado AES-256-GCM: ida y vuelta, y ligado al usuario", () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const c = cifrar("token-secreto", "usuario-1");
  assert.notEqual(c, "token-secreto");
  assert.equal(descifrar(c, "usuario-1"), "token-secreto");
  assert.throws(() => descifrar(c, "usuario-2")); // otro dueño: no descifra
  const roto = c.slice(0, -2) + (c.endsWith("AA") ? "BB" : "AA");
  assert.throws(() => descifrar(roto, "usuario-1")); // manipulado: no descifra
});

// «Segundo pago a Esquiades»: del 26 oct 22:00 al 5 nov 00:00 (evento real que motivó el cambio).
const esquiades = (): Evento => ({
  clave: "esquiades",
  titulo: "Segundo pago a Esquiades",
  calendario: "Mi calendario",
  todoElDia: false,
  libre: false,
  inicio: zonedToUtc("2026-10-26", "22:00", TZ),
  fin: zonedToUtc("2026-11-05", "00:00", TZ),
});

test("varios días como contexto: no ocupa huecos ni solapa", () => {
  const antes = zonedToUtc("2026-10-28", "08:00", TZ);
  const cena = ev("Cena", "2026-10-28", "20:00", "21:00");
  const dia = construirDia("2026-10-28", [esquiades(), cena], AJUSTES_POR_DEFECTO, TZ, antes);
  assert.equal(dia.variosDias.length, 1);
  assert.deepEqual(dia.eventos.map((e) => e.titulo), ["Cena"]);
  assert.equal(dia.solapes.length, 0);
  assert.equal(dia.huecos.length, 2); // 17:00–20:00 y 21:00–22:30
});

test("varios días sin la opción: ocupa, recortado al día", () => {
  const antes = zonedToUtc("2026-10-28", "08:00", TZ);
  const ajustes = { ...AJUSTES_POR_DEFECTO, variosDiasComoContexto: false };
  const dia = construirDia("2026-10-28", [esquiades(), ev("Cena", "2026-10-28", "20:00", "21:00")], ajustes, TZ, antes);
  assert.equal(dia.variosDias.length, 0);
  assert.equal(dia.eventos.length, 2);
  assert.equal(dia.huecos.length, 0);
  assert.equal(dia.solapes.length, 1);
});

test("tramoDelDia recorta: desde, todo el día, hasta y normal", () => {
  const e = esquiades();
  const tramo = (ymd: string) => {
    const ini = zonedToUtc(ymd, "00:00", TZ);
    const fin = zonedToUtc(addDays(ymd, 1), "00:00", TZ);
    return tramoDelDia(e, ini, fin, TZ);
  };
  assert.equal(tramo("2026-10-26"), "desde 22:00");
  assert.equal(tramo("2026-10-30"), "Todo el día");
  assert.equal(tramo("2026-11-04"), "Todo el día");
  const corto = ev("Turno", "2026-10-28", "23:00", "23:30");
  corto.fin = zonedToUtc("2026-10-29", "01:00", TZ);
  const d29 = zonedToUtc("2026-10-29", "00:00", TZ);
  assert.equal(tramoDelDia(corto, d29, zonedToUtc("2026-10-30", "00:00", TZ), TZ), "hasta 01:00");
  const normal = ev("Cena", "2026-10-28", "20:00", "21:00");
  assert.equal(tramoDelDia(normal, 0, Infinity, TZ), "20:00–21:00");
});

test("un evento nocturno corto (menos de 24 h) sigue ocupando", () => {
  const corto = ev("Viaje nocturno", "2026-10-28", "21:00", "22:00");
  corto.fin = zonedToUtc("2026-10-29", "02:00", TZ);
  const antes = zonedToUtc("2026-10-28", "08:00", TZ);
  const dia = construirDia("2026-10-28", [corto], AJUSTES_POR_DEFECTO, TZ, antes);
  assert.equal(dia.variosDias.length, 0);
  assert.equal(dia.eventos.length, 1);
});

test("duraciones redondeadas sobre el total: nunca «1 h 60 min»", () => {
  assert.equal(formatDuracion(119.6), "2 h");
  assert.equal(formatDuracion(59.6), "1 h");
  assert.equal(formatDuracion(45.2), "45 min");
  assert.equal(formatDuracion(-3), "0 min");
});

test("hoy, el primer hueco empieza en el minuto siguiente a «ahora»", () => {
  const ahora = zonedToUtc("2026-10-27", "17:20", TZ) + 25_000; // 17:20:25
  const dia = construirDia("2026-10-27", [], AJUSTES_POR_DEFECTO, TZ, ahora);
  assert.equal(dia.huecos[0].ini, zonedToUtc("2026-10-27", "17:21", TZ));
});

test("situación: lo que pasa ahora (el más reciente si se solapan), lo siguiente y el tiempo libre", () => {
  const eventos = [
    ev("Oficina", "2026-10-27", "09:00", "18:00"),
    ev("Reunión", "2026-10-27", "10:30", "11:30"),
    ev("Foco", "2026-10-27", "12:00", "13:00", { libre: true }),
    ev("Cena", "2026-10-27", "21:00", "22:00"),
  ];
  const a = zonedToUtc("2026-10-27", "10:40", TZ);
  const s = situacion(construirDia("2026-10-27", eventos, AJUSTES_POR_DEFECTO, TZ, a), TZ, a);
  assert.deepEqual(s.actual, { titulo: "Reunión", hasta: "11:30" });
  assert.equal(s.libre, "3 h"); // 18:00–21:00 (22:00–22:30 no llega al mínimo de 45 min)
  const b = zonedToUtc("2026-10-27", "18:30", TZ);
  const t = situacion(construirDia("2026-10-27", eventos, AJUSTES_POR_DEFECTO, TZ, b), TZ, b);
  assert.equal(t.actual, null);
  assert.deepEqual(t.siguiente, { titulo: "Cena", hora: "21:00" });
  assert.equal(t.libre, "2 h 30 min"); // 18:30–21:00
});
