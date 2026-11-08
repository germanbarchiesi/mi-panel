"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

// Evolución de la cartera: valor (tinta) frente a lo aportado (gris), un solo eje en euros.
// Forma «énfasis»: la serie que importa en tinta y la de contexto en gris; leyenda siempre visible,
// etiqueta directa solo al final y la tabla completa debajo (el tooltip nunca es la única vía).

export type PuntoCartera = { fecha: string; valor: number; aportado: number };

const EUR0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const COMPACTO = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

const ANCHO = 340;
const ALTO = 168;
const M = { izq: 40, der: 12, arr: 12, aba: 24 };

function mes(ymd: string, anio: "no" | "corto" | "largo" = "no") {
  const [y, m] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    month: "short",
    ...(anio === "no" ? {} : { year: anio === "corto" ? "2-digit" : "numeric" }),
  })
    .format(new Date(Date.UTC(y, m - 1, 15)))
    .replace(/\./g, "");
}

/** Marcas «redondas» del eje (1, 2, 2,5 o 5 por potencia de 10). */
export function marcasEje(min: number, max: number, cuantas = 4): number[] {
  if (!(max > min)) return [min];
  const bruto = (max - min) / cuantas;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto) ?? 10 * pot;
  const marcas: number[] = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) marcas.push(Math.round(v * 100) / 100);
  return marcas;
}

export function GraficoCartera({ puntos }: { puntos: PuntoCartera[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const idAyuda = useId();
  if (puntos.length < 2) return null;

  const valores = puntos.flatMap((p) => [p.valor, p.aportado]);
  const bruto = { min: Math.min(...valores), max: Math.max(...valores) };
  const holgura = (bruto.max - bruto.min || bruto.max || 1) * 0.08;
  const marcas = marcasEje(Math.max(0, bruto.min - holgura), bruto.max + holgura);
  const yMin = Math.min(marcas[0], bruto.min);
  const yMax = Math.max(marcas[marcas.length - 1], bruto.max);

  const x = (i: number) => M.izq + (i / (puntos.length - 1)) * (ANCHO - M.izq - M.der);
  const y = (v: number) => M.arr + (1 - (v - yMin) / (yMax - yMin || 1)) * (ALTO - M.arr - M.aba);
  const trazo = (k: "valor" | "aportado") => puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(" ");

  const ultimo = puntos[puntos.length - 1];
  const activo = sel === null ? null : puntos[sel];
  const etiquetasX = puntos.length <= 4 ? puntos.map((_, i) => i) : [0, Math.floor((puntos.length - 1) / 2), puntos.length - 1];

  function elegirPorPuntero(e: PointerEvent<SVGSVGElement>) {
    const caja = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - caja.left) / caja.width) * ANCHO;
    const i = Math.round(((px - M.izq) / (ANCHO - M.izq - M.der)) * (puntos.length - 1));
    setSel(Math.min(puntos.length - 1, Math.max(0, i)));
  }

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const paso = e.key === "ArrowLeft" ? -1 : 1;
      setSel((s) => Math.min(puntos.length - 1, Math.max(0, (s ?? puntos.length - 1) + (s === null ? 0 : paso))));
    } else if (e.key === "Escape") setSel(null);
  }

  const rent = (p: PuntoCartera) => (p.aportado > 0 ? p.valor / p.aportado - 1 : null);

  return (
    <figure className="grafico-figura">
      <ul className="grafico-leyenda" aria-hidden="true">
        <li>
          <span className="clave clave-valor" /> Valor
        </li>
        <li>
          <span className="clave clave-aportado" /> Aportado
        </li>
      </ul>
      <div
        className="grafico-marco"
        tabIndex={0}
        role="group"
        aria-label={`Evolución de la cartera, ${mes(puntos[0].fecha, "largo")} a ${mes(ultimo.fecha, "largo")}. Valor final ${EUR0.format(ultimo.valor)}, aportado ${EUR0.format(ultimo.aportado)}.`}
        aria-describedby={idAyuda}
        onKeyDown={teclas}
        onBlur={() => setSel(null)}
      >
        <svg
          className="grafico"
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          aria-hidden="true"
          onPointerMove={elegirPorPuntero}
          onPointerDown={elegirPorPuntero}
          onPointerLeave={() => setSel(null)}
        >
          {marcas.map((v) => (
            <g key={v}>
              <line className="grafico-rejilla" x1={M.izq} x2={ANCHO - M.der} y1={y(v)} y2={y(v)} />
              <text className="grafico-eje" x={M.izq - 6} y={y(v)} dy="0.32em" textAnchor="end">
                {COMPACTO.format(v)}
              </text>
            </g>
          ))}
          {etiquetasX.map((i) => (
            <text
              key={i}
              className="grafico-eje"
              x={x(i)}
              y={ALTO - 6}
              textAnchor={i === 0 ? "start" : i === puntos.length - 1 ? "end" : "middle"}
            >
              {mes(puntos[i].fecha, i === 0 || i === puntos.length - 1 ? "corto" : "no")}
            </text>
          ))}
          <path className="grafico-aportado" d={trazo("aportado")} />
          <path className="grafico-valor" d={trazo("valor")} />
          {activo && sel !== null && <line className="grafico-cursor" x1={x(sel)} x2={x(sel)} y1={M.arr} y2={ALTO - M.aba} />}
          {(activo && sel !== null ? [sel] : [puntos.length - 1]).map((i) => (
            <g key={`p${i}`}>
              <circle className="grafico-punto grafico-punto-aportado" cx={x(i)} cy={y(puntos[i].aportado)} r={4} />
              <circle className="grafico-punto" cx={x(i)} cy={y(puntos[i].valor)} r={4.5} />
            </g>
          ))}
        </svg>
        {activo && sel !== null && (
          <div
            className="grafico-tooltip"
            style={{ left: `${(x(sel) / ANCHO) * 100}%` }}
            data-lado={sel > (puntos.length - 1) / 2 ? "izq" : "der"}
            role="status"
          >
            <span className="tooltip-fecha">{mes(activo.fecha, "largo")}</span>
            <span className="tooltip-fila">
              <span className="clave clave-valor" />
              <strong>{EUR0.format(activo.valor)}</strong> valor
            </span>
            <span className="tooltip-fila">
              <span className="clave clave-aportado" />
              <strong>{EUR0.format(activo.aportado)}</strong> aportado
            </span>
            {rent(activo) !== null && <span className="tooltip-fila tooltip-rent">{PCT.format(rent(activo) as number)} sobre lo aportado</span>}
          </div>
        )}
      </div>
      <figcaption id={idAyuda} className="modulo-pie">
        Último mes: {EUR0.format(ultimo.valor)} de valor y {EUR0.format(ultimo.aportado)} aportados. Pasa el dedo o usa las flechas
        para ver cada mes.
      </figcaption>
    </figure>
  );
}
