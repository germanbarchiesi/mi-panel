import type { CargoRepetido, ResultadoVencimientos, Vencimiento } from "@/lib/vencimientos";
import { AVISO_PRONTO, VENTANA_DIAS } from "@/lib/vencimientos";

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

function importe(n: number, ocultos: boolean) {
  return ocultos ? <span className="importe oculto">•••• €</span> : <span className="importe">{EUR.format(n)}</span>;
}

function fecha(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

function cuando(dias: number) {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

const PERIODO: Record<string, string> = { mensual: "mensual", trimestral: "trimestral", anual: "anual", unico: "único" };

function Fila({ v, ocultos }: { v: Vencimiento; ocultos: boolean }) {
  return (
    <li className={v.pronto ? "ev venc pronto" : "ev venc"}>
      <span className="ev-hora venc-fecha">
        {fecha(v.fecha)}
        <span className={v.pronto ? "venc-cuando pronto" : "venc-cuando"}>{cuando(v.dias)}</span>
      </span>
      <span className="ev-titulo">
        {v.concepto}
        <span className="muted small">
          {" "}
          · {v.origen === "prevision" ? "Previsión" : "detectado"} · {PERIODO[v.periodo]}
        </span>
      </span>
      <span className="derecha">{importe(v.miParte, ocultos)}</span>
    </li>
  );
}

function Detectados({ lista, ocultos }: { lista: CargoRepetido[]; ocultos: boolean }) {
  const activos = lista.filter((c) => c.activo);
  if (activos.length === 0) return null;
  return (
    <details className="small">
      <summary className="muted">Cargos repetidos detectados en tus movimientos ({activos.length})</summary>
      <ul className="evs">
        {activos.map((c) => (
          <li className="ev" key={c.descripcion + c.ultimo}>
            <span className="ev-titulo">
              {c.descripcion}
              <span className="muted">
                {" "}
                · {c.periodo} · {c.veces} veces · próximo {fecha(c.proximo)}
                {c.enPrevision && " · ya está en Previsión"}
                {c.miParte <= 0 && " · no te toca a ti"}
              </span>
            </span>
            <span className="derecha">{importe(c.miParte, ocultos)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Vencimientos({ r, ocultos }: { r: ResultadoVencimientos; ocultos: boolean }) {
  const pronto = r.proximos.filter((v) => v.pronto);
  const total = r.proximos.reduce((s, v) => s + v.miParte, 0);
  return (
    <section className="card" aria-label="Vencimientos">
      <h2>Vencimientos · próximos {VENTANA_DIAS} días</h2>
      {r.sinColumnaDia && (
        <p className="aviso small">
          A tblProgramados (hoja Previsión) le falta la columna «Día»: los pagos de Previsión se muestran el día 1.
        </p>
      )}
      {r.proximos.length === 0 ? (
        <p className="muted">Nada en los próximos {VENTANA_DIAS} días.</p>
      ) : (
        <>
          <p className="small">
            {pronto.length > 0 ? (
              <strong className="venc-cuando pronto">
                {pronto.length} en los próximos {AVISO_PRONTO} días
              </strong>
            ) : (
              <span className="muted">Nada en los próximos {AVISO_PRONTO} días.</span>
            )}{" "}
            <span className="muted">· total del periodo, tu parte: {importe(Math.round(total * 100) / 100, ocultos)}</span>
          </p>
          <ul className="evs">
            {r.proximos.map((v, i) => (
              <Fila v={v} ocultos={ocultos} key={`${v.fecha}-${v.concepto}-${i}`} />
            ))}
          </ul>
        </>
      )}
      <p className="muted small">
        Previsión: tu tabla tblProgramados. Detectados: cargos de al menos 3 meses con importe estable; la fecha es
        estimada.
      </p>
      <Detectados lista={r.repetidos} ocultos={ocultos} />
    </section>
  );
}
