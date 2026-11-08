import type { Reparto, ResumenInversiones } from "@/lib/inversiones";
import { GraficoCartera } from "@/components/grafico-cartera";
import { Icono } from "@/components/iconos";

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const EUR0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
const PCT0 = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 0 });

function eur(n: number, ocultos: boolean, redondo = false) {
  if (ocultos) return <span className="importe oculto">•••• €</span>;
  return <span className="importe">{(redondo ? EUR0 : EUR).format(n)}</span>;
}

function signo(n: number | null) {
  if (n === null) return "—";
  return <span className={n >= 0 ? "positivo" : "negativo"}>{PCT.format(n)}</span>;
}

function fechaCorta(ymd: string | null) {
  if (!ymd) return "sin fecha";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(new Date(Date.UTC(y, m - 1, d, 12)))
    .replace(/\./g, "");
}

function mesCorto(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", month: "short", year: "2-digit" })
    .format(new Date(Date.UTC(y, m - 1, 15)))
    .replace(/\./g, "");
}

/** Barras de un reparto sobre el 100 % de su grupo; con objetivo, una marca vertical donde debería estar. */
function Barras({ items, ocultos, conObjetivo = false }: { items: Reparto[]; ocultos: boolean; conObjetivo?: boolean }) {
  const escala = 1;
  return (
    <ul className="reparto">
      {items.map((r) => (
        <li key={r.nombre} className={conObjetivo && r.fueraDeBanda ? "fuera" : undefined}>
          <span className="reparto-nombre">
            {r.nombre}
            {conObjetivo && r.fueraDeBanda && (
              <>
                {" "}
                <span className="etiqueta etiqueta-riesgo">Fuera de banda</span>
              </>
            )}
          </span>
          <span className="reparto-cifra">
            {PCT0.format(r.peso)}
            {conObjetivo ? (
              <small>objetivo {PCT0.format(r.objetivo ?? 0)}</small>
            ) : (
              <small>{eur(r.valor, ocultos, true)}</small>
            )}
          </span>
          <span className="reparto-barra" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (r.peso / escala) * 100)}%` }} />
            {conObjetivo && r.objetivo !== null && (
              <span className="reparto-objetivo" style={{ left: `${Math.min(100, (r.objetivo / escala) * 100)}%` }} />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Inversiones({ r, ocultos }: { r: ResumenInversiones | null; ocultos: boolean }) {
  if (!r) {
    return (
      <section className="modulo" aria-labelledby="inversiones-titulo">
        <h2 id="inversiones-titulo">Inversiones</h2>
        <p className="error">No se han podido calcular las inversiones ahora mismo.</p>
      </section>
    );
  }
  if (!r.hayPosiciones) {
    return (
      <section className="modulo" aria-labelledby="inversiones-titulo">
        <h2 id="inversiones-titulo">Inversiones</h2>
        <p className="vacio">
          Sin posiciones. Aparecerán cuando importes tu primer CSV de Trade Republic o añadas activos en la hoja Activos del Excel.
        </p>
      </section>
    );
  }

  const evolucion = [...r.evolucionMensual].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return (
    <section className="modulo" aria-labelledby="inversiones-titulo">
      <div className="modulo-cabecera">
        <h2 id="inversiones-titulo">Inversiones</h2>
        {r.rentabilidad !== null && (
          <p className="cabecera-dato">
            <strong>{signo(r.rentabilidad)}</strong> sobre lo aportado
          </p>
        )}
      </div>

      <dl className="cifras">
        <div>
          <dt>Valor</dt>
          <dd>{eur(r.valor, ocultos, true)}</dd>
        </div>
        <div>
          <dt>Ganancia</dt>
          <dd>{eur(r.ganancia, ocultos, true)}</dd>
        </div>
        <div>
          <dt>Aportado neto</dt>
          <dd>{eur(r.aportado, ocultos, true)}</dd>
        </div>
        <div>
          <dt>En el año</dt>
          <dd>{r.rentAnio ? signo(r.rentAnio.rentabilidad) : "—"}</dd>
        </div>
      </dl>
      <p className="nota">
        {r.rentAnio ? (
          <>
            Desde el {fechaCorta(r.rentAnio.desde)}: {eur(r.rentAnio.ganancia, ocultos, true)}, aproximado.
          </>
        ) : (
          "Rentabilidad del año: aún no hay foto de inicio de año."
        )}
        {r.tir !== null && <> TIR anual del Excel: {signo(r.tir)}.</>}
        {r.liquidez > 0 && <> Sin invertir: {eur(r.liquidez, ocultos, true)}.</>}
      </p>

      {r.alertas.length > 0 && (
        <div className="aviso" role="status">
          <Icono nombre="alerta" tam={18} />
          <ul className="alertas">
            {r.alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {r.objetivos.length > 0 && (
        <div className="grupo">
          <h3>Largo plazo frente a tu objetivo</h3>
          <Barras items={r.objetivos} ocultos={ocultos} conObjetivo />
        </div>
      )}

      <details className="desplegable">
        <summary>Reparto por clase{r.porBolsa.length > 1 ? " y por bolsa" : ""}</summary>
        <div className="grupo">
          <Barras items={r.porClase} ocultos={ocultos} />
        </div>
        {r.porBolsa.length > 1 && (
          <div className="grupo">
            <h3>Largo plazo y colchón</h3>
            <Barras items={r.porBolsa} ocultos={ocultos} />
          </div>
        )}
      </details>

      {evolucion.length > 1 && (
        <div className="grupo">
          <h3>Evolución mensual</h3>
          {ocultos ? (
            <p className="nota">Gráfico oculto mientras los importes están ocultos.</p>
          ) : (
            <GraficoCartera puntos={evolucion} />
          )}
          <details className="desplegable">
            <summary>Ver la tabla</summary>
            <ul className="filas filas-mes">
              {[...evolucion].reverse().map((p) => (
                <li className="fila" key={p.fecha}>
                  <span className="fila-hora">{mesCorto(p.fecha)}</span>
                  <span aria-hidden="true" />
                  <span className="fila-cuerpo">
                    <span className="fila-titulo">{eur(p.valor, ocultos, true)}</span>
                    <span className="fila-meta">aportado {eur(p.aportado, ocultos, true)}</span>
                  </span>
                  <span className="fila-derecha">{signo(p.aportado > 0 ? p.valor / p.aportado - 1 : null)}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {r.posiciones.length > 0 && (
        <details className="desplegable">
          <summary>Posiciones ({r.posiciones.length})</summary>
          <ul className="filas filas-mes">
            {r.posiciones.map((p) => (
              <li className="fila" key={p.activo}>
                <span className="fila-hora">{PCT0.format(p.peso)}</span>
                <span aria-hidden="true" />
                <span className="fila-cuerpo">
                  <span className="fila-titulo">{p.activo}</span>
                  <span className="fila-meta">
                    {p.origenPrecio === "excel" && `Precio del Excel (${fechaCorta(p.fechaPrecio)})`}
                    {p.origenPrecio === "sin precio" && "Sin precio: valorado a coste"}
                    {p.origenPrecio === "mercado" && `Cierre del ${fechaCorta(p.fechaPrecio)}`}
                  </span>
                </span>
                <span className="fila-derecha">
                  {eur(p.valor, ocultos, true)}
                  <small>{signo(p.rentabilidad)}</small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="modulo-pie">
        Precios: Yahoo (ETF y acciones) y Kraken (cripto), como mucho cada 6 h; si fallan, el del Excel con su fecha. Posiciones y
        aportado: tu Excel.
      </p>
    </section>
  );
}
