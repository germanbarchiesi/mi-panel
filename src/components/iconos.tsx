// Iconos de trazo (24×24, currentColor). Decorativos por defecto: el texto o el aria-label
// del control que los contiene es lo que se lee.

const TRAZOS = {
  // Ajustes: tres reguladores.
  ajustes: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  // Agentes: punto con dos ondas.
  agentes: "M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 18.6a9.4 9.4 0 0 1 0-13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2",
  candado: "M6.5 11h11v8.5h-11zM8.75 11V8a3.25 3.25 0 0 1 6.5 0v3",
  abierto: "M6.5 11h11v8.5h-11zM8.75 11V8a3.25 3.25 0 0 1 6.3-1.1",
  ojo: "M2.75 12S6 5.75 12 5.75 21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12ZM12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z",
  ojoTachado: "M3.5 3.5l17 17M10.1 6.1A9.6 9.6 0 0 1 12 5.75C18 5.75 21.25 12 21.25 12a16 16 0 0 1-2.9 3.7M6.2 7.6A15.6 15.6 0 0 0 2.75 12S6 18.25 12 18.25a9 9 0 0 0 4-.9M10 10.1a2.75 2.75 0 0 0 3.9 3.9",
  play: "M8 5.5v13l10.5-6.5z",
  parar: "M7 7h10v10H7z",
  externo: "M13.5 5.5h5v5M18.5 5.5l-8 8M17 14v4.5H5.5V7H10",
  atras: "M14.5 5.5L8 12l6.5 6.5",
  check: "M5.5 12.5l4.25 4.25L18.5 8",
  cruz: "M7 7l10 10M17 7L7 17",
  mas: "M12 6v12M6 12h12",
  alerta: "M12 4.5l8.5 15h-17zM12 10v4.25M12 16.75v.25",
  campana: "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5zM10 20.25h4",
  repetir: "M17.5 9.5A6 6 0 0 0 6.6 8.2M6.5 14.5a6 6 0 0 0 10.9 1.3M17.75 5v4.75H13M6.25 19v-4.75H11",
  huella: "M8.2 19.6a10 10 0 0 0 1.3-5.1v-2.1a2.5 2.5 0 0 1 5 0v1.1M12 12.5v2a13 13 0 0 1-1.5 6M16.9 18.3c.4-1.3.6-2.6.6-4V12.4a5.5 5.5 0 0 0-11 0v2.1a7 7 0 0 1-.9 3.4M5.6 8.6A7.9 7.9 0 0 1 19.4 9",
  salir: "M14 5.5H5.5v13H14M10 12h10M16.5 8.5 20 12l-3.5 3.5",
  siguiente: "M9.5 5.5 16 12l-6.5 6.5",
  copiar: "M9 9h10v10H9zM5 15V5h10",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tam = 20, titulo }: { nombre: NombreIcono; tam?: number; titulo?: string }) {
  const relleno = nombre === "play" || nombre === "parar";
  return (
    <svg
      className="icono"
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill={relleno ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={relleno ? 0 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : true}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      focusable="false"
    >
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}

/** Marca de Mi Panel: una manzana del Eixample (esquinas en chaflán) cruzada por la línea del día. */
export function Marca({ tam = 28 }: { tam?: number }) {
  return (
    <svg className="marca-svg" width={tam} height={tam} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M9 2h14l7 7v14l-7 7H9l-7-7V9z" fill="var(--tinta)" />
      <rect x="6" y="14" width="20" height="4" fill="var(--superficie)" />
      <rect x="18.5" y="9" width="3" height="14" fill="var(--ahora)" />
    </svg>
  );
}
