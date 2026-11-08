// Demostración de /ajustes (solo con `next dev`). Las acciones no hacen nada.
import { AJUSTES_POR_DEFECTO } from "@/lib/agenda";
import { AjustesVista } from "@/components/ajustes-vista";

async function nada() {
  "use server";
}

async function nadaId(id: string) {
  "use server";
  void id;
}

function ahoraMs() {
  return Date.now();
}

export default async function DemoAjustes({ searchParams }: { searchParams: Promise<{ aviso?: string; sin?: string }> }) {
  const sp = await searchParams;
  const ahora = ahoraMs();
  const sin = sp.sin === "1";
  return (
    <AjustesVista
      d={{
        aviso: sp.aviso === "error" ? { tipo: "error", texto: "No se pudo guardar. Inténtalo de nuevo." } : sp.aviso ? { tipo: "ok", texto: "Ajustes de la agenda guardados." } : null,
        tz: "Europe/Madrid",
        ajustes: AJUSTES_POR_DEFECTO,
        equipoTrabajo: false,
        google: { conectado: !sin, conDrive: !sin, aviso: sin ? "Google cerró el permiso. Reconecta." : null },
        calendarios: [
          { id: "1", nombre: "german.barchiesi@gmail.com", color: "#039be5", activo: true, otraVia: false },
          { id: "2", nombre: "Familia", color: "#e67c73", activo: true, otraVia: false },
          { id: "3", nombre: "Germán y Laura", color: "#33b679", activo: true, otraVia: false },
          { id: "4", nombre: "Deporte", color: "#f4511e", activo: false, otraVia: true },
          { id: "5", nombre: "Festivos en España", color: "#0b8043", activo: false, otraVia: false },
        ],
        excel: sin ? null : { nombre: "Cuentas_2026.xlsm" },
        pickerConfigurado: true,
        huella: {
          faltaMigracion: false,
          dispositivos: sin ? [] : [
            { id: "a", nombre: "Galaxy S25", usado: new Date(ahora - 86400e3).toISOString() },
            { id: "b", nombre: "PC de casa", usado: null },
          ],
          puedeRegistrar: sin,
          minutos: 10,
        },
        strava: { configurado: true, estado: sin ? "sin_conectar" : "conectado" },
        resumen: {
          conClave: true,
          tick: sin ? null : ahora - 9 * 60_000,
          tickReciente: !sin,
          cronSecret: true,
          github: !sin,
          feedUrl: sin ? null : "https://mi-panel-five-olive.vercel.app/api/feed/Zm9vYmFyYmF6cXV4cXV1eHF1dXpxdXV4cXV1eHF1dXo",
        },
        agentes: { carpeta: "Mi Panel · Agentes", creados: sin ? null : 4, total: 4 },
        misTareas: { ok: !sin, mensaje: "Mis tareas no responde ahora mismo.", ultimoOk: ahora - 3600e3, url: "https://mis-tareas.example.com" },
      }}
      a={{
        guardar: nada,
        guardarEquipo: nada,
        elegirExcel: nadaId,
        crearAgentes: nada,
        prepararResumen: nada,
        nuevoFeed: nada,
        botonEmergencia: nada,
        borrarHuella: nada,
      }}
    />
  );
}
