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

export { rss, tituloEpisodio } from "./feed-rss.ts";
