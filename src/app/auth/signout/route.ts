import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Solo POST: un enlace GET no puede cerrar la sesión (evita cierres forzados desde otra web).
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
