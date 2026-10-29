import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerLibro } from "./xlsx.ts";
import { LECTURA, datosDelLibro, type Programado } from "./finanzas.ts";
import { calcularVencimientos, detectarRepetidos, fechasProgramado, nombreVisible, normalizar } from "./vencimientos.ts";

// Libro sintético: tblProgramados con su columna «Día» y movimientos repetidos inventados.
const datos = datosDelLibro(
  leerLibro(readFileSync(new URL("./fixtures/vencimientos-prueba.xlsx", import.meta.url)), LECTURA),
);

const prog = (p: Partial<Programado>): Programado => ({
  concepto: "X",
  categoria: "Servicios",
  importe: 100,
  frecuencia: "Mensual",
  desde: 1,
  hasta: 0,
  estado: "Pendiente",
  porcentaje: 0.5,
  dia: 1,
  ...p,
});

test("lee tblProgramados con la columna «Día» y el % de cada fila", () => {
  assert.equal(datos.tieneColumnaDia, true);
  assert.equal(datos.programados.length, 5);
  const seguro = datos.programados[0];
  assert.equal(seguro.concepto, "Seguro hogar");
  assert.equal(seguro.frecuencia, "Anual");
  assert.equal(seguro.desde, 4);
  assert.equal(seguro.dia, 10);
  assert.equal(seguro.porcentaje, 0.5);
  assert.equal(datos.programados[3].importe, null); // fila de ejemplo sin importe
  assert.equal(datos.programados[3].dia, null);
});

test("fechas de Previsión: anual, trimestral cruzando de año, mensual con fin y día recortado", () => {
  assert.deepEqual(fechasProgramado(prog({ frecuencia: "Anual", desde: 4, dia: 10 }), 2026, "2026-01-01", "2027-12-31"), [
    "2026-04-10",
    "2027-04-10",
  ]);
  assert.deepEqual(
    fechasProgramado(prog({ frecuencia: "Trimestral", desde: 7, dia: 3 }), 2026, "2026-10-01", "2027-02-01"),
    ["2026-10-03", "2027-01-03"],
  );
  // Mensual de enero a junio el día 31: en febrero cae el 28 y no sigue después de junio.
  const m = fechasProgramado(prog({ desde: 1, hasta: 6, dia: 31 }), 2026, "2026-01-01", "2027-12-31");
  assert.equal(m.length, 6);
  assert.equal(m[1], "2026-02-28");
  assert.equal(m[5], "2026-06-30");
  // Único: solo su mes; «Hecho» o sin importe no cuentan; sin «Día», el día 1.
  assert.deepEqual(fechasProgramado(prog({ frecuencia: "Único", desde: 3, dia: null }), 2026, "2026-01-01", "2027-12-31"), [
    "2026-03-01",
  ]);
  assert.deepEqual(fechasProgramado(prog({ estado: "Hecho" }), 2026, "2026-01-01", "2026-12-31"), []);
  assert.deepEqual(fechasProgramado(prog({ importe: null }), 2026, "2026-01-01", "2026-12-31"), []);
});

test("normaliza descripciones: sin mes ni número de cuota, conserva referencias largas", () => {
  assert.equal(normalizar("Mutua Enero"), normalizar("Mutua Febrero"));
  assert.equal(normalizar("Cuota 03/24 IKEA"), normalizar("Cuota 04/24 IKEA"));
  assert.notEqual(normalizar("Prestamo 0049 5086 103"), normalizar("Prestamo 0049 5086 143"));
  assert.equal(nombreVisible("Mutua Septiembre"), "Mutua");
  assert.equal(nombreVisible("Cuota 03/24 IKEA"), "Cuota IKEA");
});

test("detecta cargos repetidos: mensual estable, recibo partido el mismo día; descarta los que no lo son", () => {
  const r = detectarRepetidos(datos.movimientos, datos.programados, datos.fechaCorte);
  const por = (d: string) => r.find((c) => c.descripcion === d);
  const mutua = por("Mutua");
  assert.ok(mutua);
  assert.equal(mutua.periodo, "mensual");
  assert.equal(mutua.veces, 3);
  assert.equal(mutua.miParte, 49.56);
  assert.equal(mutua.proximo, "2026-03-28"); // siguiente tras la fecha de corte (12 mar)
  // Teleco: 5 + 26 el 10 de febrero cuentan como un recibo de 31.
  assert.equal(por("Recibo Teleco")?.importeMedio, 30.67);
  assert.equal(por("Bar"), undefined); // semanal
  assert.equal(por("Luz"), undefined); // importe variable (más del 15 %)
  assert.equal(por("Recibo comunidad")?.enPrevision, true); // ya en Previsión: no se cuenta dos veces
});

test("próximos 30 días: Previsión + detectados, solo tu parte y aviso a 7 días", () => {
  const r = calcularVencimientos(datos, "2026-03-25");
  assert.equal(r.hasta, "2026-04-24");
  const lista = r.proximos.map((v) => `${v.fecha} ${v.concepto} ${v.miParte} ${v.origen}${v.pronto ? " !" : ""}`);
  assert.deepEqual(lista, [
    "2026-03-28 Mutua 49.56 detectado !",
    "2026-03-31 Gimnasio programado 40 prevision !",
    "2026-04-03 Cuota comunidad 132.11 prevision",
    "2026-04-10 Seguro hogar 120 prevision",
    "2026-04-10 Recibo Teleco 15.5 detectado",
    "2026-04-10 Streaming 0 detectado",
  ].filter((x) => !x.includes("Streaming"))); // Streaming es de otra persona (tu parte 0): no aparece
  assert.equal(r.sinColumnaDia, false);
});
