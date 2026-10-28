import type { ReactNode } from "react";
import Link from "next/link";
import { esVariosDias, formatDia, formatDuracion, formatHora, tramoDelDia, type Dia, type Evento } from "@/lib/agenda";
import type { ResultadoAgenda } from "@/lib/agenda-loader";
import { MENSAJES_FALLO } from "@/lib/mis-tareas";

function Punto({ color }: { color?: string }) {
  return <span className="dot" style={{ background: color ?? "var(--muted)" }} aria-hidden="true" />;
}

function hastaDia(ms: number, tz: string): string {
  // El fin es exclusivo: un evento que acaba el 5 nov a las 00:00 dura hasta el 4 nov.
  return new Intl.DateTimeFormat("es-ES", { timeZone: tz, day: "numeric", month: "short" }).format(new Date(ms - 1));
}

/** Eventos de todo el día y de varios días (contexto): no ocupan huecos. */
function Contexto({ dia, tz }: { dia: Dia; tz: string }) {
  if (dia.todoElDia.length === 0 && dia.variosDias.length === 0) return null;
  return (
    <p className="small">
      {dia.todoElDia.map((e) => (
        <span className="chip" key={e.clave}>
          <Punto color={e.color} /> {e.titulo}
        </span>
      ))}
      {dia.variosDias.map((e) => (
        <span className="chip" key={e.clave}>
          <Punto color={e.color} /> {e.titulo}
          <span className="muted"> · varios días, hasta el {hastaDia(e.fin as number, tz)}</span>
        </span>
      ))}
    </p>
  );
}

function FilaEvento({ e, dia, tz }: { e: Evento; dia: Dia; tz: string }) {
  return (
    <li className={e.tarea ? "ev ev-tarea" : "ev"}>
      {e.tarea ? <span className="dot dot-tarea" aria-hidden="true" /> : <Punto color={e.color} />}
      <span className="ev-hora">
        {tramoDelDia(e, dia.ini, dia.fin, tz)}
      </span>
      <span className="ev-titulo">
        {e.titulo}
        {e.tarea && <span className="muted"> · tarea</span>}
        {esVariosDias(e) && <span className="muted"> · varios días</span>}
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
  const vacio = dia.todoElDia.length === 0 && dia.variosDias.length === 0 && dia.eventos.length === 0;
  return (
    <div className="card">
      <h2>Hoy · {formatDia(dia.fecha)}</h2>
      <Contexto dia={dia} tz={tz} />
      {vacio ? (
        <p className="muted">Nada en el calendario para hoy.</p>
      ) : (
        <ul className="evs">
          {dia.eventos.map((e) => (
            <FilaEvento e={e} dia={dia} tz={tz} key={e.clave} />
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
          · {dia.eventos.length + dia.todoElDia.length + dia.variosDias.length} eventos
          {dia.solapes.length > 0 && " · ⚠ solape"}
        </span>
      </summary>
      <Contexto dia={dia} tz={tz} />
      {dia.eventos.length > 0 && (
        <ul className="evs">
          {dia.eventos.map((e) => (
            <FilaEvento e={e} dia={dia} tz={tz} key={e.clave} />
          ))}
        </ul>
      )}
      <Solapes dia={dia} />
      <Huecos dia={dia} tz={tz} />
    </details>
  );
}

export function Agenda({ r, trasHoy }: { r: ResultadoAgenda; trasHoy?: ReactNode }) {
  if (r.estado !== "ok") {
    return (
      <>
        <AgendaSinDatos r={r} />
        {trasHoy}
      </>
    );
  }

  const [hoy, ...resto] = r.dias;
  return (
    <section aria-label="Agenda">
      <DiaHoy dia={hoy} tz={r.tz} />
      {trasHoy}
      <h2 className="sub">Próximos 7 días</h2>
      {resto.map((d) => (
        <DiaProximo dia={d} tz={r.tz} key={d.fecha} />
      ))}
      <AvisoTareas r={r} />
    </section>
  );
}

function AgendaSinDatos({ r }: { r: Exclude<ResultadoAgenda, { estado: "ok" }> }) {
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

  return null;
}

function AvisoTareas({ r }: { r: Extract<ResultadoAgenda, { estado: "ok" }> }) {
  return (
    <>
      {r.tareas !== "ok" && r.tareas !== "sin_configurar" && (
        <p className="aviso small" role="status">
          Las tareas con hora de Mis tareas no se han podido leer: {MENSAJES_FALLO[r.tareas]} Los huecos no las tienen
          en cuenta.
        </p>
      )}
      <p className="muted small">
        Calendarios: {r.calendarios.length ? r.calendarios.join(", ") : "ninguno seleccionado"}
        {r.tareas === "ok" && " + tareas con hora de Mis tareas"} · Zona horaria: {r.tz}
      </p>
    </>
  );
}
