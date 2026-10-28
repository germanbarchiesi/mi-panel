import "server-only";
import { cookies } from "next/headers";

// Marca de este dispositivo como «PC de Appliant». Es una preferencia por equipo (cookie httpOnly),
// no un control de seguridad: el modo trabajo completo (finanzas bloqueadas en el servidor) es la fase 10.
export const COOKIE_EQUIPO = "equipo";

export async function esEquipoTrabajo(): Promise<boolean> {
  return (await cookies()).get(COOKIE_EQUIPO)?.value === "trabajo";
}

export async function marcarEquipoTrabajo(activo: boolean) {
  const c = await cookies();
  if (activo) {
    c.set(COOKIE_EQUIPO, "trabajo", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  } else {
    c.delete(COOKIE_EQUIPO);
  }
}
