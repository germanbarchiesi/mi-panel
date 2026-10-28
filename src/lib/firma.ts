import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// Fichas firmadas (HMAC-SHA256) para cookies de corta duración: desbloqueo de Finanzas y retos
// de WebAuthn. La clave se deriva de TOKEN_ENCRYPTION_KEY con HKDF, separada por propósito,
// así una ficha de un tipo nunca vale para otro.

function clave(proposito: string): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Falta la variable de entorno TOKEN_ENCRYPTION_KEY");
  const base = Buffer.from(raw, "base64");
  if (base.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY debe ser 32 bytes en base64");
  return Buffer.from(hkdfSync("sha256", base, Buffer.alloc(0), `mi-panel:${proposito}`, 32));
}

const SEGMENTO = /^[A-Za-z0-9_-]{1,512}$/;

/** "<valor>.<caduca>.<firma>"; valor sin puntos (base64url o uuid). */
export function firmar(proposito: string, valor: string, sujeto: string, caducaMs: number): string {
  if (!SEGMENTO.test(valor)) throw new Error("Valor no firmable");
  const cuerpo = `${valor}.${caducaMs}`;
  const sig = createHmac("sha256", clave(proposito)).update(`${sujeto}|${cuerpo}`).digest("base64url");
  return `${cuerpo}.${sig}`;
}

/** Devuelve el valor si la firma es buena, es del sujeto y no ha caducado; si no, null. */
export function verificar(proposito: string, ficha: string | undefined, sujeto: string, ahora = Date.now()): string | null {
  if (!ficha) return null;
  const partes = ficha.split(".");
  if (partes.length !== 3) return null;
  const [valor, caduca, sig] = partes;
  if (!SEGMENTO.test(valor) || !/^\d{1,15}$/.test(caduca)) return null;
  const esperada = createHmac("sha256", clave(proposito)).update(`${sujeto}|${valor}.${caduca}`).digest();
  const dada = Buffer.from(sig, "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  if (Number(caduca) <= ahora) return null;
  return valor;
}

export function caducidad(ficha: string | undefined): number | null {
  const c = ficha?.split(".")[1];
  return c && /^\d{1,15}$/.test(c) ? Number(c) : null;
}
