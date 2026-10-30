import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cifrar, descifrar } from "@/lib/cripto";
import type { PuntoEvolucion } from "@/lib/inversiones";

// Foto diaria de la cartera, cifrada (AES-256-GCM, ligada al usuario y a la fecha).
// Solo valor y aportado: ni posiciones ni movimientos.

const aad = (userId: string, fecha: string) => `${userId}|foto|${fecha}`;

export async function leerFotos(supabase: SupabaseClient, userId: string): Promise<PuntoEvolucion[]> {
  const desde = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("fotos_cartera")
    .select("fecha,datos_cifrados")
    .eq("user_id", userId)
    .gte("fecha", desde)
    .order("fecha");
  if (error || !data) return []; // sin migración 0004 o sin fotos: la evolución usa solo el Excel
  const out: PuntoEvolucion[] = [];
  for (const f of data as { fecha: string; datos_cifrados: string }[]) {
    try {
      const d = JSON.parse(descifrar(f.datos_cifrados, aad(userId, f.fecha))) as { v: number; a: number };
      if (Number.isFinite(d.v) && Number.isFinite(d.a)) out.push({ fecha: f.fecha, valor: d.v, aportado: d.a });
    } catch {
      // foto ilegible (p. ej. cambió la clave): se ignora
    }
  }
  return out;
}

/** Guarda (o actualiza) la foto de hoy. No debe romper el panel si falla. */
export async function guardarFoto(supabase: SupabaseClient, userId: string, p: PuntoEvolucion) {
  try {
    await supabase.from("fotos_cartera").upsert({
      user_id: userId,
      fecha: p.fecha,
      datos_cifrados: cifrar(JSON.stringify({ v: p.valor, a: p.aportado }), aad(userId, p.fecha)),
    });
  } catch {
    // sin consecuencias: falta una foto en la evolución
  }
}
