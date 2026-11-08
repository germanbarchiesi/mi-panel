import test from "node:test";
import assert from "node:assert/strict";
import { AJUSTES_POR_DEFECTO, construirDia, zonedToUtc, type Evento } from "./agenda.ts";
import { MAX_CARRILES, construirLinea, horaDelDia, posicion } from "./linea.ts";

const TZ = "Europe/Madrid";
const DIA = "2026-10-27"; // martes, ya en horario de invierno
const ANTES = zonedToUtc("2026-10-26", "12:00", TZ); // «ahora» del día anterior: ningún recorte por la hora actual

function ev(clave: string, ini: string, fin: string, extra: Partial<Evento> = {}, fecha = DIA): Evento {
  return {
    clave,
    titulo: clave,
    calendario: "Personal",
    color: "#039be5",
    todoElDia: false,
    libre: false,
    inicio: zonedToUtc(fecha, ini, TZ),
    fin: zonedToUtc(fecha, fin, TZ),
    ...extra,
  };
}

test("tramos en horas de reloj, con su tipo, su texto y su carril", () => {
  const dia = construirDia(
    DIA,
    [
      ev("A", "10:00", "11:00"),
      ev("B", "10:30", "12:00"),
      ev("C", "12:00", "13:00"),
      ev("T", "17:30", "17:45", { tarea: true, color: undefined }),
      ev("L", "18:30", "19:30", { libre: true }),
    ],
    AJUSTES_POR_DEFECTO,
    TZ,
    ANTES,
  );
  const l = construirLinea(dia, TZ);
  assert.equal(l.desde, 7);
  assert.equal(l.hasta, 23);
  assert.deepEqual(l.marcas, [9, 12, 15, 18, 21]);
  assert.equal(l.carriles, 2);
  const por = Object.fromEntries(l.tramos.map((t) => [t.titulo, t]));
  assert.deepEqual([por.A.ini, por.A.fin, por.A.carril, por.A.texto], [10, 11, 0, "10:00–11:00"]);
  assert.equal(por.B.carril, 1); // se solapa con A
  assert.equal(por.C.carril, 0); // A ya terminó
  assert.equal(por.T.tipo, "tarea");
  assert.equal(por.L.tipo, "libre");
  // Huecos (ventana L–V 17:00–22:30, mínimo 45 min): la tarea y «libre» no cuentan igual.
  assert.deepEqual(
    l.huecos.map((h) => [h.ini, h.fin]),
    [[17.75, 22.5]],
  );
});

test("lo que cruza la medianoche se recorta al día y amplía la línea", () => {
  const dia = construirDia(
    DIA,
    [ev("Noche", "23:00", "23:59", { fin: zonedToUtc(DIA, "01:00", TZ) }, "2026-10-26"), ev("Tarde", "22:00", "23:59", { fin: zonedToUtc("2026-10-28", "00:00", TZ) })],
    AJUSTES_POR_DEFECTO,
    TZ,
    ANTES,
  );
  const l = construirLinea(dia, TZ);
  const noche = l.tramos.find((t) => t.titulo === "Noche")!;
  const tarde = l.tramos.find((t) => t.titulo === "Tarde")!;
  assert.deepEqual([noche.ini, noche.fin, noche.texto], [0, 1, "00:00–01:00"]);
  assert.deepEqual([tarde.ini, tarde.fin, tarde.texto], [22, 24, "22:00–24:00"]);
  assert.equal(l.desde, 0);
  assert.equal(l.hasta, 24);
  assert.deepEqual(l.marcas, [3, 6, 9, 12, 15, 18, 21]);
});

test("como mucho tres carriles aunque se solapen cuatro", () => {
  const dia = construirDia(
    DIA,
    ["10:00", "10:10", "10:20", "10:30"].map((h, i) => ev(`E${i}`, h, "12:00")),
    AJUSTES_POR_DEFECTO,
    TZ,
    ANTES,
  );
  const l = construirLinea(dia, TZ);
  assert.equal(l.carriles, MAX_CARRILES);
  assert.ok(l.tramos.every((t) => t.carril < MAX_CARRILES));
});

test("los eventos de varios días no entran en la línea (son contexto)", () => {
  const largo = ev("Viaje", "08:00", "09:00", { fin: zonedToUtc("2026-10-30", "09:00", TZ) }, "2026-10-26");
  const dia = construirDia(DIA, [largo], AJUSTES_POR_DEFECTO, TZ, ANTES);
  assert.equal(dia.variosDias.length, 1);
  assert.equal(construirLinea(dia, TZ).tramos.length, 0);
});

test("posición en porcentaje y hora del día", () => {
  assert.equal(posicion(12, { desde: 7, hasta: 23 }), 31.25);
  assert.equal(posicion(5, { desde: 7, hasta: 23 }), 0);
  assert.equal(posicion(24, { desde: 7, hasta: 23 }), 100);
  const dia = construirDia(DIA, [], AJUSTES_POR_DEFECTO, TZ, ANTES);
  assert.equal(horaDelDia(zonedToUtc(DIA, "13:45", TZ), dia, TZ), 13.75);
  assert.equal(horaDelDia(dia.ini - 1, dia, TZ), 0);
  assert.equal(horaDelDia(dia.fin, dia, TZ), 24);
});
