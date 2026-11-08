import { Icono, Marca } from "@/components/iconos";

type Pagina = "inicio" | "agentes" | "ajustes";

/**
 * Barra superior común. Enlaces normales (no <Link>): Ajustes tiene su propia CSP para el selector de
 * Google y, al salir de ella, la página siguiente debe cargarse entera para no heredarla.
 */
export function Cabecera({ actual, novedades = 0 }: { actual: Pagina; novedades?: number }) {
  const actualEs = (p: Pagina) => (actual === p ? ("page" as const) : undefined);
  return (
    <header className="cabecera">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="cabecera-marca" href="/" aria-current={actualEs("inicio")}>
        <Marca tam={30} />
        Mi Panel
      </a>
      <nav className="cabecera-nav" aria-label="Secciones">
        <a className="nav-enlace" href="/agentes" aria-current={actualEs("agentes")}>
          <Icono nombre="agentes" />
          <span className="nav-texto">Agentes</span>
          {novedades > 0 && (
            <span className="contador">
              {novedades}
              <span className="solo-lector"> con novedades</span>
            </span>
          )}
        </a>
        <a className="nav-enlace" href="/ajustes" aria-current={actualEs("ajustes")}>
          <Icono nombre="ajustes" />
          <span className="nav-texto">Ajustes</span>
        </a>
        <form action="/auth/signout" method="post">
          <button className="nav-enlace" type="submit">
            <Icono nombre="salir" />
            <span className="nav-texto">Salir</span>
          </button>
        </form>
      </nav>
    </header>
  );
}
