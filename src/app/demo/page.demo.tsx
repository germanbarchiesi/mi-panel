// Demostración del inicio con datos inventados. SOLO existe con `next dev` (pageExtensions en
// next.config.ts): en producción este fichero no se compila. Sirve para revisar el diseño sin Google,
// Supabase ni Mis tareas. Variantes por query: ?hora=10:40 ?finanzas=bloqueado|sinhuella|ocultos|trabajo
// ?agenda=sin_conectar|reconectar|error ?tareas=fallo ?ambito=trabajo|personal|todo

import { readFileSync } from "node:fs";
import path from "node:path";
import { AJUSTES_POR_DEFECTO, addDays, construirDia, weekday, ymdInTz, zonedToUtc, type Evento } from "@/lib/agenda";
import type { ResultadoAgenda } from "@/lib/agenda-loader";
import { leerLibro } from "@/lib/xlsx";
import { LECTURA, datosDelLibro, resumir } from "@/lib/finanzas";
import { calcularVencimientos } from "@/lib/vencimientos";
import { LECTURA_INVERSIONES, datosInversiones, valorar, type PuntoEvolucion } from "@/lib/inversiones";
import { construirSemana, lunesDe, type Hecho, type Planificado } from "@/lib/deporte";
import { parsearResumen, seleccionInicial } from "@/lib/mis-tareas";
import { AGENTES, type Tarjeta } from "@/lib/agentes";
import type { ResultadoAgentes } from "@/lib/agentes-loader";
import type { EstadoFinanzas } from "@/components/finanzas";
import { Inicio } from "@/components/inicio";

const TZ = "Europe/Madrid";

function fixture(nombre: string) {
  return new Uint8Array(readFileSync(path.join(process.cwd(), "src/lib/fixtures", nombre)));
}

function ev(clave: string, titulo: string, fecha: string, ini: string, fin: string, color?: string, extra: Partial<Evento> = {}): Evento {
  return {
    clave,
    titulo,
    calendario: "Personal",
    color,
    todoElDia: false,
    libre: false,
    inicio: zonedToUtc(fecha, ini, TZ),
    fin: zonedToUtc(fecha, fin, TZ),
    ...extra,
  };
}

function eventos(hoy: string): Evento[] {
  const d = (n: number) => addDays(hoy, n);
  return [
    { clave: "cumple", titulo: "Cumpleaños de Mati", calendario: "Familia", color: "#e67c73", todoElDia: true, libre: false, diaIni: hoy, diaFin: d(1) },
    ev("seguro", "Renovar el seguro del coche", d(-1), "22:00", "23:00", "#f6bf26", { fin: zonedToUtc(d(4), "10:00", TZ) }),
    ev("daily", "Daily de producto", hoy, "09:30", "09:45", "#039be5"),
    ev("presu", "Revisión del presupuesto con Anna", hoy, "10:30", "11:30", "#7986cb", { lugar: "Sala Gaudí" }),
    ev("banco", "Llamada del banco", hoy, "11:00", "11:20", "#e67c73"),
    ev("comida", "Comida con Laura", hoy, "14:00", "15:15", "#33b679", { lugar: "Can Vilaró" }),
    ev("fontanero", "Llamar al fontanero", hoy, "17:30", "17:45", undefined, { tarea: true, calendario: "Mis tareas" }),
    ev("foco", "Bloque de foco", hoy, "18:30", "19:30", "#8e24aa", { libre: true }),
    ev("natacion", "Natación", hoy, "20:30", "21:30", "#f4511e"),
    ev("dentista", "Dentista", d(1), "18:00", "18:45", "#33b679", { lugar: "Clínica Diagonal" }),
    ev("crossfit", "CrossFit", d(1), "20:00", "21:00", "#f4511e"),
    ev("planning", "Planning trimestral", d(2), "09:00", "13:00", "#039be5"),
    ev("cena", "Cena con los del máster", d(2), "21:00", "23:30", "#33b679"),
    ev("natacion2", "Natación", d(3), "20:30", "21:30", "#f4511e"),
    ev("cine", "Cine", d(4), "19:00", "21:30", "#7986cb"),
    ev("mercado", "Mercado de Sant Antoni", d(5), "10:00", "11:30", "#33b679"),
    ev("vermut", "Vermut en la terraza", d(5), "12:30", "14:30", "#f6bf26"),
    ev("vermut2", "Llamada familia", d(5), "13:30", "14:00", "#e67c73"),
  ];
}

function agendaDemo(hoy: string, ahora: number, variante?: string): ResultadoAgenda {
  if (variante === "sin_conectar" || variante === "reconectar") return { estado: variante };
  if (variante === "error") return { estado: "error", mensaje: "Google no responde" };
  const lista = eventos(hoy);
  const dias = Array.from({ length: 8 }, (_, i) => construirDia(addDays(hoy, i), lista, AJUSTES_POR_DEFECTO, TZ, ahora));
  return { estado: "ok", tz: TZ, dias, calendarios: ["Personal", "Familia", "Germán y Laura"], fallidos: [], tareas: "ok" };
}

function deporteDemo(hoy: string, variante?: string) {
  const lunes = lunesDe(hoy);
  const d = (n: number) => addDays(lunes, n);
  const planificados: Planificado[] = [
    { fecha: d(0), hora: "20:30", titulo: "Natación" },
    { fecha: d(1), hora: "20:00", titulo: "CrossFit" },
    { fecha: d(2), hora: "20:30", titulo: "Natación" },
    { fecha: d(3), hora: "20:00", titulo: "CrossFit" },
    { fecha: d(5), hora: "10:00", titulo: "Natación" },
  ];
  const hechos: Hecho[] = [
    { id: "1", fecha: d(0), hora: "20:41", nombre: "Natación de tarde", sportType: "Swim", minutos: 48, metros: 1850 },
    { id: "2", fecha: d(1), hora: "20:05", nombre: "WOD", sportType: "WeightTraining", minutos: 62, metros: 0 },
    { id: "3", fecha: d(4), hora: "19:10", nombre: "Fuerza", sportType: "WeightTraining", minutos: 45, metros: 0, manual: true },
  ].filter((h) => h.fecha <= hoy);
  return {
    semana: construirSemana(planificados, hechos, hoy),
    strava: "ok" as const,
    calendario: "ok" as const,
    escribir: variante !== "sinpermiso",
  };
}

function tareasDemo(hoy: string) {
  return parsearResumen({
    version: 1,
    fecha: hoy,
    zona_horaria: TZ,
    pendientes_hoy: [
      {
        id: "a",
        titulo: "Llamar al fontanero",
        hora: "17:30",
        duracion_min: 15,
        prioridad: "alta",
        ambito: "personal",
        proyectos: [{ nombre: "Casa", color: "#F97316" }],
        etiquetas: [],
        personas: [],
      },
      { id: "b", titulo: "Pagar la matrícula de natación", hora: null, duracion_min: null, prioridad: "media", ambito: "personal" },
      {
        id: "c",
        titulo: "Preparar la demo del lunes",
        hora: "12:00",
        duracion_min: 60,
        prioridad: "alta",
        ambito: "trabajo",
        proyectos: [{ nombre: "Appliant", color: "#2563EB" }],
        personas: ["Anna"],
      },
      { id: "d", titulo: "Revisar las horas de octubre", hora: null, duracion_min: null, prioridad: null, ambito: "trabajo" },
    ],
    arrastradas: [
      { id: "e", titulo: "Enviar el presupuesto revisado", dias_arrastrada: 2, prioridad: "media", ambito: "trabajo" },
      { id: "f", titulo: "Pedir cita para la ITV", dias_arrastrada: 5, prioridad: "baja", ambito: "personal" },
    ],
    temas_por_persona: [
      { persona: "Anna", reunion_hoy: true, temas: ["Vacaciones de diciembre", "Revisión de horas del mes"] },
      { persona: "Luis", reunion_hoy: false, temas: ["Factura de octubre"] },
    ],
  });
}

function agentesDemo(ahora: number): ResultadoAgentes {
  const resultados: Record<string, Tarjeta["resultado"]> = {
    vuelos: {
      ejecutado: ahora - 26 * 3600e3,
      estado: "novedad",
      titular: "BCN–BKK ida y vuelta en noviembre de 2027 desde 612 € con una escala",
      puntos: ["Qatar Airways vía Doha, 18 h 40 min", "Bajó 48 € desde la semana pasada"],
      enlace: "https://www.example.com/vuelos",
    },
    yipeng: {
      ejecutado: ahora - 7 * 86400e3,
      estado: "sin_novedades",
      titular: "Aún no hay fechas oficiales del Yi Peng 2027",
      puntos: [],
      enlace: null,
    },
    regalo: null,
  };
  const tarjetas: Tarjeta[] = AGENTES.filter((a) => !a.privado).map((a) => ({
    ...a,
    resultado: resultados[a.clave] ?? null,
    proxima: ahora + 3 * 86400e3,
    ficheroCreado: true,
  }));
  return { estado: "ok", tarjetas };
}

function finanzasDemo(variante: string | undefined): EstadoFinanzas {
  if (variante === "trabajo") return { tipo: "modo_trabajo" };
  if (variante === "bloqueado") return { tipo: "bloqueado", hayHuella: true, faltaMigracion: false };
  if (variante === "sinhuella") return { tipo: "bloqueado", hayHuella: false, faltaMigracion: false };
  const datos = datosDelLibro(leerLibro(fixture("cuentas-prueba.xlsx"), LECTURA));
  const venc = datosDelLibro(leerLibro(fixture("vencimientos-prueba.xlsx"), LECTURA));
  const inv = datosInversiones(leerLibro(fixture("inversiones-prueba.xlsx"), LECTURA_INVERSIONES));
  // Doce meses de fotos inventadas (abril 2025 a marzo 2026), sin las del Excel de prueba.
  const fotos: PuntoEvolucion[] = Array.from({ length: 12 }, (_, i) => {
    const fecha = new Date(Date.UTC(2025, 3 + i, 28)).toISOString().slice(0, 10);
    const aportado = 1200 + i * 70;
    const valor = Math.round(aportado * (1 + 0.004 * i + [0, 0.01, -0.015, 0.02, 0.005, -0.03, 0.01, 0.025, 0.015, -0.01, 0.03, 0.04][i]));
    return { fecha, aportado, valor };
  });
  return {
    tipo: "abierto",
    hasta: ahoraMs() + 5 * 60_000,
    restante: 5 * 60_000,
    ocultos: variante === "ocultos",
    r: {
      estado: "ok",
      resumen: resumir(datos, "2026-03-15"),
      vencimientos: calcularVencimientos(venc, "2026-03-25"),
      inversiones: valorar({ ...inv, evolucion: [] }, new Map(), "2026-03-25", fotos),
      fichero: { nombre: "Cuentas_2026.xlsm", modificado: "2026-11-07T21:14:00Z" },
    },
  };
}

function ahoraMs() {
  return Date.now();
}

export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ hora?: string; finanzas?: string; agenda?: string; tareas?: string; ambito?: string; deporte?: string }>;
}) {
  const sp = await searchParams;
  const real = ahoraMs();
  const hoy = ymdInTz(real, TZ);
  const hora = /^\d{2}:\d{2}$/.test(sp.hora ?? "") ? (sp.hora as string) : weekday(hoy) === 0 || weekday(hoy) === 6 ? "11:40" : "16:40";
  const ahora = zonedToUtc(hoy, hora, TZ);
  const trabajo = sp.finanzas === "trabajo";
  const sel = seleccionInicial(sp.ambito, trabajo);

  return (
    <Inicio
      tz={TZ}
      hoy={hoy}
      ahora={ahora}
      horaLocal={false}
      agenda={agendaDemo(hoy, ahora, sp.agenda)}
      actividades={{
        datos:
          sp.tareas === "fallo"
            ? { ok: false, fallo: "caido", ultimoOk: ahora - 3 * 3600e3 }
            : { ok: true, resumen: tareasDemo(hoy) },
        sel,
        urlApp: "https://mis-tareas.example.com",
        modoTrabajo: trabajo,
      }}
      deporte={deporteDemo(hoy, sp.deporte)}
      finanzas={finanzasDemo(sp.finanzas)}
      agentes={agentesDemo(ahora)}
      resumen7={
        trabajo
          ? null
          : {
              texto:
                "Buenos días. Hoy es lunes 9 de noviembre. En la agenda, 5 eventos: Daily de producto a las 9 y media, Revisión del presupuesto con Anna a las 10 y media y 3 más. Tu primer hueco libre es de las 5 a las 5 y media. Tareas para hoy: 2 de trabajo y 2 personales. Que tengas buen día.",
            }
      }
    />
  );
}
