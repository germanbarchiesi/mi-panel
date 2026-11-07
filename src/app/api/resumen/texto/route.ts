import { entregarTexto } from "@/lib/resumen-servicio";

// GitHub Actions descarga aquí el texto del resumen, una sola vez, con el token en la cabecera
// (así no queda en los registros ni en el historial de la ejecución).
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const h = request.headers.get("authorization") ?? "";
  const texto = h.startsWith("Bearer ") ? await entregarTexto(id, h.slice(7)) : null;
  if (texto === null) return new Response("no", { status: 403, headers: { "Cache-Control": "no-store" } });
  return new Response(texto, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
