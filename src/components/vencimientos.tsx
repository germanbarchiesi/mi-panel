import type { CargoRepetido, ResultadoVencimientos, Vencimiento } from "@/lib/vencimientos";
import { AVISO_PRONTO, VENTANA_DIAS } from "@/lib/vencimientos";
import { Icono } from "@/components/iconos";

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

function importe(n: number, ocultos: boolean) {
  return ocultos ? <span className="importe oculto">•••• €</span> : <span className="importe">{EUR.format(n)}</span>;
}

function fecha(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
    .replace(/\./g, "");
}

export function cuando(dias: number) {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

const PERIODO: Record<string, string> = { mensual: "mensual", trimestral: "trimestral", anual: "anual", unico: "pago único" };

function Fila({ v, ocultos }: { v: Vencimiento; ocultos: boolean }) {
  return (
    <li className={v.pronto ? "fila fila-alerta" : "fila"}>
      <span className="fila-hora">
        {fecha(v.fecha)}
        <span className={v.pronto ? "negativo" : undefined}>{cuando(v.dias)}</span>
      </span>
      <span className="fila-marca" aria-hidden="true" />
      <span className="fila-cuerpo">
        <span className="fila-titulo">{v.concepto}</span>
        <span className="fila-meta">
          {v.origen === "prevision" ? "Previsión" : "Detectado"}, {PERIODO[v.periodo] ?? v.periodo}
        </span>
      </span>
      <span className="fila-derecha">{importe(v.miParte, ocultos)}</span>
    </li>
  );
}

function Detectados({ lista, ocultos }: { lista: CargoRepetido[]; ocultos: boolean }) {
  const activos = lista.filter((c) => c.activo);
  if (activos.length === 0) return null;
  return (
    <details className="desplegable">
      <summary>Cargos repetidos en tus movimientos ({activos.length})</summary>
      <ul className="filas filas-fechas">
        {activos.map((c) => (
          <li className="fila" key={c.descripcion + c.ultimo}>
            <span className="fila-hora">
              {fecha(c.proximo)}
              <span>próximo</span>
            </span>
            <span className="fila-marca" aria-hidden="true" />
            <span className="fila-cuerpo">
              <span className="fila-titulo">{c.descripcion}</span>
              <span className="fila-meta">
                <span>
                  {c.periodo}, {c.veces} veces
                </span>
                {c.enPrevision && <span>ya está en Previsión</span>}
                {c.miParte <= 0 && <span>no te toca a ti</span>}
              </span>
            </span>
            <span className="fila-derecha">{importe(c.miParte, ocultos)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Vencimientos({ r, ocultos }: { r: ResultadoVencimientos; ocultos: boolean }) {
  const pronto = r.proximos.filter((v) => v.pronto);
  const total = Math.round(r.proximos.reduce((s, v) => s + v.miParte, 0) * 100) / 100;
  return (
    <section className="modulo" aria-labelledby="vencimientos-titulo">
      <div className="modulo-cabecera">
        <h2 id="vencimientos-titulo">Vencimientos</h2>
        <p className="cabecera-dato">
          Próximos {VENTANA_DIAS} días: <strong>{importe(total, ocultos)}</strong>
        </p>
      </div>
      {r.sinColumnaDia && (
        <p className="aviso aviso-suave">
          <Icono nombre="alerta" tam={18} />
          <span>A tblProgramados (hoja Previsión) le falta la columna «Día»: los pagos de Previsión salen el día 1.</span>
        </p>
      )}
      {r.proximos.length === 0 ? (
        <p className="vacio">Nada en los próximos {VENTANA_DIAS} días.</p>
      ) : (
        <>
          <p className="nota">
            {pronto.length === 0
              ? `Nada en los próximos ${AVISO_PRONTO} días.`
              : pronto.length === 1
                ? `1 en los próximos ${AVISO_PRONTO} días.`
                : `${pronto.length} en los próximos ${AVISO_PRONTO} días.`}{" "}
            Importes de tu parte.
          </p>
          <ul className="filas filas-fechas">
            {r.proximos.map((v, i) => (
              <Fila v={v} ocultos={ocultos} key={`${v.fecha}-${v.concepto}-${i}`} />
            ))}
          </ul>
        </>
      )}
      <Detectados lista={r.repetidos} ocultos={ocultos} />
      <p className="modulo-pie">
        Previsión: tu tabla tblProgramados. Detectados: cargos de al menos 3 meses con importe estable; su fecha es estimada.
      </p>
    </section>
  );
}
