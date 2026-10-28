import "server-only";
import { GoogleReconectar } from "@/lib/google";

// Drive con permiso drive.file: solo los ficheros que el usuario eligió con el selector de Google.
// Se lee el fichero en memoria y no se guarda en ningún sitio.

const API = "https://www.googleapis.com/drive/v3";
export const MAX_EXCEL = 25 * 1024 * 1024;

export const MIMES_EXCEL = [
  "application/vnd.ms-excel.sheet.macroenabled.12", // .xlsm
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
];

export type FicheroDrive = {
  id: string;
  nombre: string;
  mime: string;
  modificado: string; // ISO
  version: string;
  tamano: number;
};

/** El fichero ya no es accesible (borrado, en la papelera o sin permiso): hay que elegirlo otra vez. */
export class FicheroNoDisponible extends Error {}

const ID = /^[A-Za-z0-9_-]{10,200}$/;

export function esIdDrive(id: unknown): id is string {
  return typeof id === "string" && ID.test(id);
}

async function dget(token: string, path: string, params: Record<string, string>) {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) throw new GoogleReconectar("revocado");
  if (res.status === 403 || res.status === 404) throw new FicheroNoDisponible(`Drive ${res.status}`);
  if (!res.ok) throw new Error(`Drive API ${res.status}`);
  return res;
}

export async function metadatos(token: string, id: string): Promise<FicheroDrive> {
  if (!esIdDrive(id)) throw new FicheroNoDisponible("id no válido");
  const r = (await (
    await dget(token, `/files/${id}`, { fields: "id,name,mimeType,modifiedTime,version,size,trashed" })
  ).json()) as { id: string; name: string; mimeType: string; modifiedTime: string; version: string; size?: string; trashed?: boolean };
  if (r.trashed) throw new FicheroNoDisponible("en la papelera");
  return {
    id: r.id,
    nombre: r.name,
    mime: r.mimeType,
    modificado: r.modifiedTime,
    version: r.version,
    tamano: Number(r.size ?? 0),
  };
}

export async function descargar(token: string, f: FicheroDrive): Promise<Uint8Array> {
  if (!MIMES_EXCEL.includes(f.mime)) throw new FicheroNoDisponible("no es un Excel");
  if (f.tamano > MAX_EXCEL) throw new Error("El Excel es demasiado grande");
  const res = await dget(token, `/files/${f.id}`, { alt: "media" });
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_EXCEL) throw new Error("El Excel es demasiado grande");
  return buf;
}
