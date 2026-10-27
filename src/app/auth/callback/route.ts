import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=oauth`);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isOwner(user)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=denied`);
  }

  // Siempre a la raíz: no se acepta ningún parámetro "next" (evita redirecciones abiertas).
  return NextResponse.redirect(`${origin}/`);
}
