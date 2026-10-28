import { MESES, type Resumen } from "@/lib/finanzas";
import type { ResultadoFinanzas } from "@/lib/finanzas-loader";
import { AutoBloqueo, BotonBloquear, BotonDesbloquear, BotonImportes } from "@/components/biometria";

export type EstadoFinanzas =
  | { tipo: "modo_trabajo" }
  | { tipo: "bloqueado"; hayHuella: boolean; faltaMigracion: boolean }
  | { tipo: "abierto"; hasta: number; ocultos: boolean; r: ResultadoFinanzas };

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const EUR0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 0 });

function importe(n: number, ocultos: boolean, redondo = false) {
  if (ocultos) return <span className="importe oculto">•••• €</span>;
  return <span className="importe">{(redondo ? EUR0 : EUR).format(n)}</span>;
}

function fechaCorta(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

const ESTADO_RITMO = {
  bien: { texto: "Bien", clase: "ok" },
  atencion: { texto: "Atención", clase: "atencion" },
  riesgo: { texto: "En riesgo", clase: "riesgo" },
};

function Metricas({ r, ocultos }: { r: Resumen; ocultos: boolean }) {
  const a = r.actual;
  const nombreMes = MESES[r.mes - 1];
  const pendMes = a.pendientes;
  const otrosPend = r.pendientesAnio.filter((p) => p.mes !== r.mes);

  return (
    <>
      <p className="muted small">
        {nombreMes} {r.anio}
        {r.fechaCorte ? ` · datos hasta el ${fechaCorta(r.fechaCorte)}` : " · sin fecha de corte"} · solo tu parte
      </p>

      {pendMes.n > 0 && (
        <p className="aviso small" role="status">
          {pendMes.n} movimientos sin clasificar en {nombreMes.toLowerCase()} ({importe(pendMes.importe, ocultos, true)}).
          El gasto sale por debajo del real.
        </p>
      )}

      <div className="metricas">
        <div className="metrica">
          <span>Ingresado</span>
          <strong>{importe(a.ingresado, ocultos)}</strong>
        </div>
        <div className="metrica">
          <span>Gastado</span>
          <strong>{importe(a.gastado, ocultos)}</strong>
        </div>
        <div className="metrica">
          <span>Ahorro</span>
          <strong>{importe(a.ahorro, ocultos)}</strong>
        </div>
        <div className="metrica">
          <span>Tasa de ahorro</span>
          <strong>{a.tasa === null ? "—" : PCT.format(a.tasa)}</strong>
        </div>
      </div>

      <p className="etiqueta">Ritmo de gasto</p>
      {r.ritmo ? (
        <p>
          <span className={`ritmo ${ESTADO_RITMO[r.ritmo.estado].clase}`}>{ESTADO_RITMO[r.ritmo.estado].texto}</span>{" "}
          {r.ritmo.desvio > 0 ? "+" : ""}
          {Math.round(r.ritmo.desvio)} puntos frente a tu media al día {r.diaCorte}.{" "}
          <span className="muted small">
            Cierre estimado {importe(r.ritmo.cierreEstimado, ocultos, true)} · media de {r.mesesCerrados}{" "}
            {r.mesesCerrados === 1 ? "mes cerrado" : "meses cerrados"} {importe(r.mediaCerrados ?? 0, ocultos, true)}
          </span>
        </p>
      ) : (
        <p className="muted small">
          {r.mediaCerrados === null ? "Aún no hay meses cerrados para comparar." : "Sin movimientos importados este mes."}
        </p>
      )}

      {r.anterior && (
        <p className="small">
          <strong>{MESES[r.anterior.mes - 1]}:</strong> gastaste {importe(r.anterior.gastado, ocultos, true)} en todo el
          mes; {nombreMes.toLowerCase()} va por {importe(a.gastado, ocultos, true)} al día {r.diaCorte || "—"}.
        </p>
      )}

      {r.top5.length > 0 && (
        <>
          <p className="etiqueta">Top {r.top5.length} categorías</p>
          <ul className="evs">
            {r.top5.map((c) => (
              <li className="ev" key={c.categoria}>
                <span className="ev-titulo">{c.categoria}</span>
                <span className="ev-hora derecha">{importe(c.gastado, ocultos)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {otrosPend.length > 0 && (
        <p className="muted small">
          Sin clasificar en otros meses:{" "}
          {otrosPend.map((p) => `${MESES[p.mes - 1].slice(0, 3).toLowerCase()} ${p.n}`).join(" · ")}. Esos meses no
          cuentan como cerrados.
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
          <p className="muted small">
            {r.fichero.nombre} · guardado el {fechaCorta(r.fichero.modificado.slice(0, 10))}
          </p>
        </>
      );
    case "sin_drive":
      return (
        <>
          <p className="muted">Falta el permiso de Drive para leer tu Excel (solo el fichero que elijas).</p>
          <a className="btn btn-primary" href="/auth/google/conectar">
            Reconectar Google
          </a>
        </>
      );
    case "sin_excel":
      return (
        <>
          <p className="muted">Elige tu Excel de cuentas en Ajustes.</p>
          <a className="btn btn-primary" href="/ajustes#finanzas">
            Ir a Ajustes
          </a>
        </>
      );
    case "reconectar":
      return (
        <>
          <p className="muted">Google ha cerrado el permiso. Vuelve a conectarlo.</p>
          <a className="btn btn-primary" href="/auth/google/conectar">
            Reconectar Google
          </a>
        </>
      );
    case "no_disponible":
      return (
        <>
          <p className="error">No se encuentra el Excel en Drive (¿borrado o subido de nuevo?). Elígelo otra vez.</p>
          <a className="btn" href="/ajustes#finanzas">
            Elegir Excel
          </a>
        </>
      );
    case "invalido":
      return <p className="error">El Excel no tiene la estructura esperada: {r.mensaje}.</p>;
    default:
      return <p className="error">No se pudo leer el Excel ahora mismo. Inténtalo en un momento.</p>;
  }
}

export function Finanzas({ e }: { e: EstadoFinanzas }) {
  if (e.tipo === "modo_trabajo") {
    return (
      <section className="card" aria-label="Finanzas">
        <h2>Finanzas</h2>
        <p className="muted">No se carga en el PC de trabajo.</p>
      </section>
    );
  }
  if (e.tipo === "bloqueado") {
    return (
      <section className="card" aria-label="Finanzas">
        <h2>Finanzas 🔒</h2>
        {e.faltaMigracion ? (
          <p className="error">Falta ejecutar la migración 0003 en Supabase (SQL Editor).</p>
        ) : e.hayHuella ? (
          <BotonDesbloquear />
        ) : (
          <>
            <p className="muted">Registra la huella o Windows Hello de este dispositivo para ver tus finanzas.</p>
            <a className="btn btn-primary" href="/ajustes#huella">
              Ir a Ajustes
            </a>
          </>
        )}
      </section>
    );
  }
  return (
    <section className="card" aria-label="Finanzas">
      <AutoBloqueo hasta={e.hasta} />
      <div className="row row-compacta">
        <h2>Finanzas</h2>
        <div className="acciones">
          <BotonImportes ocultos={e.ocultos} />
          <BotonBloquear />
        </div>
      </div>
      <Contenido r={e.r} ocultos={e.ocultos} />
    </section>
  );
}
