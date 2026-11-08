// XML del feed privado de podcast (lógica pura: se prueba con `npm test`).

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function tituloEpisodio(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `Resumen del ${DIAS[dow]} ${d} de ${MESES[m - 1]}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function rss(base: string, episodios: { fecha: string; bytes: number; creado: string }[]): string {
  const items = episodios
    .map((e) => {
      // Si el resumen del día se rehace («Preparar ahora»), es otro episodio: AntennaPod lo descarga
      // de nuevo en vez de quedarse con el audio anterior.
      const v = Date.parse(e.creado) || 0;
      return `    <item>
      <title>${esc(tituloEpisodio(e.fecha))}</title>
      <guid isPermaLink="false">mi-panel-resumen-${e.fecha}-${v}</guid>
      <pubDate>${new Date(e.creado).toUTCString()}</pubDate>
      <enclosure url="${esc(`${base}/${e.fecha}.mp3?v=${v}`)}" length="${e.bytes}" type="audio/mpeg"/>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Mi Panel · Resumen</title>
    <description>Tu resumen de las 7:00. Feed privado.</description>
    <language>es-es</language>
    <itunes:block>yes</itunes:block>
    <itunes:explicit>false</itunes:explicit>
${items}
  </channel>
</rss>
`;
}
