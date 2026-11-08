import Link from "next/link";
import { esVariosDias, formatDuracion, formatHora, situacion, tramoDelDia, type Dia, type Evento } from "@/lib/agenda";
import type { ResultadoAgenda } from "@/lib/agenda-loader";
import { construirLinea, posicion } from "@/lib/linea";
import { MENSAJES_FALLO } from "@/lib/mis-tareas";
import { MarcaAhora, Reloj } from "@/components/reloj";
import { Icono } from "@/components/iconos";

const NOMBRE_DIA = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "long" });
const FECHA_LARGA = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "long" });
const FECHA_CORTA = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

function mediodia(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function nombreDia(ymd: string) {
  return mayuscula(NOMBRE_DIA.format(mediodia(ymd)));
}

export function fechaLarga(ymd: string) {
  return FECHA_LARGA.format(mediodia(ymd));
}

function fechaCorta(ymd: string) {
  return mayuscula(FECHA_CORTA.format(mediodia(ymd)).replace(/\./g, ""));
}

function hastaDia(ms: number, tz: string): string {
  // El fin es exclusivo: un evento que acaba el 5 nov a las 00:00 dura hasta el 4 nov.
  return new Intl.DateTimeFormat("es-ES", { timeZone: tz, day: "numeric", month: "short" })
    .format(new Date(ms - 1))
    .replace(/\./g, "");
}

// --- Línea del día ---------------------------------------------------------------------------

/** Banda horaria del día: ocupado (color de su calendario), tareas, disponibles y huecos libres. */
export function LineaDelDia({
  dia,
  tz,
  ahora,
  compacta = false,
}: {
  dia: Dia;
  tz: string;
  ahora: number;
  compacta?: boolean;
}) {
  const l = construirLinea(dia, tz);
  const alto = (c: number) => `${(c / l.carriles) * 100}%`;
  return (
    <div className={compacta ? "linea linea-compacta" : "linea"} aria-hidden="true">
      <div className="linea-pista">
        {l.marcas.map((h) => (
          <span key={`g${h}`} className="linea-guia" style={{ left: `${posicion(h, l)}%` }} />
        ))}
        {l.huecos.map((h, i) => (
          <span
            key={`h${i}`}
            className="linea-hueco"
            style={{ left: `${posicion(h.ini, l)}%`, width: `${posicion(h.fin, l) - posicion(h.ini, l)}%` }}
            title={compacta ? undefined : `Libre ${h.texto}`}
          />
        ))}
        {l.tramos.map((t, i) => (
          <span
            key={`t${i}`}
            className={`linea-tramo linea-${t.tipo}`}
            style={{
              left: `${posicion(t.ini, l)}%`,
              width: `max(3px, ${posicion(t.fin, l) - posicion(t.ini, l)}%)`,
              top: alto(t.carril),
              height: `calc(${alto(1)} - 2px)`,
              ...(t.tipo === "evento" && t.color ? { background: t.color } : {}),
              ...(t.tipo === "libre" && t.color ? { borderColor: t.color } : {}),
            }}
            title={compacta ? undefined : `${t.texto} ${t.titulo}`}
          />
        ))}
        {dia.esHoy && <MarcaAhora inicial={ahora} fecha={dia.fecha} tz={tz} desde={l.desde} hasta={l.hasta} />}
      </div>
      {!compacta && (
        <div className="linea-horas num">
          {l.marcas.map((h) => (
            <span key={h} style={{ left: `${posicion(h, l)}%` }}>
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LeyendaLinea() {
  return (
    <ul className="leyenda" aria-hidden="true">
      <li>
        <span className="muestra muestra-evento" /> Ocupado
      </li>
      <li>
        <span className="muestra muestra-tarea" /> Tarea
      </li>
      <li>
        <span className="muestra muestra-hueco" /> Libre
      </li>
      <li>
        <span className="muestra muestra-ahora" /> Ahora
      </li>
    </ul>
  );
}

// --- Lista del día -----------------------------------------------------------------------------

type Fila =
  | { tipo: "evento"; orden: number; e: Evento }
  | { tipo: "hueco"; orden: number; ini: number; fin: number };

function filasDelDia(dia: Dia): Fila[] {
  const filas: Fila[] = [
    ...dia.eventos.map((e) => ({ tipo: "evento" as const, orden: e.inicio as number, e })),
    ...dia.huecos.map((h) => ({ tipo: "hueco" as const, orden: h.ini, ini: h.ini, fin: h.fin })),
  ];
  return filas.sort((a, b) => a.orden - b.orden || (a.tipo === "hueco" ? 1 : -1));
}

function HoraEvento({ e, dia, tz }: { e: Evento; dia: Dia; tz: string }) {
  const ini = e.inicio as number;
  const fin = e.fin as number;
  if (ini < dia.ini || fin > dia.fin) return <span className="fila-hora num fila-hora-tramo">{tramoDelDia(e, dia.ini, dia.fin, tz)}</span>;
  return (
    <span className="fila-hora num">
      {formatHora(ini, tz)}
      <span>{formatHora(fin, tz)}</span>
    </span>
  );
}

function FilaEvento({ e, dia, tz, ahora, solapa }: { e: Evento; dia: Dia; tz: string; ahora: number; solapa: boolean }) {
  const pasado = dia.esHoy && (e.fin as number) <= ahora;
  const enCurso = dia.esHoy && (e.inicio as number) <= ahora && (e.fin as number) > ahora;
  const clase = ["fila", e.tarea ? "fila-tarea" : "fila-evento", e.libre ? "fila-disponible" : "", pasado ? "fila-pasada" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={clase}>
      <HoraEvento e={e} dia={dia} tz={tz} />
      <span
        className="fila-marca"
        style={e.tarea || !e.color ? undefined : e.libre ? { color: e.color } : { background: e.color }}
        aria-hidden="true"
      />
      <span className="fila-cuerpo">
        <span className="fila-titulo">{e.titulo}</span>
        {e.lugar && <span className="fila-meta">{e.lugar}</span>}
      </span>
      <span className="fila-etiquetas">
        {enCurso && <span className="etiqueta etiqueta-ahora">Ahora</span>}
        {e.tarea && <span className="etiqueta etiqueta-tarea">Tarea</span>}
        {e.libre && <span className="etiqueta">Disponible</span>}
        {esVariosDias(e) && <span className="etiqueta">Varios días</span>}
        {solapa && <span className="etiqueta etiqueta-riesgo">Se solapa</span>}
      </span>
    </li>
  );
}

function FilaHueco({ ini, fin, tz, ahora }: { ini: number; fin: number; tz: string; ahora: number }) {
  const desde = Math.max(ini, ahora);
  // Los huecos de hoy empiezan «ahora» (redondeado al minuto siguiente): ese hueco está en curso.
  const enCurso = ahora > 0 && ini - ahora < 60_000 && fin > ahora;
  return (
    <li className="fila fila-hueco">
      <span className="fila-hora num">
        {formatHora(ini, tz)}
        <span>{formatHora(fin, tz)}</span>
      </span>
      <span className="fila-marca" aria-hidden="true" />
      <span className="fila-cuerpo">
        <span className="fila-titulo">Libre</span>
        <span className="fila-meta">{formatDuracion((fin - desde) / 60000)}</span>
      </span>
      {enCurso && (
        <span className="fila-etiquetas">
          <span className="etiqueta etiqueta-ahora">Ahora</span>
        </span>
      )}
    </li>
  );
}

/** Eventos de todo el día y de varios días (contexto): no ocupan huecos. */
function Contexto({ dia, tz }: { dia: Dia; tz: string }) {
  if (dia.todoElDia.length === 0 && dia.variosDias.length === 0) return null;
  return (
    <ul className="contexto" aria-label="Todo el día">
      {dia.todoElDia.map((e) => (
        <li className="chip" key={e.clave}>
          <span className="punto" style={{ background: e.color ?? "var(--tinta-3)" }} aria-hidden="true" />
          {e.titulo}
        </li>
      ))}
      {dia.variosDias.map((e) => (
        <li className="chip" key={e.clave}>
          <span className="punto" style={{ background: e.color ?? "var(--tinta-3)" }} aria-hidden="true" />
          {e.titulo}
          <span className="chip-meta">hasta el {hastaDia(e.fin as number, tz)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ListaDelDia({ dia, tz, ahora }: { dia: Dia; tz: string; ahora: number }) {
  const solapan = new Set(dia.solapes.flatMap(([a, b]) => [a.clave, b.clave]));
  const filas = filasDelDia(dia);
  const sinNada = dia.eventos.length === 0 && dia.todoElDia.length === 0 && dia.variosDias.length === 0;
  return (
    <>
      <Contexto dia={dia} tz={tz} />
      {sinNada && <p className="vacio">Nada en el calendario{dia.esHoy ? " hoy" : ""}.</p>}
      {filas.length > 0 && (
        <ul className="filas">
          {filas.map((f) =>
            f.tipo === "evento" ? (
              <FilaEvento e={f.e} dia={dia} tz={tz} ahora={ahora} solapa={solapan.has(f.e.clave)} key={f.e.clave} />
            ) : (
              <FilaHueco ini={f.ini} fin={f.fin} tz={tz} ahora={dia.esHoy ? ahora : 0} key={`h${f.ini}`} />
            ),
          )}
        </ul>
      )}
      {!sinNada && dia.huecos.length === 0 && <p className="nota">Sin huecos libres en tu horario.</p>}
    </>
  );
}

// --- Próximos días ------------------------------------------------------------------------------

function cuenta(d: Dia): string {
  const n = d.eventos.length + d.todoElDia.length + d.variosDias.length;
  if (n === 0) return "Sin eventos";
  return n === 1 ? "1 evento" : `${n} eventos`;
}

export function ProximosDias({ dias, tz, ahora }: { dias: Dia[]; tz: string; ahora: number }) {
  return (
    <section className="modulo" aria-labelledby="proximos-titulo">
      <div className="modulo-cabecera">
        <h2 id="proximos-titulo">Próximos días</h2>
      </div>
      <ul className="dias">
        {dias.map((d) => (
          <li key={d.fecha}>
            <details className="dia">
              <summary>
                <span className="dia-nombre">{fechaCorta(d.fecha)}</span>
                <LineaDelDia dia={d} tz={tz} ahora={ahora} compacta />
                <span className="dia-cuenta">
                  {d.solapes.length > 0 && (
                    <span className="aviso-icono" title="Hay solapes">
                      <Icono nombre="alerta" tam={16} titulo="Hay solapes" />
                    </span>
                  )}
                  {cuenta(d)}
                </span>
              </summary>
              <div className="dia-detalle">
                <ListaDelDia dia={d} tz={tz} ahora={ahora} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Hoy (cabecera de la página de inicio) ------------------------------------------------------------

function Situacion({ dia, tz, ahora }: { dia: Dia; tz: string; ahora: number }) {
  const s = situacion(dia, tz, ahora);
  return (
    <p className="hoy-dato">
      {s.actual ? (
        <>
          <strong>Ahora:</strong> {s.actual.titulo}
          {s.actual.hasta ? `, hasta las ${s.actual.hasta}.` : "."}{" "}
        </>
      ) : s.siguiente ? (
        <>
          <strong>Siguiente:</strong> {s.siguiente.titulo}, a las {s.siguiente.hora}.{" "}
        </>
      ) : (
        "Nada más en el calendario hoy. "
      )}
      {s.libre ? (
        <>
          Te quedan <strong>{s.libre}</strong> libres en tu horario.
        </>
      ) : (
        "Sin huecos libres en tu horario."
      )}
    </p>
  );
}

export function Hoy({ fecha, tz, ahora, agenda }: { fecha: string; tz: string; ahora: number; agenda: ResultadoAgenda | null }) {
  const dia = agenda?.estado === "ok" ? agenda.dias[0] : null;
  return (
    <section className="hoy" aria-labelledby="hoy-titulo">
      <div className="hoy-cabecera">
        <h1 id="hoy-titulo">
          <span className="hoy-dia">{nombreDia(fecha)}</span>
          <span className="hoy-fecha">{fechaLarga(fecha)}</span>
        </h1>
        <span className="hoy-reloj" title={`Hora de ${tz}`}>
          <Reloj inicial={ahora} tz={tz} />
        </span>
      </div>
      {agenda && agenda.estado !== "ok" && <AgendaSinDatos r={agenda} />}
      {agenda?.estado === "ok" && dia && (
        <>
          <Situacion dia={dia} tz={tz} ahora={ahora} />
          <div>
            <LineaDelDia dia={dia} tz={tz} ahora={ahora} />
            <LeyendaLinea />
          </div>
          <ListaDelDia dia={dia} tz={tz} ahora={ahora} />
          <NotaAgenda r={agenda} />
        </>
      )}
    </section>
  );
}

// --- Estados sin datos y nota de origen -----------------------------------------------------------

export function AgendaSinDatos({ r }: { r: Exclude<ResultadoAgenda, { estado: "ok" }> }) {
  if (r.estado === "sin_conectar" || r.estado === "reconectar") {
    return (
      <div className="estado">
        <p>
          {r.estado === "sin_conectar"
            ? "Conecta Google Calendar para ver tu día. Solo se pide permiso de lectura."
            : "Google ha cerrado el permiso de Calendar. Vuelve a conectarlo."}
        </p>
        <a className="boton boton-primario" href="/auth/google/conectar">
          {r.estado === "sin_conectar" ? "Conectar Google Calendar" : "Reconectar Calendar"}
        </a>
      </div>
    );
  }
  if (r.estado === "falta_migracion") {
    return (
      <div className="estado estado-error">
        <p>Falta ejecutar la migración 0002 en Supabase (SQL Editor).</p>
      </div>
    );
  }
  return (
    <div className="estado estado-error">
      <p>No se ha podido leer Google Calendar ({r.mensaje}).</p>
      <Link className="boton" href="/">
        Reintentar
      </Link>
    </div>
  );
}

export function NotaAgenda({ r }: { r: Extract<ResultadoAgenda, { estado: "ok" }> }) {
  return (
    <>
      {r.tareas !== "ok" && r.tareas !== "sin_configurar" && (
        <p className="aviso" role="status">
          <Icono nombre="alerta" tam={18} />
          <span>
            No se han podido leer las tareas con hora de Mis tareas: {MENSAJES_FALLO[r.tareas]} Los huecos no las
            tienen en cuenta.
          </span>
        </p>
      )}
      {r.fallidos.length > 0 && (
        <p className="aviso" role="status">
          <Icono nombre="alerta" tam={18} />
          <span>No se ha podido leer {r.fallidos.length === 1 ? "el calendario" : "los calendarios"} {r.fallidos.join(", ")}.</span>
        </p>
      )}
      <p className="modulo-pie">
        {r.calendarios.length ? `Calendarios: ${r.calendarios.join(", ")}` : "Ningún calendario seleccionado"}
        {r.tareas === "ok" ? ", y las tareas con hora de Mis tareas." : "."} Hora de {r.tz.replace(/_/g, " ")}.
      </p>
    </>
  );
}
