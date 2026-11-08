import type { Estado, Tarjeta } from "@/lib/agentes";
import type { ResultadoAgentes } from "@/lib/agentes-loader";
import { Icono } from "@/components/iconos";
import { Cabecera } from "@/components/cabecera";
import { TzSync } from "@/components/tz-sync";

const ESTADO: Record<Estado, { texto: string; clase: string }> = {
  alerta: { texto: "Alerta", clase: "etiqueta-riesgo" },
  novedad: { texto: "Novedad", clase: "etiqueta-atencion" },
  error: { texto: "Error", clase: "etiqueta-riesgo" },
  sin_novedades: { texto: "Sin novedades", clase: "etiqueta-ok" },
};

export function hace(ms: number, ahora: number): string {
  const min = Math.round((ahora - ms) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

function cuando(ms: number | null, tz: string): string {
  if (ms === null) return "sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(ms))
    .replace(/\./g, "");
}

/** Agentes con algo que contar (alerta o novedad). */
export function novedadesAgentes(r: ResultadoAgentes): Tarjeta[] {
  if (r.estado !== "ok") return [];
  return r.tarjetas.filter((t) => t.resultado && (t.resultado.estado === "alerta" || t.resultado.estado === "novedad"));
}

function TarjetaAgente({ t, ahora, tz }: { t: Tarjeta; ahora: number; tz: string }) {
  const r = t.resultado;
  const clase = r?.estado === "alerta" ? " alerta" : r?.estado === "novedad" ? " destacado" : "";
  return (
    <article className={`modulo agente${clase}`} aria-labelledby={`agente-${t.clave}`}>
      <div className="modulo-cabecera">
        <div>
          <h2 id={`agente-${t.clave}`}>{t.nombre}</h2>
          <p className="agente-grupo">{t.grupo}</p>
        </div>
        {r && <span className={`etiqueta ${ESTADO[r.estado].clase}`}>{ESTADO[r.estado].texto}</span>}
      </div>
      {r ? (
        <>
          <p className="agente-titular">{r.titular}</p>
          {r.puntos.length > 0 && (
            <ul className="puntos">
              {r.puntos.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {r.enlace && (
            <a className="enlace" href={r.enlace} target="_blank" rel="noopener noreferrer nofollow">
              Ver el informe
              <Icono nombre="externo" tam={16} titulo="(se abre en otra pestaña)" />
            </a>
          )}
        </>
      ) : (
        <p className="vacio">
          {t.ficheroCreado
            ? "Todavía no ha escrito ningún resultado. Aparecerá tras su próxima ejecución."
            : "Su fichero no está en Drive. Vuelve a crearlo en Ajustes."}
        </p>
      )}
      <dl className="agente-pie">
        <dt>Última</dt>
        <dd>{r ? hace(r.ejecutado, ahora) : "sin ejecuciones todavía"}</dd>
        <dt>Próxima</dt>
        <dd>{cuando(t.proxima, tz)}</dd>
        <dt>Cuándo</dt>
        <dd>{t.programacion}</dd>
      </dl>
    </article>
  );
}

export function Agentes({ r, ahora, tz, privadasOcultas }: { r: ResultadoAgentes; ahora: number; tz: string; privadasOcultas: boolean }) {
  if (r.estado === "sin_drive") {
    return (
      <div className="modulo estado">
        <p>Falta el permiso de Drive. Reconecta Google en Ajustes.</p>
        <a className="boton boton-primario" href="/ajustes#google">
          Ir a Ajustes
        </a>
      </div>
    );
  }
  if (r.estado === "sin_carpeta") {
    return (
      <div className="modulo estado">
        <p>Crea la carpeta «Mi Panel · Agentes» en Ajustes. Tus tareas programadas escribirán ahí su último resultado.</p>
        <a className="boton boton-primario" href="/ajustes#agentes">
          Ir a Ajustes
        </a>
      </div>
    );
  }
  if (r.estado === "error") {
    return (
      <div className="modulo estado estado-error">
        <p>No se han podido leer los resultados de Drive ahora mismo.</p>
        <a className="boton" href="/agentes">
          Reintentar
        </a>
      </div>
    );
  }
  return (
    <>
      <div className="agentes">
        {r.tarjetas.map((t) => (
          <TarjetaAgente t={t} ahora={ahora} tz={tz} key={t.clave} />
        ))}
      </div>
      {privadasOcultas && (
        <p className="nota nota-pie">El informe de inversiones solo se muestra con Finanzas desbloqueado y los importes visibles.</p>
      )}
    </>
  );
}

/** Página /agentes (también la usa la demostración). */
export function PaginaAgentes({
  r,
  ahora,
  tz,
  privadasOcultas,
  horaLocal,
}: {
  r: ResultadoAgentes;
  ahora: number;
  tz: string;
  privadasOcultas: boolean;
  horaLocal: boolean;
}) {
  return (
    <main className="pagina">
      {horaLocal && <TzSync />}
      <Cabecera actual="agentes" novedades={novedadesAgentes(r).length} />
      <div className="titulo-pagina">
        <h1>Agentes</h1>
        <p>El último resultado de cada tarea programada. Cada tarea lo deja en su fichero de Drive al terminar.</p>
      </div>
      <Agentes r={r} ahora={ahora} tz={tz} privadasOcultas={privadasOcultas} />
    </main>
  );
}

/** Módulo del inicio: qué agentes traen novedades. */
export function ResumenAgentes({ r }: { r: ResultadoAgentes }) {
  if (r.estado !== "ok") return null;
  const con = novedadesAgentes(r);
  return (
    <section className="modulo" aria-labelledby="agentes-titulo">
      <a className="enlace-modulo" href="/agentes">
        <span>
          <h2 id="agentes-titulo">Agentes</h2>
          <p>
            {con.length === 0
              ? `${r.tarjetas.length} agentes, sin novedades.`
              : `${con.length === 1 ? "1 con novedades" : `${con.length} con novedades`}: ${con.map((t) => t.nombre).join(", ")}.`}
          </p>
        </span>
        <Icono nombre="siguiente" tam={22} />
      </a>
    </section>
  );
}
