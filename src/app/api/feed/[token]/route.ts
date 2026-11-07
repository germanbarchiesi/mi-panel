import { admin } from "@/lib/admin";
import { comprobarFeed, rss } from "@/lib/feed";
import { DIAS_FEED } from "@/lib/resumen-servicio";
import { addDays, ymdInTz, TZ_BARCELONA } from "@/lib/agenda";

// Feed de podcast privado para AntennaPod: los audios de los últimos 7 días.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.xml$/, "");
  const userId = await comprobarFeed(token);
  if (!userId) return new Response("Not found", { status: 404 });

  const desde = addDays(ymdInTz(Date.now(), TZ_BARCELONA), -DIAS_FEED - 1);
  const db = admin();
  const { data } = await db
    .from("resumenes")
    .select("fecha,audio_path,creado")
    .eq("user_id", userId)
    .gte("fecha", desde)
    .not("audio_path", "is", null)
    .order("fecha", { ascending: false });

  const episodios = await Promise.all(
    (data ?? []).map(async (r) => {
      const carpeta = (r.audio_path as string).split("/")[0];
      const { data: info } = await db.storage.from("audios").list(carpeta, { search: `${r.fecha}.mp3`, limit: 1 });
      return { fecha: r.fecha as string, creado: r.creado as string, bytes: info?.[0]?.metadata?.size ?? 0 };
    }),
  );

  const base = `${new URL(request.url).origin}/api/feed/${token}`;
  return new Response(rss(base, episodios), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
