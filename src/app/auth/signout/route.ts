import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Solo POST: un enlace GET no puede cerrar la sesión (evita cierres forzados desde otra web).
// Cierra solo la sesión de este dispositivo: por defecto Supabase las cerraría todas (el móvil
// también). Para cerrarlas todas está el botón de emergencia de Ajustes.
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
