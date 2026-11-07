import { admin } from "@/lib/admin";
import { comprobarFeed } from "@/lib/feed";

// Audio de un episodio del feed privado.
export async function GET(_: Request, { params }: { params: Promise<{ token: string; archivo: string }> }) {
  const { token, archivo } = await params;
  const m = /^(\d{4}-\d{2}-\d{2})\.mp3$/.exec(archivo);
  const userId = m ? await comprobarFeed(token) : null;
  if (!m || !userId) return new Response("Not found", { status: 404 });

  const db = admin();
  const { data: fila } = await db
    .from("resumenes")
    .select("audio_path")
    .eq("user_id", userId)
    .eq("fecha", m[1])
    .maybeSingle();
  if (!fila?.audio_path) return new Response("Not found", { status: 404 });
  const { data, error } = await db.storage.from("audios").download(fila.audio_path);
  if (error || !data) return new Response("Not found", { status: 404 });
  const bytes = new Uint8Array(await data.arrayBuffer());
  return new Response(bytes, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="resumen-${m[1]}.mp3"`,
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    },
  });
}
