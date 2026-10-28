import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AuthenticatorTransport } from "@simplewebauthn/server";
import { caducidad, firmar, verificar } from "@/lib/firma";

// Desbloqueo de Finanzas con huella / Windows Hello (WebAuthn, verificación de usuario obligatoria).
// El servidor no entrega ningún dato financiero sin una cookie de desbloqueo válida: no basta con
// ocultarlo en pantalla. El desbloqueo dura 5 minutos.

export const DURACION_DESBLOQUEO = 5 * 60_000;
const COOKIE_DESBLOQUEO = "fin_desbloqueo";
const COOKIE_RETO = "webauthn_reto";
const DURACION_RETO = 3 * 60_000;
/** Para registrar un dispositivo nuevo hay que haber entrado con Google hace poco. */
export const LOGIN_RECIENTE = 10 * 60_000;

const opcionesCookie = (maxAgeMs: number, path = "/") => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path,
  maxAge: Math.floor(maxAgeMs / 1000),
});

export async function desbloqueadoHasta(userId: string): Promise<number | null> {
  const ficha = (await cookies()).get(COOKIE_DESBLOQUEO)?.value;
  return verificar("desbloqueo", ficha, userId) ? caducidad(ficha) : null;
}

export async function desbloquear(userId: string) {
  const caduca = Date.now() + DURACION_DESBLOQUEO;
  (await cookies()).set(COOKIE_DESBLOQUEO, firmar("desbloqueo", "1", userId, caduca), opcionesCookie(DURACION_DESBLOQUEO));
}

export async function bloquear() {
  (await cookies()).delete(COOKIE_DESBLOQUEO);
}

export async function guardarReto(userId: string, tipo: "registro" | "desbloqueo", reto: string) {
  (await cookies()).set(
    COOKIE_RETO,
    firmar(`reto-${tipo}`, reto, userId, Date.now() + DURACION_RETO),
    opcionesCookie(DURACION_RETO, "/api/biometria"),
  );
}

/** Lee y consume el reto (un solo uso). */
export async function tomarReto(userId: string, tipo: "registro" | "desbloqueo"): Promise<string | null> {
  const c = await cookies();
  const ficha = c.get(COOKIE_RETO)?.value;
  c.set(COOKIE_RETO, "", { ...opcionesCookie(0, "/api/biometria"), maxAge: 0 });
  return verificar(`reto-${tipo}`, ficha, userId);
}

/** Origen y RP ID a partir de la petición; exige que el navegador mande el mismo Origin (anti-CSRF). */
export function origenDe(request: Request): { origen: string; rpID: string } | null {
  const url = new URL(request.url);
  const origen = url.origin;
  if (request.headers.get("origin") !== origen) return null;
  return { origen, rpID: url.hostname };
}

export function loginReciente(user: User, ahora = Date.now()): boolean {
  const t = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
  return Number.isFinite(t) && ahora - t <= LOGIN_RECIENTE;
}

export type Credencial = {
  id: string;
  clave_publica: string;
  contador: number;
  transportes: AuthenticatorTransport[];
  nombre: string;
  creado: string;
  usado: string | null;
};

export class FaltaMigracionBiometria extends Error {}

export async function listarCredenciales(supabase: SupabaseClient, userId: string): Promise<Credencial[]> {
  const { data, error } = await supabase
    .from("credenciales_biometria")
    .select("id,clave_publica,contador,transportes,nombre,creado,usado")
    .eq("user_id", userId)
    .order("creado");
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") throw new FaltaMigracionBiometria();
    throw new Error(`Supabase: ${error.message}`);
  }
  return (data ?? []) as Credencial[];
}
