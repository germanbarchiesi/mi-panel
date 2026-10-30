import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";
import { desconectar } from "@/lib/strava";

// Solo POST: revoca el permiso en Strava y borra el token guardado.
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return NextResponse.redirect(`${origin}/login`, { status: 303 });
  await desconectar(supabase, user.id);
  return NextResponse.redirect(`${origin}/ajustes?ok=strava_desconectado#deporte`, { status: 303 });
}
