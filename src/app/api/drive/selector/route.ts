import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner, pickerConfig } from "@/lib/env";
import { origenDe } from "@/lib/biometria";
import { SCOPE_DRIVE_FILE, accessToken, scopesConcedidos, tieneScope } from "@/lib/google";

// Datos para abrir el selector de Google en el navegador (solo al pulsar «Elegir Excel»).
// El token de acceso dura una hora y solo lo recibe el propietario; no se guarda en el navegador.
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!origenDe(request)) return NextResponse.json({ error: "origen" }, { status: 403, headers: NO_STORE });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return NextResponse.json({ error: "sesion" }, { status: 401, headers: NO_STORE });

  const cfg = pickerConfig();
  if (!cfg) return NextResponse.json({ error: "config" }, { status: 500, headers: NO_STORE });
  if (!tieneScope(await scopesConcedidos(supabase, user.id), SCOPE_DRIVE_FILE)) {
    return NextResponse.json({ error: "sin_drive" }, { status: 403, headers: NO_STORE });
  }
  try {
    const token = await accessToken(supabase, user.id);
    return NextResponse.json({ token, apiKey: cfg.apiKey, appId: cfg.appId }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "google" }, { status: 502, headers: NO_STORE });
  }
}
