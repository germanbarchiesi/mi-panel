import type { Reparto, ResumenInversiones } from "@/lib/inversiones";

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
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

function mesCorto(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", month: "short", year: "2-digit" }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );
}

function Barras({ items, ocultos }: { items: Reparto[]; ocultos: boolean }) {
  return (
    <ul className="evs">
      {items.map((r) => (
        <li className="ev reparto" key={r.nombre}>
          <span className="ev-titulo">
            {r.nombre}
            <span className="barra" aria-hidden="true">
              <span style={{ width: `${Math.round(r.peso * 100)}%` }} />
            </span>
          </span>
          <span className="derecha">
            {PCT0.format(r.peso)} <span className="muted small">{eur(r.valor, ocultos, true)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Inversiones({ r, ocultos }: { r: ResumenInversiones | null; ocultos: boolean }) {
  if (!r) {
    return (
      <section className="card" aria-label="Inversiones">
        <h2>Inversiones</h2>
        <p className="error">No se pudieron calcular las inversiones ahora mismo.</p>
      </section>
    );
  }
  if (!r.hayPosiciones) {
    return (
      <section className="card" aria-label="Inversiones">
        <h2>Inversiones</h2>
        <p className="muted">
          Sin posiciones. Aparecerán cuando importes tu primer CSV de Trade Republic o añadas activos en la hoja
          Activos del Excel.
        </p>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Inversiones">
      <h2>Inversiones</h2>

      <div className="metricas">
        <div className="metrica">
          <span>Valor</span>
          <strong>{eur(r.valor, ocultos)}</strong>
        </div>
        <div className="metrica">
          <span>Aportado neto</span>
          <strong>{eur(r.aportado, ocultos)}</strong>
        </div>
        <div className="metrica">
          <span>Ganancia</span>
          <strong>{eur(r.ganancia, ocultos)}</strong>
        </div>
        <div className="metrica">
          <span>Rentabilidad</span>
          <strong>{signo(r.rentabilidad)}</strong>
        </div>
      </div>
      <p className="muted small">
        {r.rentAnio ? (
          <>
            En el año (desde el {fechaCorta(r.rentAnio.desde)}): {eur(r.rentAnio.ganancia, ocultos, true)} (
            {signo(r.rentAnio.rentabilidad)}, aprox.)
          </>
        ) : (
          "Rentabilidad del año: sin foto de inicio de año todavía"
        )}
        {r.tir !== null && <> · TIR anual del Excel {signo(r.tir)}</>}
        {r.liquidez > 0 && <> · sin invertir {eur(r.liquidez, ocultos, true)}</>}
      </p>

      {r.alertas.length > 0 && (
        <ul className="aviso small alertas">
          {r.alertas.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {r.porBolsa.length > 1 && (
        <>
          <p className="etiqueta">Largo plazo y colchón</p>
          <Barras items={r.porBolsa} ocultos={ocultos} />
        </>
      )}

      <p className="etiqueta">Reparto por clase</p>
      <Barras items={r.porClase} ocultos={ocultos} />

      {r.objetivos.length > 0 && (
        <>
          <p className="etiqueta">Largo plazo frente a tu objetivo</p>
          <ul className="evs">
            {r.objetivos.map((o) => (
              <li className={o.fueraDeBanda ? "ev fuera" : "ev"} key={o.nombre}>
                <span className="ev-titulo">{o.nombre}</span>
                <span className="derecha small">
                  {PCT0.format(o.peso)} <span className="muted">/ {PCT0.format(o.objetivo ?? 0)}</span>{" "}
                  {o.desvio !== null && Math.abs(o.desvio) >= 0.005 && signo(o.desvio)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.posiciones.length > 0 && (
        <>
          <p className="etiqueta">Posiciones</p>
          <ul className="evs">
            {r.posiciones.map((p) => (
              <li className="ev posicion" key={p.activo}>
                <span className="ev-titulo">
                  {p.activo}
                  <span className="muted small">
                    {" "}
                    · {PCT0.format(p.peso)}
                    {p.origenPrecio === "excel" && ` · precio del Excel (${fechaCorta(p.fechaPrecio)})`}
                    {p.origenPrecio === "sin precio" && " · sin precio: valorado a coste"}
                    {p.origenPrecio === "mercado" && ` · cierre ${fechaCorta(p.fechaPrecio)}`}
                  </span>
                </span>
                <span className="derecha posicion-cifras">
                  {eur(p.valor, ocultos, true)}
                  <span className="small">{signo(p.rentabilidad)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.evolucionMensual.length > 1 && (
        <>
          <p className="etiqueta">Evolución mensual</p>
          <ul className="evs">
            {[...r.evolucionMensual].reverse().map((p) => (
              <li className="ev" key={p.fecha}>
                <span className="ev-hora">{mesCorto(p.fecha)}</span>
                <span className="ev-titulo">{eur(p.valor, ocultos, true)}</span>
                <span className="derecha small muted">
                  aportado {eur(p.aportado, ocultos, true)} · {signo(p.aportado > 0 ? p.valor / p.aportado - 1 : null)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted small">
        Precios: Yahoo (ETF y acciones) y Kraken (cripto), como mucho cada 6 h. Si fallan, el del Excel con su fecha.
        Posiciones y aportado: tu Excel.
      </p>
    </section>
  );
}
