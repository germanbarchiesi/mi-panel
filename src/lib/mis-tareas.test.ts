import test from "node:test";
import assert from "node:assert/strict";
import {
  RespuestaInvalida,
  ambitoApi,
  marcos,
  ocupadoAEventos,
  parsearOcupado,
  parsearResumen,
  seleccionInicial,
  temasOrdenados,
  textoArrastre,
  textoResumen,
} from "./mis-tareas.ts";
import { AJUSTES_POR_DEFECTO, construirDia, zonedToUtc, type Evento } from "./agenda.ts";

const TZ = "Europe/Madrid";

// Respuestas de ejemplo de la sección «Integración con Mi Panel» del plan técnico de Mis tareas (API v1).
const RESUMEN_EJEMPLO = {
  version: 1,
  fecha: "2026-10-27",
  zona_horaria: "Europe/Madrid",
  pendientes_hoy: [
    {
      id: "8f1c2a4e-3b7d-4c1a-9e52-6d0f3a7b1c88",
      titulo: "Llamar al fontanero",
      hora: "10:30",
      duracion_min: 15,
      prioridad: "alta",
      ambito: "personal",
      proyectos: [{ nombre: "Casa", color: "#F97316" }],
      etiquetas: [{ nombre: "Recados", color: "#6366F1" }],
      personas: [],
    },
  ],
  arrastradas: [
    {
      id: "2b9e7140-5c1f-4d8a-b3e6-91a0c4d2f5e7",
      titulo: "Enviar el presupuesto revisado",
      dias_arrastrada: 2,
      prioridad: "media",
      ambito: "trabajo",
    },
  ],
  temas_por_persona: [
    {
      persona: "Anna",
      reunion_hoy: true,
      temas: ["Vacaciones de diciembre", "Revisión de horas del mes"],
    },
  ],
};

const OCUPADO_EJEMPLO = {
  version: 1,
  desde: "2026-10-27",
  dias: 7,
  zona_horaria: "Europe/Madrid",
  ocupado: [
    {
      id: "8f1c2a4e-3b7d-4c1a-9e52-6d0f3a7b1c88",
      fecha: "2026-10-27",
      hora: "10:30",
      duracion_min: 15,
      titulo: "Llamar al fontanero",
      ambito: "personal",
    },
  ],
};

test("parsea la respuesta de ejemplo de /resumen del plan", () => {
  const r = parsearResumen(RESUMEN_EJEMPLO);
  assert.equal(r.fecha, "2026-10-27");
  assert.equal(r.hoy.length, 1);
  assert.deepEqual(r.hoy[0], {
    id: "8f1c2a4e-3b7d-4c1a-9e52-6d0f3a7b1c88",
    titulo: "Llamar al fontanero",
    hora: "10:30",
    duracionMin: 15,
    prioridad: "alta",
    ambito: "personal",
    proyectos: [{ nombre: "Casa", color: "#F97316" }],
    etiquetas: [{ nombre: "Recados", color: "#6366F1" }],
    personas: [],
  });
  assert.deepEqual(r.arrastradas[0], {
    id: "2b9e7140-5c1f-4d8a-b3e6-91a0c4d2f5e7",
    titulo: "Enviar el presupuesto revisado",
    dias: 2,
    prioridad: "media",
    ambito: "trabajo",
  });
  assert.deepEqual(r.temas, [
    { persona: "Anna", reunionHoy: true, temas: ["Vacaciones de diciembre", "Revisión de horas del mes"] },
  ]);
});

test("separa el ejemplo en los marcos Trabajo y Personal", () => {
  const r = parsearResumen(RESUMEN_EJEMPLO);
  const [trabajo, personal] = marcos(r, "todo");
  assert.equal(trabajo.ambito, "trabajo");
  assert.equal(trabajo.hoy.length, 0);
  assert.equal(trabajo.arrastradas[0].titulo, "Enviar el presupuesto revisado");
  assert.equal(personal.hoy[0].titulo, "Llamar al fontanero");
  assert.equal(personal.arrastradas.length, 0);
  assert.equal(marcos(r, "trabajo").length, 1);
  assert.equal(textoArrastre(2), "↻ 2 días");
  assert.equal(textoArrastre(1), "↻ 1 día");
});

test("valores vacíos: sin hora, sin duración y sin prioridad", () => {
  const r = parsearResumen({
    ...RESUMEN_EJEMPLO,
    pendientes_hoy: [{ id: "a", titulo: "Sin hora", hora: null, duracion_min: null, prioridad: null, ambito: "trabajo" }],
  });
  assert.equal(r.hoy[0].hora, null);
  assert.equal(r.hoy[0].duracionMin, null);
  assert.equal(r.hoy[0].prioridad, null);
  assert.deepEqual(r.hoy[0].personas, []);
});

test("rechaza versiones y formatos desconocidos; descarta colores no válidos", () => {
  assert.throws(() => parsearResumen({ ...RESUMEN_EJEMPLO, version: 2 }), RespuestaInvalida);
  assert.throws(() => parsearResumen({ ...RESUMEN_EJEMPLO, fecha: "27/10/2026" }), RespuestaInvalida);
  assert.throws(() => parsearResumen([]), RespuestaInvalida);
  assert.throws(
    () => parsearResumen({ ...RESUMEN_EJEMPLO, pendientes_hoy: [{ id: "a", titulo: "x", ambito: "otro" }] }),
    RespuestaInvalida,
  );
  const r = parsearResumen({
    ...RESUMEN_EJEMPLO,
    pendientes_hoy: [
      { ...RESUMEN_EJEMPLO.pendientes_hoy[0], proyectos: [{ nombre: "X", color: "red;background:url(x)" }] },
    ],
  });
  assert.equal(r.hoy[0].proyectos[0].color, null);
});

test("temas por persona: primero con quien te ves hoy", () => {
  const r = parsearResumen({
    ...RESUMEN_EJEMPLO,
    temas_por_persona: [
      { persona: "Luis", reunion_hoy: false, temas: ["Factura"] },
      { persona: "Anna", reunion_hoy: true, temas: ["Vacaciones"] },
      { persona: "Sin temas", reunion_hoy: true, temas: [] },
    ],
  });
  assert.deepEqual(
    temasOrdenados(r).map((t) => t.persona),
    ["Anna", "Luis"],
  );
});

test("selector: Trabajo en el PC de Appliant, Todo en el resto; «Todo» no envía ámbito", () => {
  assert.equal(seleccionInicial(undefined, true), "trabajo");
  assert.equal(seleccionInicial(undefined, false), "todo");
  assert.equal(seleccionInicial("personal", true), "personal");
  assert.equal(seleccionInicial("<script>", false), "todo");
  assert.equal(ambitoApi("todo"), undefined);
  assert.equal(ambitoApi("trabajo"), "trabajo");
});

test("/ocupado del ejemplo ocupa la Agenda: quita hueco y marca solape", () => {
  const o = parsearOcupado(OCUPADO_EJEMPLO);
  const tareas = ocupadoAEventos(o, TZ);
  assert.equal(tareas.length, 1);
  assert.equal(tareas[0].inicio, zonedToUtc("2026-10-27", "10:30", TZ));
  assert.equal(tareas[0].fin, zonedToUtc("2026-10-27", "10:45", TZ));
  assert.equal(tareas[0].tarea, true);

  const ajustes = { ...AJUSTES_POR_DEFECTO, lv: { ini: "10:00", fin: "12:00" }, minHueco: 30 };
  const reunion: Evento = {
    clave: "r",
    titulo: "Reunión",
    calendario: "Mi calendario",
    todoElDia: false,
    libre: false,
    inicio: zonedToUtc("2026-10-27", "10:40", TZ),
    fin: zonedToUtc("2026-10-27", "11:00", TZ),
  };
  const antes = zonedToUtc("2026-10-26", "12:00", TZ);
  const dia = construirDia("2026-10-27", [...tareas, reunion], ajustes, TZ, antes);
  // Ventana 10:00–12:00: ocupado 10:30–11:00 → huecos 10:00–10:30 y 11:00–12:00.
  assert.deepEqual(
    dia.huecos.map((h) => [h.ini, h.fin]),
    [
      [zonedToUtc("2026-10-27", "10:00", TZ), zonedToUtc("2026-10-27", "10:30", TZ)],
      [zonedToUtc("2026-10-27", "11:00", TZ), zonedToUtc("2026-10-27", "12:00", TZ)],
    ],
  );
  assert.equal(dia.solapes.length, 1);
});

test("/ocupado: sin duración usa 30 min e ignora tareas sin hora", () => {
  const o = parsearOcupado({
    ...OCUPADO_EJEMPLO,
    ocupado: [
      { id: "a", fecha: "2026-10-27", hora: "09:00", duracion_min: null, titulo: "A", ambito: "trabajo" },
      { id: "b", fecha: "2026-10-27", hora: null, duracion_min: null, titulo: "B", ambito: "trabajo" },
    ],
  });
  const [a] = ocupadoAEventos(o, TZ);
  assert.equal(o.ocupado.length, 1);
  assert.equal(((a.fin as number) - (a.inicio as number)) / 60000, 30);
});

test("texto del resumen de las 7:00 con el ejemplo", () => {
  const r = parsearResumen(RESUMEN_EJEMPLO);
  assert.equal(
    textoResumen(r),
    "Hoy tienes 1 tarea. La primera con hora, a las 10:30: Llamar al fontanero. 1 viene arrastrada de días anteriores. Prioridad alta: Llamar al fontanero. Hoy te ves con Anna.",
  );
  assert.equal(
    textoResumen({ ...r, hoy: [], arrastradas: [] }),
    "Tareas: nada pendiente para hoy.",
  );
});
