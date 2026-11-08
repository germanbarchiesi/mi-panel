"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatHora, ymdInTz } from "@/lib/agenda";

/** Instante actual que se actualiza cada `cada` ms. Empieza en el del servidor (sin desajuste al hidratar). */
function useAhora(inicial: number, cada = 30_000) {
  const [ahora, setAhora] = useState(inicial);
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), cada);
    return () => clearInterval(id);
  }, [cada]);
  return ahora;
}

export function Reloj({ inicial, tz }: { inicial: number; tz: string }) {
  const ahora = useAhora(inicial);
  return <time dateTime={new Date(ahora).toISOString()}>{formatHora(ahora, tz)}</time>;
}

/** Marca amarilla de «ahora» sobre la línea del día. Desaparece al cambiar de día. */
export function MarcaAhora({
  inicial,
  fecha,
  tz,
  desde,
  hasta,
}: {
  inicial: number;
  fecha: string;
  tz: string;
  desde: number;
  hasta: number;
}) {
  const ahora = useAhora(inicial);
  if (ymdInTz(ahora, tz) !== fecha) return null;
  const [h, m] = formatHora(ahora, tz).split(":").map(Number);
  const hora = h + m / 60;
  if (hora < desde || hora > hasta) return null;
  const izquierda = ((hora - desde) / (hasta - desde)) * 100;
  return <span className="linea-ahora" style={{ left: `${izquierda}%` }} aria-hidden="true" />;
}

/**
 * La app instalada se queda abierta en segundo plano: al volver a ella pasados unos minutos
 * (o al día siguiente) se piden los datos de nuevo, para no enseñar la agenda de ayer.
 */
export function Refrescar({ cargado, tz, minutos = 5 }: { cargado: number; tz: string; minutos?: number }) {
  const router = useRouter();
  useEffect(() => {
    let ultimo = cargado;
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (ahora - ultimo > minutos * 60_000 || ymdInTz(ahora, tz) !== ymdInTz(ultimo, tz)) {
        ultimo = ahora;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("pageshow", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("pageshow", alVolver);
    };
  }, [cargado, tz, minutos, router]);
  return null;
}
