import test from "node:test";
import assert from "node:assert/strict";

// Cliente de la API con fetch simulado: cabecera, parámetros, caché, errores y límite.
const CLAVE = "mt_" + "a".repeat(64);
process.env.MIS_TAREAS_API_URL = "https://mis-tareas.example.com/";
process.env.MIS_TAREAS_API_KEY = CLAVE;

const { pedirOcupado, pedirResumen, urlMisTareas } = await import("./mis-tareas-api.ts");

type Llamada = { url: string; init: RequestInit };
const llamadas: Llamada[] = [];
let respuesta: () => Response = () => new Response("{}");
globalThis.fetch = (async (url: string, init: RequestInit) => {
  llamadas.push({ url, init });
  return respuesta();
}) as typeof fetch;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const RESUMEN = { version: 1, fecha: "2026-10-01", zona_horaria: "Europe/Madrid", pendientes_hoy: [], arrastradas: [], temas_por_persona: [] };

test("llama desde el servidor con Bearer, no-store, sin seguir redirecciones y con la fecha de Mi Panel", async () => {
  respuesta = json(RESUMEN);
  const r = await pedirResumen("2026-10-01", "trabajo");
  assert.equal(r.ok, true);
  const { url, init } = llamadas.at(-1)!;
  assert.equal(url, "https://mis-tareas.example.com/api/v1/resumen?fecha=2026-10-01&ambito=trabajo");
  assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${CLAVE}`);
  assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error");
  assert.equal(urlMisTareas(), "https://mis-tareas.example.com");
});

test("caché en memoria: la segunda petición igual no vuelve a llamar", async () => {
  respuesta = json({ ...RESUMEN, fecha: "2026-10-02" });
  const antes = llamadas.length;
  await pedirResumen("2026-10-02");
  await pedirResumen("2026-10-02");
  assert.equal(llamadas.length, antes + 1);
});

test("/ocupado limita dias a 14", async () => {
  respuesta = json({ version: 1, desde: "2026-10-03", dias: 14, zona_horaria: "Europe/Madrid", ocupado: [] });
  await pedirOcupado("2026-10-03", 30);
  assert.match(llamadas.at(-1)!.url, /\/api\/v1\/ocupado\?desde=2026-10-03&dias=14$/);
});

test("errores: 401 clave, 400 petición, 503 caído, JSON raro respuesta, red caída", async () => {
  respuesta = json({ error: "x" }, 401);
  assert.deepEqual(await pedirResumen("2026-10-04"), { ok: false, fallo: "clave" });
  respuesta = json({ error: "x" }, 400);
  assert.deepEqual(await pedirResumen("2026-10-05"), { ok: false, fallo: "peticion" });
  respuesta = json({ error: "x" }, 503);
  assert.deepEqual(await pedirResumen("2026-10-06"), { ok: false, fallo: "caido" });
  respuesta = () => new Response("<html>", { status: 200 });
  assert.deepEqual(await pedirResumen("2026-10-07"), { ok: false, fallo: "respuesta" });
  respuesta = () => {
    throw new TypeError("fetch failed");
  };
  assert.deepEqual(await pedirResumen("2026-10-08"), { ok: false, fallo: "red" });
});

test("429: respeta Retry-After y no vuelve a llamar mientras tanto", async () => {
  respuesta = json({ error: "x" }, 429, { "retry-after": "60" });
  assert.deepEqual(await pedirResumen("2026-10-09"), { ok: false, fallo: "limite" });
  const antes = llamadas.length;
  assert.deepEqual(await pedirResumen("2026-10-10"), { ok: false, fallo: "limite" });
  assert.equal(llamadas.length, antes);
});

test("sin clave válida no llama", async () => {
  process.env.MIS_TAREAS_API_KEY = "no-es-una-clave";
  const antes = llamadas.length;
  assert.deepEqual(await pedirResumen("2026-10-11"), { ok: false, fallo: "sin_configurar" });
  assert.equal(llamadas.length, antes);
  assert.equal(urlMisTareas(), null);
  process.env.MIS_TAREAS_API_KEY = CLAVE;
});
