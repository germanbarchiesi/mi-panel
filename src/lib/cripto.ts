import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. La clave vive solo en las variables de entorno de Vercel.
// "aad" (el id del usuario) liga el texto cifrado a su dueño: si alguien copiara la fila a otro usuario, no descifraría.

function clave(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Falta la variable de entorno TOKEN_ENCRYPTION_KEY");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY debe ser 32 bytes en base64");
  return key;
}

export function cifrar(texto: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function descifrar(valor: string, aad: string): string {
  const [v, iv, tag, enc] = valor.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Formato de dato cifrado no válido");
  const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64"));
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}
