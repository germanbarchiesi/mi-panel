import { diasParaApuntar, type DiaDeporte, type EstadoPlan, type Hecho } from "@/lib/deporte";
import type { ResultadoDeporte } from "@/lib/deporte-loader";
import { Icono } from "@/components/iconos";
import { ApuntarEntreno } from "@/components/apuntar-entreno";

const LETRA = ["L", "M", "X", "J", "V", "S", "D"];
const NOMBRE = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const TEXTO: Record<EstadoPlan, string> = {
  hecho: "Hecho",
  no_hecho: "No hecho",
  pendiente: "Pendiente hoy",
  planificado: "Planificado",
};

/** 0 min, 45 min, 1 h 05 min. */
export function tiempo(minutos: number) {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, "0")} min`;
}

function km(metros: number, decimales = 1) {
  return `${(metros / 1000).toFixed(decimales).replace(".", ",")} km`;
}

function detalle(h: Hecho) {
  const partes = [`${Math.round(h.minutos)} min`];
  if (h.sportType === "Swim" && h.metros > 0) partes.push(km(h.metros, 2));
  if (h.manual) partes.push("apuntado a mano");
  return partes.join(", ");
}

function Marca({ estado, titulo }: { estado: EstadoPlan | "extra"; titulo: string }) {
  const nombre = estado === "extra" ? "Hecho sin planificar" : TEXTO[estado];
  const icono = estado === "hecho" ? "check" : estado === "no_hecho" ? "cruz" : estado === "extra" ? "mas" : null;
  return (
    <span className={`marca-dep marca-${estado}`} role="img" aria-label={`${nombre}: ${titulo}`} title={`${nombre}: ${titulo}`}>
      {icono && <Icono nombre={icono} tam={14} />}
    </span>
  );
}

function Celda({ d, i }: { d: DiaDeporte; i: number }) {
  const vacio = d.plan.length === 0 && d.extras.length === 0;
  return (
    <li className={d.esHoy ? "semana-dia hoy" : "semana-dia"}>
      <abbr className="semana-letra" title={NOMBRE[i]}>
        {LETRA[i]}
      </abbr>
      <span className="semana-marcas">
        {vacio && <span className="semana-descanso" aria-label="Descanso" role="img" />}
        {d.plan.map((p, k) => (
          <Marca estado={p.estado} titulo={p.titulo} key={`p${k}`} />
        ))}
        {d.extras.map((h) => (
          <Marca estado="extra" titulo={h.nombre || h.sportType} key={h.id} />
        ))}
      </span>
    </li>
  );
}

function FilaDia({ d, i }: { d: DiaDeporte; i: number }) {
  return (
    <li className={d.esHoy ? "fila fila-hoy" : "fila"}>
      <span className="fila-hora">{NOMBRE[i].slice(0, 3)}</span>
      <span aria-hidden="true" />
      <span className="fila-cuerpo">
        {d.plan.map((p, k) => (
          <span className={`dep-item dep-${p.estado}`} key={`p${k}`}>
            <span className="fila-titulo">
              {p.titulo}
              {p.hora && <span className="num"> {p.hora}</span>}
            </span>
            <span className="fila-meta">{p.hecho ? `${TEXTO.hecho}: ${detalle(p.hecho)}` : TEXTO[p.estado]}</span>
          </span>
        ))}
        {d.extras.map((h) => (
          <span className="dep-item dep-extra" key={h.id}>
            <span className="fila-titulo">
              {h.nombre || h.sportType} <span className="num">{h.hora}</span>
            </span>
            <span className="fila-meta">Sin planificar: {detalle(h)}</span>
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

/** «Apuntar un entreno a mano»: se crea en Strava, de donde el panel lee lo hecho. */
function Apuntar({ r, ahora }: { r: ResultadoDeporte; ahora: string }) {
  const hoy = r.semana.dias.find((d) => d.esHoy)?.fecha;
  if (!hoy) return null;
  const { opciones, elegido } = diasParaApuntar(r.semana, hoy, ahora);
  return (
    <details className="desplegable">
      <summary>Apuntar un entreno a mano</summary>
      {r.escribir ? (
        <>
          <p className="nota">Para cuando no llevabas el reloj. Se guarda en Strava como actividad manual.</p>
          <ApuntarEntreno opciones={opciones} elegido={elegido} />
        </>
      ) : (
        <div className="estado">
          <p className="nota">
            Para apuntar entrenos, Mi Panel necesita permiso para subir actividades a Strava. Solo creará los que apuntes aquí.
          </p>
          <a className="boton boton-primario" href="/auth/strava/conectar">
            Dar permiso en Strava
          </a>
        </div>
      )}
    </details>
  );
}

/** `ahora`: hora actual («HH:MM») en la zona del panel, para proponer qué apuntar. */
export function Deporte({ r, ahora }: { r: ResultadoDeporte; ahora: string }) {
  const s = r.semana;
  const conAlgo = s.dias.map((d, i) => ({ d, i })).filter(({ d }) => d.plan.length > 0 || d.extras.length > 0);
  return (
    <section className="modulo" aria-labelledby="deporte-titulo">
      <div className="modulo-cabecera">
        <h2 id="deporte-titulo">Deporte</h2>
        {r.strava === "ok" && s.planificados > 0 && (
          <p className="cabecera-dato">
            <strong>
              {s.cumplidos} de {s.planificados}
            </strong>{" "}
            hechas
          </p>
        )}
      </div>

      <ol className="semana" aria-label="Esta semana">
        {s.dias.map((d, i) => (
          <Celda d={d} i={i} key={d.fecha} />
        ))}
      </ol>

      {r.strava === "ok" && (
        <dl className="cifras cifras-3">
          <div>
            <dt>Natación</dt>
            <dd>
              {s.sesiones.natacion}
              {s.metrosNatacion > 0 && <span className="cifra-extra">{km(s.metrosNatacion)}</span>}
            </dd>
          </div>
          <div>
            <dt>Fuerza y CrossFit</dt>
            <dd>{s.sesiones.fuerza}</dd>
          </div>
          <div>
            <dt>Tiempo</dt>
            <dd>
              {tiempo(s.minutos)}
            </dd>
          </div>
        </dl>
      )}

      {r.strava !== "ok" && (
        <p className={r.strava === "sin_conectar" ? "nota" : "aviso"}>
          {r.strava !== "sin_conectar" && <Icono nombre="alerta" tam={18} />}
          <span>{MENSAJE_STRAVA[r.strava]}</span>
        </p>
      )}
      {r.calendario === "sin_calendario" && (
        <p className="nota">
          Crea en Google Calendar un calendario llamado «Deporte» con tus sesiones (por ejemplo «Natación» o «CrossFit») para
          comparar lo planificado con lo hecho.
        </p>
      )}
      {r.calendario === "sin_google" && <p className="nota">Conecta Google en Ajustes para leer el calendario «Deporte».</p>}
      {r.calendario === "error" && (
        <p className="aviso">
          <Icono nombre="alerta" tam={18} />
          <span>No se ha podido leer el calendario «Deporte».</span>
        </p>
      )}

      {r.strava === "ok" && <Apuntar r={r} ahora={ahora} />}

      {conAlgo.length > 0 && (
        <details className="desplegable">
          <summary>Detalle de la semana</summary>
          <ul className="filas filas-mes">
            {conAlgo.map(({ d, i }) => (
              <FilaDia d={d} i={i} key={d.fecha} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
