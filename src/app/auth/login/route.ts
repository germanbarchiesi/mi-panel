import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Inicia el flujo OAuth con Google (PKCE) desde el servidor: el navegador no necesita
// hablar con Supabase, así que la CSP puede mantener connect-src 'self'.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      // Solo identidad básica en la fase 1. Calendar y Drive se piden en sus fases.
      scopes: "openid email profile",
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }
  return NextResponse.redirect(data.url);
}
