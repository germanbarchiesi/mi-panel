import { MESES, type Resumen } from "@/lib/finanzas";
import type { ResultadoFinanzas } from "@/lib/finanzas-loader";
import { AutoBloqueo, BotonBloquear, BotonDesbloquear, BotonImportes } from "@/components/biometria";
import { Vencimientos } from "@/components/vencimientos";
import { Inversiones } from "@/components/inversiones";
import { Icono } from "@/components/iconos";

export type EstadoFinanzas =
  | { tipo: "modo_trabajo" }
  | { tipo: "bloqueado"; hayHuella: boolean; faltaMigracion: boolean }
  | { tipo: "abierto"; hasta: number; ocultos: boolean; r: ResultadoFinanzas };

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const EUR0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 0 });

export function importe(n: number, ocultos: boolean, redondo = false) {
  if (ocultos) return <span className="importe oculto">•••• €</span>;
  return <span className="importe">{(redondo ? EUR0 : EUR).format(n)}</span>;
}

function fechaCorta(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
    .replace(/\./g, "");
}

const ESTADO_RITMO = {
  bien: { texto: "Bien", clase: "etiqueta-ok" },
  atencion: { texto: "Atención", clase: "etiqueta-atencion" },
  riesgo: { texto: "En riesgo", clase: "etiqueta-riesgo" },
};

/** Lo gastado frente a tu media de meses cerrados, con la marca de dónde estarías a ritmo normal. */
function Ritmo({ r, ocultos }: { r: Resumen; ocultos: boolean }) {
  const media = r.mediaCerrados;
  if (!r.ritmo || media === null) {
    return (
      <p className="nota">
        {media === null ? "Aún no hay meses cerrados con los que comparar el ritmo de gasto." : "Sin movimientos importados este mes."}
      </p>
    );
  }
  const llevado = r.actual.gastado / media;
  const esperado = r.diasMes > 0 ? r.diaCorte / r.diasMes : 0;
  const escala = Math.max(1, llevado);
  const desvio = Math.round(r.ritmo.desvio);
  return (
    <div className="ritmo">
      <h3 className="ritmo-titular">
        Ritmo de gasto
        <span className={`etiqueta ${ESTADO_RITMO[r.ritmo.estado].clase}`}>{ESTADO_RITMO[r.ritmo.estado].texto}</span>
      </h3>
      <div
        className="medidor"
        role="img"
        aria-label={`Llevas el ${PCT.format(llevado)} de tu gasto medio; a día ${r.diaCorte} lo habitual sería el ${PCT.format(esperado)}.`}
      >
        <span className={`medidor-valor ${r.ritmo.estado}`} style={{ width: `${Math.min(100, (llevado / escala) * 100)}%` }} />
        <span className="medidor-media" style={{ left: `${Math.min(100, (esperado / escala) * 100)}%` }} />
      </div>
      <p className="nota">
        Llevas el {PCT.format(llevado)} de tu gasto medio y vas por el día {r.diaCorte} de {r.diasMes} (
        {desvio > 0 ? `+${desvio}` : desvio} puntos). Cierre estimado: {importe(r.ritmo.cierreEstimado, ocultos, true)}, frente a una media
        de {importe(media, ocultos, true)} en {r.mesesCerrados} {r.mesesCerrados === 1 ? "mes cerrado" : "meses cerrados"}.
      </p>
    </div>
  );
}

function Metricas({ r, ocultos }: { r: Resumen; ocultos: boolean }) {
  const a = r.actual;
  const nombreMes = MESES[r.mes - 1];
  const otrosPend = r.pendientesAnio.filter((p) => p.mes !== r.mes);
  const mayor = r.top5[0]?.gastado ?? 0;

  return (
    <>
      <p className="nota">
        {nombreMes} de {r.anio}, {r.fechaCorte ? `datos hasta el ${fechaCorta(r.fechaCorte)}` : "sin fecha de corte"}. Solo tu parte.
      </p>

      {a.pendientes.n > 0 && (
        <p className="aviso aviso-suave" role="status">
          <Icono nombre="alerta" tam={18} />
          <span>
            {a.pendientes.n === 1 ? "1 movimiento sin clasificar" : `${a.pendientes.n} movimientos sin clasificar`} en{" "}
            {nombreMes.toLowerCase()} ({importe(a.pendientes.importe, ocultos, true)}): el gasto real es mayor.
          </span>
        </p>
      )}

      <dl className="cifras">
        <div>
          <dt>Ingresado</dt>
          <dd>{importe(a.ingresado, ocultos, true)}</dd>
        </div>
        <div>
          <dt>Gastado</dt>
          <dd>{importe(a.gastado, ocultos, true)}</dd>
        </div>
        <div>
          <dt>Ahorro</dt>
          <dd>{importe(a.ahorro, ocultos, true)}</dd>
        </div>
        <div>
          <dt>Tasa de ahorro</dt>
          <dd>{a.tasa === null ? "—" : PCT.format(a.tasa)}</dd>
        </div>
      </dl>

      <Ritmo r={r} ocultos={ocultos} />

      {r.anterior && r.anterior.tieneGastos && (
        <p className="nota">
          En {MESES[r.anterior.mes - 1].toLowerCase()} gastaste {importe(r.anterior.gastado, ocultos, true)} en todo el mes;{" "}
          {nombreMes.toLowerCase()} va por {importe(a.gastado, ocultos, true)}.
        </p>
      )}

      {r.top5.length > 0 && (
        <div className="grupo">
          <h3>En qué se va</h3>
          <ul className="reparto">
            {r.top5.map((c) => (
              <li key={c.categoria}>
                <span className="reparto-nombre">{c.categoria}</span>
                <span className="reparto-cifra">{importe(c.gastado, ocultos)}</span>
                <span className="reparto-barra" aria-hidden="true">
                  <span style={{ width: `${mayor > 0 ? Math.max(2, Math.round((c.gastado / mayor) * 100)) : 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {otrosPend.length > 0 && (
        <p className="nota">
          Sin clasificar en otros meses: {otrosPend.map((p) => `${MESES[p.mes - 1].toLowerCase()} (${p.n})`).join(", ")}. Esos meses
          no cuentan como cerrados.
        </p>
      )}
    </>
  );
}

function Contenido({ r, ocultos }: { r: ResultadoFinanzas; ocultos: boolean }) {
  switch (r.estado) {
    case "ok":
      return (
        <>
          <Metricas r={r.resumen} ocultos={ocultos} />
          <p className="modulo-pie">
            {r.fichero.nombre}, guardado el {fechaCorta(r.fichero.modificado.slice(0, 10))}.
          </p>
        </>
      );
    case "sin_drive":
      return (
        <div className="estado">
          <p>Falta el permiso de Drive para leer tu Excel (solo el fichero que elijas).</p>
          <a className="boton boton-primario" href="/auth/google/conectar">
            Reconectar Google
          </a>
        </div>
      );
    case "sin_excel":
      return (
        <div className="estado">
          <p>Elige tu Excel de cuentas en Ajustes.</p>
          <a className="boton boton-primario" href="/ajustes#finanzas">
            Elegir el Excel
          </a>
        </div>
      );
    case "reconectar":
      return (
        <div className="estado">
          <p>Google ha cerrado el permiso. Vuelve a conectarlo.</p>
          <a className="boton boton-primario" href="/auth/google/conectar">
            Reconectar Google
          </a>
        </div>
      );
    case "no_disponible":
      return (
        <div className="estado estado-error">
          <p>No se encuentra el Excel en Drive (¿borrado o subido de nuevo?). Elígelo otra vez.</p>
          <a className="boton" href="/ajustes#finanzas">
            Elegir el Excel
          </a>
        </div>
      );
    case "invalido":
      return <p className="error">El Excel no tiene la estructura esperada: {r.mensaje}.</p>;
    default:
      return <p className="error">No se ha podido leer el Excel ahora mismo. Inténtalo dentro de un momento.</p>;
  }
}

export function Finanzas({ e }: { e: EstadoFinanzas }) {
  if (e.tipo === "modo_trabajo") {
    return (
      <section className="modulo" aria-labelledby="finanzas-titulo">
        <h2 id="finanzas-titulo">Finanzas</h2>
        <p className="vacio">No se cargan en el PC de trabajo.</p>
      </section>
    );
  }
  if (e.tipo === "bloqueado") {
    return (
      <section className="modulo" aria-labelledby="finanzas-titulo">
        <div className="modulo-cabecera">
          <h2 id="finanzas-titulo">
            <Icono nombre="candado" tam={20} />
            Finanzas
          </h2>
        </div>
        <p className="nota">Finanzas, vencimientos e inversiones se abren con la huella y se bloquean solos a los 5 minutos.</p>
        {e.faltaMigracion ? (
          <p className="error">Falta ejecutar la migración 0003 en Supabase (SQL Editor).</p>
        ) : e.hayHuella ? (
          <BotonDesbloquear />
        ) : (
          <div className="estado">
            <p>Registra la huella o Windows Hello de este dispositivo para ver tus finanzas.</p>
            <a className="boton boton-primario" href="/ajustes#huella">
              Registrar la huella
            </a>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="modulo" aria-labelledby="finanzas-titulo">
      <AutoBloqueo hasta={e.hasta} />
      <div className="modulo-cabecera">
        <h2 id="finanzas-titulo">Finanzas</h2>
        <div className="acciones">
          <BotonImportes ocultos={e.ocultos} />
          <BotonBloquear />
        </div>
      </div>
      <Contenido r={e.r} ocultos={e.ocultos} />
    </section>
  );
}

/** Finanzas y, debajo, Vencimientos e Inversiones: mismo desbloqueo y misma lectura del Excel. */
export function FinanzasYVencimientos({ e }: { e: EstadoFinanzas }) {
  return (
    <>
      <Finanzas e={e} />
      {e.tipo === "abierto" && e.r.estado === "ok" && (
        <>
          <Vencimientos r={e.r.vencimientos} ocultos={e.ocultos} />
          <Inversiones r={e.r.inversiones} ocultos={e.ocultos} />
        </>
      )}
    </>
  );
}
