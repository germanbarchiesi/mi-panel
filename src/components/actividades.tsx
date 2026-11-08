import Link from "next/link";
import { formatHora } from "@/lib/agenda";
import {
  MENSAJES_FALLO,
  marcos,
  temasOrdenados,
  type Fallo,
  type Marco,
  type Prioridad,
  type Resumen,
  type Seleccion,
  type TareaArrastrada,
  type TareaHoy,
} from "@/lib/mis-tareas";
import { Icono } from "@/components/iconos";

export type DatosActividades =
  | { ok: true; resumen: Resumen }
  | { ok: false; fallo: Fallo; ultimoOk: number | null };

const OPCIONES: { valor: Seleccion; texto: string }[] = [
  { valor: "trabajo", texto: "Trabajo" },
  { valor: "personal", texto: "Personal" },
  { valor: "todo", texto: "Todo" },
];

const NOMBRE_PRIORIDAD: Record<Prioridad, string> = {
  alta: "Prioridad alta",
  media: "Prioridad media",
  baja: "Prioridad baja",
};

function PuntoPrioridad({ p }: { p: Prioridad | null }) {
  if (!p) return <span className="prioridad" aria-hidden="true" />;
  return <span className={`prioridad prioridad-${p}`} role="img" aria-label={NOMBRE_PRIORIDAD[p]} title={NOMBRE_PRIORIDAD[p]} />;
}

function FilaHoy({ t }: { t: TareaHoy }) {
  return (
    <li className="fila">
      <span className="fila-hora num">{t.hora ?? ""}</span>
      <PuntoPrioridad p={t.prioridad} />
      <span className="fila-cuerpo">
        <span className="fila-titulo">{t.titulo}</span>
        {(t.personas.length > 0 || t.proyectos.length > 0) && (
          <span className="fila-meta">
            {t.personas.length > 0 && <span>con {t.personas.join(", ")}</span>}
            {t.proyectos.map((p) => (
              <span key={p.nombre} className="proyecto">
                {p.color && <span className="punto" style={{ background: p.color }} aria-hidden="true" />}
                {p.nombre}
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

function FilaArrastrada({ t }: { t: TareaArrastrada }) {
  return (
    <li className="fila">
      <span className="fila-hora num arrastre" title={`Viene de hace ${t.dias} ${t.dias === 1 ? "día" : "días"}`}>
        <Icono nombre="repetir" tam={14} />
        {t.dias} d
      </span>
      <PuntoPrioridad p={t.prioridad} />
      <span className="fila-cuerpo">
        <span className="fila-titulo">{t.titulo}</span>
      </span>
    </li>
  );
}

function BloqueMarco({ m, titulo }: { m: Marco; titulo: boolean }) {
  const vacio = m.hoy.length === 0 && m.arrastradas.length === 0;
  return (
    <div className="grupo">
      {titulo && <h3>{m.ambito === "trabajo" ? "Trabajo" : "Personal"}</h3>}
      {vacio ? (
        <p className="vacio">Nada pendiente para hoy.</p>
      ) : (
        <>
          {m.hoy.length > 0 ? (
            <ul className="filas filas-tareas">
              {m.hoy.map((t) => (
                <FilaHoy t={t} key={t.id} />
              ))}
            </ul>
          ) : (
            <p className="nota">Sin tareas nuevas para hoy.</p>
          )}
          {m.arrastradas.length > 0 && (
            <>
              <p className="subtitulo">
                {m.arrastradas.length === 1 ? "1 arrastrada de días anteriores" : `${m.arrastradas.length} arrastradas de días anteriores`}
              </p>
              <ul className="filas filas-tareas">
                {m.arrastradas.map((t) => (
                  <FilaArrastrada t={t} key={t.id} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function sinPendientes(r: Resumen, sel: Seleccion): boolean {
  return marcos(r, sel).every((m) => m.hoy.length === 0 && m.arrastradas.length === 0);
}

export function Actividades({
  datos,
  sel,
  urlApp,
  tz,
  modoTrabajo = false,
}: {
  datos: DatosActividades;
  sel: Seleccion;
  urlApp: string | null;
  tz: string;
  modoTrabajo?: boolean;
}) {
  return (
    <section className="modulo" aria-labelledby="actividades-titulo">
      <div className="modulo-cabecera">
        <h2 id="actividades-titulo">Actividades</h2>
        {urlApp && (
          <a className="enlace" href={urlApp} target="_blank" rel="noopener noreferrer">
            Mis tareas
            <Icono nombre="externo" tam={16} titulo="(se abre en otra pestaña)" />
          </a>
        )}
      </div>

      {modoTrabajo ? (
        <p className="nota">PC de trabajo: solo tareas de Trabajo.</p>
      ) : (
        <nav className="segmentos" aria-label="Ámbito de las tareas">
          {OPCIONES.map((o) => (
            <Link
              key={o.valor}
              href={`/?ambito=${o.valor}`}
              className={o.valor === sel ? "segmento activo" : "segmento"}
              aria-current={o.valor === sel ? "true" : undefined}
              scroll={false}
            >
              {o.texto}
            </Link>
          ))}
        </nav>
      )}

      {datos.ok ? (
        <>
          {sinPendientes(datos.resumen, sel) ? (
            <p className="vacio">Nada pendiente para hoy.</p>
          ) : (
            marcos(datos.resumen, sel).map((m) => <BloqueMarco m={m} titulo={sel === "todo"} key={m.ambito} />)
          )}
          {datos.resumen.temas.length > 0 && (
            <div className="grupo">
              <h3>Temas por persona</h3>
              <ul className="personas">
                {temasOrdenados(datos.resumen).map((p) => (
                  <li key={p.persona}>
                    <p className="persona-nombre">
                      {p.persona}
                      {p.reunionHoy && <span className="etiqueta etiqueta-ahora">Hoy os veis</span>}
                    </p>
                    <ul className="temas">
                      {p.temas.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="estado estado-error" role="status">
          <p>{MENSAJES_FALLO[datos.fallo]}</p>
          <p className="nota">
            {datos.ultimoOk
              ? `Última respuesta correcta: ${new Intl.DateTimeFormat("es-ES", { timeZone: tz, day: "numeric", month: "short" })
                  .format(new Date(datos.ultimoOk))
                  .replace(/\./g, "")}, ${formatHora(datos.ultimoOk, tz)}.`
              : "Todavía no hay ninguna respuesta correcta."}{" "}
            El resto del panel funciona igual.
          </p>
        </div>
      )}
    </section>
  );
}
