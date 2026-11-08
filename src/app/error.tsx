"use client";

import { useEffect } from "react";
import { Marca } from "@/components/iconos";

// Error inesperado al cargar una página: se explica qué pasa y cómo seguir, sin detalles internos.
export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="acceso">
      <Marca tam={48} />
      <h1>No se ha podido cargar</h1>
      <p>Algo ha fallado al preparar esta página (normalmente un servicio que no responde). Vuelve a intentarlo en un momento.</p>
      {error.digest && <p className="modulo-pie">Código para los registros de Vercel: {error.digest}</p>}
      <div className="acciones">
        <button className="boton boton-primario" type="button" onClick={() => reset()}>
          Reintentar
        </button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="boton" href="/">
          Ir al inicio
        </a>
      </div>
    </main>
  );
}
