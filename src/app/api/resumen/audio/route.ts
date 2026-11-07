import { MAX_AUDIO, guardarAudio } from "@/lib/resumen-servicio";

// GitHub Actions sube aquí el MP3 con el mismo token, que queda anulado.
export const maxDuration = 30;

export async function POST(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const h = request.headers.get("authorization") ?? "";
  const largo = Number(request.headers.get("content-length") ?? "0");
  const no = (s: number) => new Response("no", { status: s, headers: { "Cache-Control": "no-store" } });
  if (!h.startsWith("Bearer ")) return no(403);
  if (!largo || largo > MAX_AUDIO) return no(413);
  const mp3 = new Uint8Array(await request.arrayBuffer());
  return (await guardarAudio(id, h.slice(7), mp3)) ? new Response(null, { status: 204 }) : no(403);
}
