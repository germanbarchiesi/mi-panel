import { formatDia } from "@/lib/agenda";
import type { DiaDeporte, EstadoPlan, Hecho } from "@/lib/deporte";
import type { ResultadoDeporte } from "@/lib/deporte-loader";

const ICONO: Record<EstadoPlan, string> = { hecho: "✓", no_hecho: "✗", pendiente: "•", planificado: "○" };
const TEXTO: Record<EstadoPlan, string> = {
  hecho: "Hecho",
  no_hecho: "No hecho",
  pendiente: "Pendiente hoy",
  planificado: "Planificado",
};

function detalle(h: Hecho) {
  const partes = [`${h.hora}`, `${Math.round(h.minutos)} min`];
  if (h.sportType === "Swim" && h.metros > 0) partes.push(`${(h.metros / 1000).toFixed(2).replace(".", ",")} km`);
  return partes.join(" · ");
}

function Dia({ d }: { d: DiaDeporte }) {
  if (d.plan.length === 0 && d.extras.length === 0) {
    return (
      <li className={d.esHoy ? "ev dia-dep hoy" : "ev dia-dep"}>
        <span className="ev-hora dep-dia">{formatDia(d.fecha).split(",")[0]}</span>
        <span className="muted small">Descanso</span>
      </li>
    );
  }
  return (
    <li className={d.esHoy ? "ev dia-dep hoy" : "ev dia-dep"}>
      <span className="ev-hora dep-dia">{formatDia(d.fecha).split(",")[0]}</span>
      <span className="ev-titulo">
        {d.plan.map((p, i) => (
          <span className={`dep-item ${p.estado}`} key={`p${i}`}>
            <span aria-label={TEXTO[p.estado]} title={TEXTO[p.estado]} className="dep-icono">
              {ICONO[p.estado]}
            </span>{" "}
            {p.titulo}
            {p.hora && <span className="muted small"> · {p.hora}</span>}
            {p.hecho && <span className="muted small"> · {detalle(p.hecho)}</span>}
          </span>
        ))}
        {d.extras.map((h) => (
          <span className="dep-item extra" key={h.id}>
            <span className="dep-icono" title="Hecho sin planificar">
              +
            </span>{" "}
            {h.nombre || h.sportType}
            <span className="muted small"> · {detalle(h)}</span>
          </span>
        ))}
      </span>
    </li>
  );
}

const MENSAJE_STRAVA: Record<string, string> = {
  sin_conectar: "Conecta Strava en Ajustes para ver lo que has hecho.",
  revocado: "Strava ha cerrado el permiso. Vuelve a conectarlo en Ajustes.",
  sin_configurar: "Falta configurar STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET en Vercel.",
  falta_migracion: "Falta ejecutar la migración 0005 en Supabase (SQL Editor).",
  error: "Strava no responde ahora mismo.",
};

export function Deporte({ r }: { r: ResultadoDeporte }) {
  const s = r.semana;
  return (
    <section className="card" aria-label="Deporte">
      <h2>Deporte · esta semana</h2>
      {r.strava === "ok" && (
        <p className="small">
          {s.planificados > 0 ? (
            <>
              <strong>
                {s.cumplidos} de {s.planificados}
              </strong>{" "}
              sesiones planificadas hechas
              {s.pendientes > 0 && <span className="muted"> · {s.pendientes} por hacer</span>}
              {s.extras > 0 && <span className="muted"> · {s.extras} extra</span>}
            </>
          ) : (
            <strong>
              {s.sesiones.natacion + s.sesiones.fuerza} {s.sesiones.natacion + s.sesiones.fuerza === 1 ? "sesión" : "sesiones"}
            </strong>
          )}
          <span className="muted">
            {" "}
            · natación {s.sesiones.natacion}
            {s.metrosNatacion > 0 && ` (${(s.metrosNatacion / 1000).toFixed(1).replace(".", ",")} km)`} · fuerza/CrossFit{" "}
            {s.sesiones.fuerza} · {Math.floor(s.minutos / 60)} h {s.minutos % 60} min
          </span>
        </p>
      )}
      {r.strava !== "ok" && (
        <p className={r.strava === "sin_conectar" ? "muted" : "aviso small"}>{MENSAJE_STRAVA[r.strava]}</p>
      )}
      {r.calendario === "sin_calendario" && (
        <p className="muted small">
          Crea en Google Calendar un calendario llamado «Deporte» y pon ahí tus sesiones (p. ej. «Natación», «CrossFit»):
          así verás lo planificado frente a lo hecho.
        </p>
      )}
      {r.calendario === "error" && <p className="aviso small">No se pudo leer el calendario «Deporte».</p>}
      <ul className="evs">
        {s.dias.map((d) => (
          <Dia d={d} key={d.fecha} />
        ))}
      </ul>
    </section>
  );
}
