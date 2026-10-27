import Link from "next/link";
import { formatDia, formatDuracion, formatHora, type Dia, type Evento } from "@/lib/agenda";
import type { ResultadoAgenda } from "@/lib/agenda-loader";

function Punto({ color }: { color?: string }) {
  return <span className="dot" style={{ background: color ?? "var(--muted)" }} aria-hidden="true" />;
}

function FilaEvento({ e, tz }: { e: Evento; tz: string }) {
  return (
    <li className="ev">
      <Punto color={e.color} />
      <span className="ev-hora">
        {formatHora(e.inicio as number, tz)}–{formatHora(e.fin as number, tz)}
      </span>
      <span className="ev-titulo">
        {e.titulo}
        {e.libre && <span className="muted"> · libre</span>}
        {e.lugar && <span className="muted"> · {e.lugar}</span>}
      </span>
    </li>
  );
}

function Huecos({ dia, tz }: { dia: Dia; tz: string }) {
  if (dia.huecos.length === 0) return <p className="muted small">Sin huecos libres en tu horario.</p>;
  return (
    <p className="small">
      <strong>Huecos:</strong>{" "}
      {dia.huecos
        .map((h) => `${formatHora(h.ini, tz)}–${formatHora(h.fin, tz)} (${formatDuracion((h.fin - h.ini) / 60000)})`)
        .join(" · ")}
    </p>
  );
}

function Solapes({ dia }: { dia: Dia }) {
  if (dia.solapes.length === 0) return null;
  return (
    <p className="aviso small" role="status">
      <strong>Solapes:</strong> {dia.solapes.map(([a, b]) => `${a.titulo} ↔ ${b.titulo}`).join(" · ")}
    </p>
  );
}

function DiaHoy({ dia, tz }: { dia: Dia; tz: string }) {
  const vacio = dia.todoElDia.length === 0 && dia.eventos.length === 0;
  return (
    <div className="card">
      <h2>Hoy · {formatDia(dia.fecha)}</h2>
      {dia.todoElDia.length > 0 && (
        <p className="small">
          {dia.todoElDia.map((e) => (
            <span className="chip" key={e.clave}>
              <Punto color={e.color} /> {e.titulo}
            </span>
          ))}
        </p>
      )}
      {vacio ? (
        <p className="muted">Nada en el calendario para hoy.</p>
      ) : (
        <ul className="evs">
          {dia.eventos.map((e) => (
            <FilaEvento e={e} tz={tz} key={e.clave} />
          ))}
        </ul>
      )}
      <Solapes dia={dia} />
      <Huecos dia={dia} tz={tz} />
    </div>
  );
}

function DiaProximo({ dia, tz }: { dia: Dia; tz: string }) {
  return (
    <details className="card dia">
      <summary>
        <strong>{formatDia(dia.fecha)}</strong>
        <span className="muted small">
          {" "}
          · {dia.eventos.length + dia.todoElDia.length} eventos
          {dia.solapes.length > 0 && " · ⚠ solape"}
        </span>
      </summary>
      {dia.todoElDia.length > 0 && (
        <p className="small">
          {dia.todoElDia.map((e) => (
            <span className="chip" key={e.clave}>
              <Punto color={e.color} /> {e.titulo}
            </span>
          ))}
        </p>
      )}
      {dia.eventos.length > 0 && (
        <ul className="evs">
          {dia.eventos.map((e) => (
            <FilaEvento e={e} tz={tz} key={e.clave} />
          ))}
        </ul>
      )}
      <Solapes dia={dia} />
      <Huecos dia={dia} tz={tz} />
    </details>
  );
}

export function Agenda({ r }: { r: ResultadoAgenda }) {
  if (r.estado === "sin_conectar" || r.estado === "reconectar") {
    return (
      <div className="card">
        <h2>Agenda</h2>
        <p className="muted">
          {r.estado === "sin_conectar"
            ? "Conecta Google Calendar para ver tus eventos. Solo se pide permiso de lectura."
            : "Google ha cerrado el permiso de Calendar. Vuelve a conectarlo."}
        </p>
        <a className="btn btn-primary" href="/auth/google/conectar">
          {r.estado === "sin_conectar" ? "Conectar Google Calendar" : "Reconectar Calendar"}
        </a>
      </div>
    );
  }
  if (r.estado === "falta_migracion") {
    return (
      <div className="card">
        <h2>Agenda</h2>
        <p className="error">Falta ejecutar la migración 0002 en Supabase (SQL Editor).</p>
      </div>
    );
  }
  if (r.estado === "error") {
    return (
      <div className="card">
        <h2>Agenda</h2>
        <p className="error">No se pudo leer Google Calendar ({r.mensaje}).</p>
        <Link className="btn" href="/">
          Reintentar
        </Link>
      </div>
    );
  }

  const [hoy, ...resto] = r.dias;
  return (
    <section aria-label="Agenda">
      <DiaHoy dia={hoy} tz={r.tz} />
      <h2 className="sub">Próximos 7 días</h2>
      {resto.map((d) => (
        <DiaProximo dia={d} tz={r.tz} key={d.fecha} />
      ))}
      <p className="muted small">
        Calendarios: {r.calendarios.length ? r.calendarios.join(", ") : "ninguno seleccionado"} · Zona horaria: {r.tz}
      </p>
    </section>
  );
}
