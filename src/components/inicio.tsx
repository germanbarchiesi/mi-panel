import type { ResultadoAgenda } from "@/lib/agenda-loader";
import type { ResultadoAgentes } from "@/lib/agentes-loader";
import type { ResultadoDeporte } from "@/lib/deporte-loader";
import type { Seleccion } from "@/lib/mis-tareas";
import { Cabecera } from "@/components/cabecera";
import { Hoy, ProximosDias } from "@/components/agenda";
import { Actividades, type DatosActividades } from "@/components/actividades";
import { Deporte } from "@/components/deporte";
import { FinanzasYVencimientos, type EstadoFinanzas } from "@/components/finanzas";
import { ResumenAgentes, novedadesAgentes } from "@/components/agentes";
import { BotonEscuchar } from "@/components/resumen";
import { Refrescar } from "@/components/reloj";
import { TzSync } from "@/components/tz-sync";

export type DatosInicio = {
  tz: string;
  hoy: string; // YYYY-MM-DD en la zona del panel
  ahora: number;
  horaLocal: boolean;
  agenda: ResultadoAgenda | null;
  actividades: { datos: DatosActividades; sel: Seleccion; urlApp: string | null; modoTrabajo: boolean } | null;
  deporte: ResultadoDeporte | null;
  finanzas: EstadoFinanzas | null;
  agentes: ResultadoAgentes | null;
  resumen7: { texto: string } | null;
};

function ResumenHoy({ texto }: { texto: string }) {
  return (
    <section className="modulo" aria-labelledby="resumen-titulo">
      <div className="modulo-cabecera">
        <h2 id="resumen-titulo">Resumen de hoy</h2>
        <BotonEscuchar texto={texto} />
      </div>
      <details className="desplegable">
        <summary>Leer el texto</summary>
        <p className="resumen-texto">{texto}</p>
      </details>
    </section>
  );
}

/** Página de inicio. Solo pinta: los datos llegan ya cargados (página real o demostración). */
export function Inicio(d: DatosInicio) {
  const ok = d.agenda?.estado === "ok" ? d.agenda : null;
  return (
    <main className="pagina">
      {d.horaLocal && <TzSync />}
      <Refrescar cargado={d.ahora} tz={d.tz} />
      <Cabecera actual="inicio" novedades={d.agentes ? novedadesAgentes(d.agentes).length : 0} />
      <div className="inicio">
        <div className="area-hoy">
          <Hoy fecha={d.hoy} tz={d.tz} ahora={d.ahora} agenda={d.agenda} />
        </div>
        <div className="area-modulos">
          <div className="columna">
            {d.resumen7 && <ResumenHoy texto={d.resumen7.texto} />}
            {d.agentes && <ResumenAgentes r={d.agentes} />}
            {d.actividades && (
              <Actividades
                datos={d.actividades.datos}
                sel={d.actividades.sel}
                urlApp={d.actividades.urlApp}
                tz={d.tz}
                modoTrabajo={d.actividades.modoTrabajo}
              />
            )}
            {d.deporte && <Deporte r={d.deporte} />}
          </div>
          {d.finanzas && (
            <div className="columna">
              <FinanzasYVencimientos e={d.finanzas} />
            </div>
          )}
        </div>
        {ok && ok.dias.length > 1 && (
          <div className="area-proximos">
            <ProximosDias dias={ok.dias.slice(1)} tz={d.tz} ahora={d.ahora} />
          </div>
        )}
      </div>
    </main>
  );
}
