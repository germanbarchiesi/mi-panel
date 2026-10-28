import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { LibroInvalido, leerLibro, refCelda, serialAFecha } from "./xlsx.ts";

const libro = readFileSync(new URL("./fixtures/libro-prueba.xlsx", import.meta.url));

test("refCelda y serialAFecha", () => {
  assert.deepEqual(refCelda("A1"), { col: 0, fila: 0 });
  assert.deepEqual(refCelda("$AB$12"), { col: 27, fila: 11 });
  assert.equal(serialAFecha(46298), "2026-10-03");
});

test("lee una tabla con nombre, sin filas vacías", () => {
  const l = leerLibro(libro, { tablas: ["tblPrueba"], nombres: ["cfgAnio"] });
  const t = l.tablas.get("tblPrueba")!;
  assert.deepEqual(t.columnas, ["Fecha", "Descripción", "Importe", "Ok"]);
  assert.equal(t.filas.length, 2);
  assert.equal(serialAFecha(t.filas[0][0] as number), "2026-10-03");
  assert.equal(t.filas[0][1], "Café & <pan>");
  assert.equal(t.filas[0][2], -2.5);
  assert.equal(t.filas[0][3], true);
  assert.equal(t.filas[1][2], 1500);
  assert.equal(l.nombres.get("cfgAnio"), 2026);
});

test("errores: tabla o nombre que no existen, y fichero que no es Excel", () => {
  assert.throws(() => leerLibro(libro, { tablas: ["tblNoExiste"] }), LibroInvalido);
  assert.throws(() => leerLibro(libro, { nombres: ["invValor"] }), LibroInvalido);
  assert.throws(() => leerLibro(new Uint8Array([1, 2, 3]), { tablas: ["x"] }), LibroInvalido);
  assert.throws(() => leerLibro(zipSync({ "hola.txt": strToU8("hola") }), {}), LibroInvalido);
});
