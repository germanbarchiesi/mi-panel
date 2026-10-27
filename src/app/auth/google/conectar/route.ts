import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { googleConfig, isOwner } from "@/lib/env";
import { SCOPE_CALENDAR } from "@/lib/google";

// Inicia la conexión con Google Calendar (permiso de solo lectura), con PKCE y "state".
// Es aparte del login: el login solo pide identidad; este permiso se pide cuando hace falta.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return NextResponse.redirect(`${origin}/login`);

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  const params = new URLSearchParams({
    client_id: googleConfig().clientId,
    redirect_uri: `${origin}/auth/google/callback`,
    response_type: "code",
    scope: SCOPE_CALENDAR,
    access_type: "offline", // para recibir refresh token
    prompt: "consent", // fuerza que Google lo entregue siempre
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: user.email ?? "",
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("g_oauth", JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/google",
    maxAge: 600,
  });
  return res;
}
