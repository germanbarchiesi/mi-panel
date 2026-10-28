import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerLibro } from "./xlsx.ts";
import { LECTURA, calcularMes, cerrado, datosDelLibro, mesActualDelLibro, resumir, ritmo } from "./finanzas.ts";

// Libro sintético con la estructura de la V6 (tblMovimientos, tblCuentas, Categorías, cfgAnio).
// La comprobación contra el Excel real (10 meses, al céntimo) se hizo aparte: los datos reales no van al repo.
const datos = datosDelLibro(leerLibro(readFileSync(new URL("./fixtures/cuentas-prueba.xlsx", import.meta.url)), LECTURA));

test("lee el libro: año, movimientos por columna «Mes», categorías y fecha de corte más antigua", () => {
  assert.equal(datos.anio, 2026);
  assert.equal(datos.movimientos.length, 13);
  assert.equal(datos.fechaCorte, "2026-03-12");
  assert.ok(datos.categorias.includes("Supermercado"));
  // La nómina del 31 de enero cuenta en febrero (columna Mes), no en enero.
  assert.equal(calcularMes(datos.movimientos, 2).ingresado, 2000);
});

test("gastado: Gasto − Ajuste, sin Sueldo, Alquiler Habitación, sin clasificar ni traspasos; medios céntimos", () => {
  const ene = calcularMes(datos.movimientos, 1);
  assert.equal(ene.ingresado, 2000);
  assert.equal(ene.gastado, 160.19); // 50,095 + 50,095 + 80 − 20
  assert.equal(ene.ahorro, 1839.81);
  assert.ok(Math.abs((ene.tasa ?? 0) - 0.919905) < 1e-9);
  assert.deepEqual(ene.porCategoria, [
    { categoria: "Supermercado", gastado: 100.19 },
    { categoria: "Salidas/Restaurante", gastado: 60 },
  ]);
  assert.deepEqual(ene.pendientes, { n: 0, importe: 0 }); // el traspaso no es pendiente

  const feb = calcularMes(datos.movimientos, 2);
  assert.equal(feb.gastado, 300); // Alquiler Habitación y sin clasificar no cuentan
  assert.deepEqual(feb.pendientes, { n: 1, importe: 42 }); // importe total, como el Excel
});

test("ingresos sin clasificar no cuentan como ingresado pero sí como pendientes", () => {
  const mar = calcularMes(datos.movimientos, 3);
  assert.equal(mar.ingresado, 0);
  assert.equal(mar.tasa, null);
  assert.deepEqual(mar.pendientes, { n: 1, importe: 15 });
});

test("mes cerrado: pasado, con gastos y sin pendientes", () => {
  const actual = mesActualDelLibro(2026, "2026-03-15");
  assert.equal(actual, 3);
  assert.equal(cerrado(calcularMes(datos.movimientos, 1), actual), true);
  assert.equal(cerrado(calcularMes(datos.movimientos, 2), actual), false); // tiene pendientes
  assert.equal(cerrado(calcularMes(datos.movimientos, 3), actual), false); // en curso
  assert.equal(mesActualDelLibro(2026, "2027-01-02"), 13);
  assert.equal(mesActualDelLibro(2026, "2025-12-31"), 0);
});

test("resumen: mes de la fecha de corte, media de cerrados, ritmo y cierre estimado", () => {
  const r = resumir(datos, "2026-03-15");
  assert.equal(r.mes, 3);
  assert.equal(r.diaCorte, 12);
  assert.equal(r.diasMes, 31);
  assert.equal(r.mesesCerrados, 1);
  assert.equal(r.mediaCerrados, 160.19);
  assert.equal(r.actual.gastado, 190);
  assert.equal(r.anterior?.gastado, 300);
  assert.equal(r.ritmo?.estado, "riesgo");
  assert.equal(r.ritmo?.desvio, 79.9); // 190 / 160,19 − 12 / 31
  assert.equal(r.ritmo?.cierreEstimado, 490.83);
  assert.deepEqual(r.top5.map((c) => c.categoria), ["Supermercado", "Deporte/Panteres"]);
  assert.deepEqual(
    r.pendientesAnio.map((p) => p.mes),
    [2, 3],
  );
});

test("umbrales del ritmo: +10 atención, más de +20 riesgo", () => {
  assert.equal(ritmo(500, 1000, 15, 30)?.estado, "bien"); // 0 puntos
  assert.equal(ritmo(600, 1000, 15, 30)?.estado, "atencion"); // +10
  assert.equal(ritmo(700, 1000, 15, 30)?.estado, "atencion"); // +20
  assert.equal(ritmo(710, 1000, 15, 30)?.estado, "riesgo"); // +21
  assert.equal(ritmo(100, 0, 15, 30), null);
  assert.equal(ritmo(100, 1000, 0, 30), null);
});
