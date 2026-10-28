import Link from "next/link";
import { formatHora } from "@/lib/agenda";
import {
  MENSAJES_FALLO,
  marcos,
  temasOrdenados,
  textoArrastre,
  type Fallo,
  type Marco,
  type Prioridad,
  type Resumen,
  type Seleccion,
  type TareaArrastrada,
  type TareaHoy,
} from "@/lib/mis-tareas";

export type DatosActividades =
  | { ok: true; resumen: Resumen }
  | { ok: false; fallo: Fallo; ultimoOk: number | null };

const OPCIONES: { valor: Seleccion; texto: string }[] = [
  { valor: "trabajo", texto: "Trabajo" },
  { valor: "personal", texto: "Personal" },
  { valor: "todo", texto: "Todo" },
];

const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { alta: "Prioridad alta", media: "Prioridad media", baja: "Prioridad baja" };

function PuntoPrioridad({ p }: { p: Prioridad | null }) {
  if (!p) return <span className="dot dot-vacio" aria-hidden="true" />;
  return <span className={`dot prio-${p}`} role="img" aria-label={NOMBRE_PRIORIDAD[p]} title={NOMBRE_PRIORIDAD[p]} />;
}

function FilaHoy({ t }: { t: TareaHoy }) {
  return (
    <li className="ev">
      <PuntoPrioridad p={t.prioridad} />
      {t.hora && <span className="ev-hora">{t.hora}</span>}
      <span className="ev-titulo">
        {t.titulo}
        {t.personas.length > 0 && <span className="muted"> · con {t.personas.join(", ")}</span>}
        {t.proyectos.map((p) => (
          <span className="muted" key={p.nombre}>
            {" "}
            · {p.color && <span className="dot dot-mini" style={{ background: p.color }} aria-hidden="true" />} {p.nombre}
          </span>
        ))}
      </span>
    </li>
  );
}

function FilaArrastrada({ t }: { t: TareaArrastrada }) {
  return (
    <li className="ev">
      <PuntoPrioridad p={t.prioridad} />
      <span className="arrastre">{textoArrastre(t.dias)}</span>
      <span className="ev-titulo">{t.titulo}</span>
    </li>
  );
}

function BloqueMarco({ m, titulo }: { m: Marco; titulo: boolean }) {
  const vacio = m.hoy.length === 0 && m.arrastradas.length === 0;
  return (
    <div className="marco">
      {titulo && <h3>{m.ambito === "trabajo" ? "Trabajo" : "Personal"}</h3>}
      {vacio ? (
        <p className="muted">Nada pendiente para hoy</p>
      ) : (
        <>
          <p className="etiqueta">Hoy</p>
          {m.hoy.length ? (
            <ul className="evs">
              {m.hoy.map((t) => (
                <FilaHoy t={t} key={t.id} />
              ))}
            </ul>
          ) : (
            <p className="muted small">Sin tareas nuevas para hoy.</p>
          )}
          {m.arrastradas.length > 0 && (
            <>
              <p className="etiqueta">Arrastradas</p>
              <ul className="evs">
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
}: {
  datos: DatosActividades;
  sel: Seleccion;
  urlApp: string | null;
  tz: string;
}) {
  return (
    <section className="card" aria-label="Actividades">
      <div className="row row-compacta">
        <h2>Actividades</h2>
        {urlApp && (
          <a className="enlace small" href={urlApp} target="_blank" rel="noopener noreferrer">
            Abrir Mis tareas ↗
          </a>
        )}
      </div>

      <nav className="selector" aria-label="Ámbito">
        {OPCIONES.map((o) => (
          <Link
            key={o.valor}
            href={`/?ambito=${o.valor}`}
            className={o.valor === sel ? "seg activo" : "seg"}
            aria-current={o.valor === sel ? "true" : undefined}
            scroll={false}
          >
            {o.texto}
          </Link>
        ))}
      </nav>

      {datos.ok ? (
        <>
          {sinPendientes(datos.resumen, sel) ? (
            <p className="muted">Nada pendiente para hoy</p>
          ) : (
            marcos(datos.resumen, sel).map((m) => <BloqueMarco m={m} titulo={sel === "todo"} key={m.ambito} />)
          )}
          {datos.resumen.temas.length > 0 && (
            <div className="marco">
              <p className="etiqueta">Temas por persona</p>
              {temasOrdenados(datos.resumen).map((p) => (
                <div className="persona" key={p.persona}>
                  <strong>{p.persona}</strong>
                  {p.reunionHoy && <span className="muted small"> · te ves hoy</span>}
                  <ul className="temas">
                    {p.temas.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div role="status">
          <p className="error">{MENSAJES_FALLO[datos.fallo]}</p>
          <p className="muted small">
            {datos.ultimoOk
              ? `Última respuesta correcta: ${new Intl.DateTimeFormat("es-ES", { timeZone: tz, day: "numeric", month: "short" }).format(new Date(datos.ultimoOk))}, ${formatHora(datos.ultimoOk, tz)}.`
              : "Todavía no hay ninguna respuesta correcta."}{" "}
            El resto del panel funciona igual.
          </p>
        </div>
      )}
    </section>
  );
}
