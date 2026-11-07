import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, idPropietario } from "@/lib/admin";
import { cargarAjustesYEstado, guardarCampo } from "@/lib/ajustes";
import { cifrar, descifrar } from "@/lib/cripto";
import { igualesHex, sha256 } from "@/lib/resumen-servicio";

// Feed privado de podcast para AntennaPod. La dirección lleva un token aleatorio (rotable en Ajustes).
// Se guarda cifrado (para poder enseñarte la dirección) y su hash (para comprobarlo sin descifrar).

const AAD = (userId: string) => `${userId}|feed`;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export async function crearFeed(supabase: SupabaseClient, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await guardarCampo(supabase, userId, "feed", { cifrado: cifrar(token, AAD(userId)), hash: sha256(token) });
  if (error) throw new Error("No se pudo guardar el feed");
  return token;
}

export function tokenFeed(userId: string, feed: { cifrado: string } | null): string | null {
  if (!feed) return null;
  try {
    return descifrar(feed.cifrado, AAD(userId));
  } catch {
    return null;
  }
}

/** Comprueba el token de la dirección del feed; devuelve el id del propietario. */
export async function comprobarFeed(token: string): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  const userId = await idPropietario();
  if (!userId) return null;
  const { feed } = await cargarAjustesYEstado(admin(), userId);
  return feed && igualesHex(sha256(token), feed.hash) ? userId : null;
}

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
    .map(
      (e) => `    <item>
      <title>${esc(tituloEpisodio(e.fecha))}</title>
      <guid isPermaLink="false">mi-panel-resumen-${e.fecha}</guid>
      <pubDate>${new Date(e.creado).toUTCString()}</pubDate>
      <enclosure url="${esc(`${base}/${e.fecha}.mp3`)}" length="${e.bytes}" type="audio/mpeg"/>
    </item>`,
    )
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
