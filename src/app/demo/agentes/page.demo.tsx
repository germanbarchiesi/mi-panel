// Demostración de /agentes (solo con `next dev`). ?estado=sin_drive|sin_carpeta|error
import { AGENTES, type Tarjeta } from "@/lib/agentes";
import type { ResultadoAgentes } from "@/lib/agentes-loader";
import { PaginaAgentes } from "@/components/agentes";

function ahoraMs() {
  return Date.now();
}

export default async function DemoAgentes({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const ahora = ahoraMs();
  let r: ResultadoAgentes;
  if (estado === "sin_drive" || estado === "sin_carpeta" || estado === "error") r = { estado };
  else {
    const resultados: Record<string, Tarjeta["resultado"]> = {
      vuelos: {
        ejecutado: ahora - 26 * 3600e3,
        estado: "novedad",
        titular: "BCN–BKK ida y vuelta en noviembre de 2027 desde 612 € con una escala",
        puntos: ["Qatar Airways vía Doha, 18 h 40 min", "Bajó 48 € desde la semana pasada", "Directo con Thai: 940 €"],
        enlace: "https://www.example.com/vuelos",
      },
      yipeng: { ejecutado: ahora - 7 * 86400e3, estado: "sin_novedades", titular: "Aún no hay fechas oficiales del Yi Peng 2027", puntos: [], enlace: null },
      regalo: { ejecutado: ahora - 2 * 86400e3, estado: "alerta", titular: "El kit de LEGO Technic que mirabas baja a 89 € hasta el domingo", puntos: ["Precio habitual: 129 €"], enlace: "https://www.example.com/lego" },
      inversiones: null,
    };
    r = {
      estado: "ok",
      tarjetas: AGENTES.map((a) => ({ ...a, resultado: resultados[a.clave] ?? null, proxima: ahora + 3 * 86400e3, ficheroCreado: true })),
    };
  }
  return <PaginaAgentes r={r} ahora={ahora} tz="Europe/Madrid" privadasOcultas={false} horaLocal={false} />;
}
