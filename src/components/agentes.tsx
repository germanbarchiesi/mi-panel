import Link from "next/link";
import type { Estado, Tarjeta } from "@/lib/agentes";
import type { ResultadoAgentes } from "@/lib/agentes-loader";

const ESTADO: Record<Estado, { texto: string; clase: string }> = {
  alerta: { texto: "Alerta", clase: "riesgo" },
  novedad: { texto: "Novedad", clase: "atencion" },
  error: { texto: "Error", clase: "riesgo" },
  sin_novedades: { texto: "Sin novedades", clase: "ok" },
};

function hace(ms: number, ahora: number): string {
  const min = Math.round((ahora - ms) / 60000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

function cuando(ms: number | null, tz: string): string {
  if (ms === null) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

function Tarjetita({ t, ahora, tz }: { t: Tarjeta; ahora: number; tz: string }) {
  const r = t.resultado;
  return (
    <article className={`card agente${r && (r.estado === "alerta" || r.estado === "novedad") ? " destacado" : ""}`}>
      <div className="row row-compacta">
        <div>
          <h2>{t.nombre}</h2>
          <p className="muted small" style={{ margin: 0 }}>
            {t.grupo}
          </p>
        </div>
        {r && <span className={`ritmo ${ESTADO[r.estado].clase}`}>{ESTADO[r.estado].texto}</span>}
      </div>
      {r ? (
        <>
          <p>
            <strong>{r.titular}</strong>
          </p>
          {r.puntos.length > 0 && (
            <ul className="temas small">
              {r.puntos.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {r.enlace && (
            <a className="enlace small" href={r.enlace} target="_blank" rel="noopener noreferrer nofollow">
              Ver informe ↗
            </a>
          )}
        </>
      ) : (
        <p className="muted">
          {t.ficheroCreado
            ? "Todavía no ha escrito ningún resultado. Aparecerá tras su próxima ejecución."
            : "Su fichero no está en Drive. Vuelve a crearlo en Ajustes."}
        </p>
      )}
      <p className="muted small" style={{ margin: "8px 0 0" }}>
        {r ? `Última ejecución ${hace(r.ejecutado, ahora)}` : "Sin ejecuciones registradas"} · próxima {cuando(t.proxima, tz)} ·{" "}
        {t.programacion}
      </p>
    </article>
  );
}

export function Agentes({ r, ahora, tz, privadasOcultas }: { r: ResultadoAgentes; ahora: number; tz: string; privadasOcultas: boolean }) {
  if (r.estado === "sin_drive") {
    return (
      <div className="card">
        <p className="muted">Falta el permiso de Drive. Reconecta Google en Ajustes.</p>
      </div>
    );
  }
  if (r.estado === "sin_carpeta") {
    return (
      <div className="card">
        <p className="muted">
          Crea la carpeta «Mi Panel · Agentes» en Ajustes. Tus tareas programadas escribirán ahí su último resultado.
        </p>
        <a className="btn btn-primary" href="/ajustes#agentes">
          Ir a Ajustes
        </a>
      </div>
    );
  }
  if (r.estado === "error") {
    return (
      <div className="card">
        <p className="error">No se pudieron leer los resultados de Drive ahora mismo.</p>
      </div>
    );
  }
  return (
    <section aria-label="Agentes">
      {r.tarjetas.map((t) => (
        <Tarjetita t={t} ahora={ahora} tz={tz} key={t.clave} />
      ))}
      {privadasOcultas && (
        <p className="muted small">El informe de inversiones solo se muestra con Finanzas desbloqueado y sin ocultar importes.</p>
      )}
    </section>
  );
}

/** Línea para el inicio: cuántos agentes traen novedades. */
export function ResumenAgentes({ r }: { r: ResultadoAgentes }) {
  if (r.estado !== "ok") return null;
  const con = r.tarjetas.filter((t) => t.resultado && (t.resultado.estado === "alerta" || t.resultado.estado === "novedad"));
  return (
    <Link className="card enlace-card" href="/agentes">
      <strong>Agentes</strong>{" "}
      <span className={con.length ? "" : "muted"}>
        {con.length
          ? `· ${con.length} con novedades: ${con.map((t) => t.nombre).join(", ")}`
          : `· ${r.tarjetas.length} agentes, sin novedades`}
      </span>
      <span className="derecha">→</span>
    </Link>
  );
}
